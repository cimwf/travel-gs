#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');

let app;
let currentPage;
let storage;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function resetRuntime() {
  storage = {};
  app = {
    globalData: {
      openid: 'openid-test',
      attractions: [],
      attractionsLoaded: true
    },
    getAttractions: async () => [],
    getOpenid: async () => 'openid-test'
  };

  global.getApp = () => app;
  global.getCurrentPages = () => [{}];
  global.Page = (definition) => {
    currentPage = definition;
    currentPage.setData = function setData(patch) {
      this.data = { ...this.data, ...patch };
    };
  };
  global.wx = {
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    removeStorageSync: (key) => { delete storage[key]; },
    getWindowInfo: () => ({ statusBarHeight: 24 }),
    setNavigationBarTitle: () => {},
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
    navigateTo: () => {},
    switchTab: () => {},
    cloud: {
      callFunction: async () => ({ result: { success: true, trips: [] } }),
      getTempFileURL: async ({ fileList = [] } = {}) => ({
        fileList: fileList.map((fileID) => ({ fileID, tempFileURL: `https://temp.example.com/${fileID}` }))
      })
    }
  };
}

function clearLocalRequireCache() {
  Object.keys(require.cache).forEach((file) => {
    if (file.startsWith(root)) delete require.cache[file];
  });
}

function loadPage(relativePath) {
  resetRuntime();
  clearLocalRequireCache();
  currentPage = null;
  require(path.join(miniRoot, relativePath));
  assert(currentPage, `Page not registered: ${relativePath}`);
  return currentPage;
}

function assertIncludes(source, needle, label = needle) {
  assert(source.includes(needle), `missing ${label}`);
}

function assertNotIncludes(source, needle, label = needle) {
  assert(!source.includes(needle), `unexpected ${label}`);
}

function assertRegex(source, regex, label = String(regex)) {
  assert(regex.test(source), `missing pattern ${label}`);
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('requirements use current manual tripStage model only', () => {
  const requirements = read('docs/trip-log-mvp/trip-log-requirements.md');

  assertIncludes(requirements, "tripStage: 'not_started' | 'ongoing' | 'ended' | 'cancelled'");
  assertIncludes(requirements, "status: 'open' | 'stopped'");
  assertIncludes(requirements, '系统不自动开始行程，也不自动结束行程。');
  assertIncludes(requirements, '我的行程页不要求改成首页同款状态筛选结构。');
  assertIncludes(requirements, '授权人数上限来自数据库配置或行程快照。');
  assertIncludes(requirements, '`logMaxCount` 从数据库配置或行程快照读取。');

  ['logStatus', 'logAutoEndDays', 'logAutoEndAt', '历史文档', '废弃'].forEach((needle) => {
    assertNotIncludes(requirements, needle);
  });
});

test('test cases keep my-trips identity tabs but require status display consistency', () => {
  const cases = read('docs/trip-log-mvp/trip-status-log-test-cases.md');

  assertIncludes(cases, '### TC-011 我的行程页状态展示一致性');
  assertIncludes(cases, '我的行程页保留身份维度 tab：全部、我发起的、我参与的、已结束。');
  assertIncludes(cases, '我的行程页不要求改成首页同款状态筛选结构。');
  assertIncludes(cases, '相同状态在两个页面展示文案一致。');
  assertNotIncludes(cases, '相同筛选项在两个页面过滤结果一致。');
  assertNotIncludes(cases, '分别点击全部、招募中、即将满员、已满员、进行中、已结束。');
});

test('cloud function has no auto-end or independent logStatus business logic', () => {
  const api = read('cloudfunctions/api/index.js');

  ['logStatus', 'logAutoEndDays', 'logAutoEndAt', 'autoEnd', 'checkAutoEnd'].forEach((needle) => {
    assertNotIncludes(api, needle);
  });
});

test('trip create reads log limits from system_config snapshot', () => {
  const api = read('cloudfunctions/api/index.js');

  assertIncludes(api, "db.collection('system_config').doc('trip_log').get()");
  assertIncludes(api, 'tripLogConfig.logPublisherLimit');
  assertIncludes(api, 'tripLogConfig.logMaxCount');
  assertIncludes(api, 'logPublisherLimit: tripLogConfig.logPublisherLimit');
  assertIncludes(api, 'logMaxCount: tripLogConfig.logMaxCount');
});

test('trip status update keeps cancelled in tripStage and validates status whitelist', () => {
  const api = read('cloudfunctions/api/index.js');

  assertIncludes(api, "const allowedStatus = ['open', 'stopped', 'cancelled'];");
  assertIncludes(api, '!allowedStatus.includes(status)');
  assertIncludes(api, "status === 'cancelled'");
  assertIncludes(api, "tripStage: 'cancelled'");
  assertRegex(api, /:\s*\{\s*status,\s*updatedAt:\s*now\s*\}/, 'non-cancelled updates only status');
});

test('trip join blocks non-not_started and full trips', () => {
  const api = read('cloudfunctions/api/index.js');

  assertIncludes(api, "const tripStage = trip.tripStage || 'not_started';");
  assertIncludes(api, "if (tripStage !== 'not_started')");
  assertIncludes(api, '行程已开始或已结束，不能加入');
  assertIncludes(api, 'if ((trip.needCount || 0) <= 0)');
  assertIncludes(api, '行程名额已满');
});

test('trip log lifecycle and permissions are guarded by tripStage ongoing', () => {
  const api = read('cloudfunctions/api/index.js');

  assertIncludes(api, "data: { tripStage: 'ongoing', logStartedAt: now, updatedAt: now }");
  assertIncludes(api, "data: { tripStage: 'ended', logEndedAt: now, updatedAt: now }");
  assertIncludes(api, "if (tripStage !== 'ongoing') return { success: false, error: '行程日志未开启或已结束' };");
  assertIncludes(api, "if ((trip.tripStage || 'not_started') !== 'ongoing') return { success: false, error: '只有进行中的行程才能授权发布日志' };");
  assertIncludes(api, "if ((trip.tripStage || 'not_started') !== 'ongoing') return { success: false, error: '只有进行中的行程才能修改授权' };");
});

test('trip log create/delete enforce max count and idempotent decrement', () => {
  const api = read('cloudfunctions/api/index.js');

  assertIncludes(api, 'const logMaxCount = trip.logMaxCount || 15;');
  assertIncludes(api, 'if (logCount >= logMaxCount)');
  assertIncludes(api, 'data: { logCount: logCount + 1, lastLogAt: now, updatedAt: now }');
  assertIncludes(api, "if (log.status === 'deleted') return { success: true };");
  assertIncludes(api, 'Math.max(currentLogCount - 1, 0)');
});

test('trip-list status filter includes ongoing and ended with final filter semantics', () => {
  const wxml = read('miniprogram/pages/trip-list/trip-list.wxml');
  const js = read('miniprogram/pages/trip-list/trip-list.js');

  assertIncludes(wxml, '行程状态');
  assertIncludes(wxml, "{{statusFilterText || '行程状态'}}");
  assertNotIncludes(wxml, "statusFilterText || '招募进度'");
  assertIncludes(wxml, 'data-value="ongoing">进行中');
  assertIncludes(wxml, 'data-value="ended">已结束');
  assertIncludes(js, "['recruiting', 'almost-full', 'full', 'ongoing'].includes(normalizedStatus)");
  assertIncludes(js, "['recruiting', 'almost-full'].includes(normalizedStatus)");

  const page = loadPage('pages/trip-list/trip-list.js');
  assert.strictEqual(page.matchesStatusFilter('recruiting', ''), true);
  assert.strictEqual(page.matchesStatusFilter('almost-full', ''), true);
  assert.strictEqual(page.matchesStatusFilter('full', ''), true);
  assert.strictEqual(page.matchesStatusFilter('ongoing', ''), true);
  assert.strictEqual(page.matchesStatusFilter('ended', ''), false);
  assert.strictEqual(page.matchesStatusFilter('almost-full', 'recruiting'), true);
  assert.strictEqual(page.matchesStatusFilter('full', 'recruiting'), false);
  assert.strictEqual(page.matchesStatusFilter('ended', 'ended'), true);
});

test('trip-detail uses tripStage for log UI and authorization entry', () => {
  const js = read('miniprogram/pages/trip-detail/trip-detail.js');
  const wxml = read('miniprogram/pages/trip-detail/trip-detail.wxml');

  assertNotIncludes(js, 'logStatus');
  assertNotIncludes(wxml, 'logStatus');
  assertIncludes(wxml, "tripStage === 'ongoing' && canPublishLog");
  assertIncludes(wxml, "tripStage === 'ongoing'");
  assertIncludes(wxml, "tripStage === 'not_started'");
  assertIncludes(wxml, "tripStage === 'ongoing'}}\">");
});

test('my-trips keeps identity tabs and uses tripStage-first status display', () => {
  const js = read('miniprogram/pages/my-trips/my-trips.js');
  const wxml = read('miniprogram/pages/my-trips/my-trips.wxml');

  ['data-tab="all"', 'data-tab="created"', 'data-tab="joined"', 'data-tab="ended"'].forEach((needle) => {
    assertIncludes(wxml, needle);
  });
  assertIncludes(js, "const tripStage = item.tripStage || 'not_started';");
  assertIncludes(js, "if (tripStage === 'cancelled')");
  assertIncludes(js, "else if (tripStage === 'ongoing')");
  assertIncludes(js, "else if (tripStage === 'ended')");
  assertIncludes(js, "else if (status === 'stopped')");
  assertIncludes(js, "else if ((item.needCount || 0) <= 0)");
  assertIncludes(js, "else if ((item.needCount || 0) === 1)");
});

async function run() {
  let passed = 0;
  for (const item of tests) {
    try {
      await item.fn();
      passed += 1;
      console.log(`PASS ${item.name}`);
    } catch (err) {
      console.error(`FAIL ${item.name}`);
      console.error(err.stack || err.message);
      process.exitCode = 1;
      break;
    }
  }
  if (process.exitCode !== 1) {
    console.log(`\n${passed}/${tests.length} tests passed`);
  }
}

run();
