#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = process.env.WX_CLI_PATH || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const autoPort = Number(process.env.WX_AUTOMATOR_PORT || 9420);

async function main() {
  let miniProgram;
  try {
    miniProgram = await connectOrLaunch();
  } catch (err) {
    throw new Error([
      `微信开发者工具自动化端口连接失败: ${err.message}`,
      '',
      '请先确认：',
      '1. 微信开发者工具已登录。',
      '2. 设置 -> 安全设置 -> 服务端口 已开启。',
      '3. 没有已打开的开发者工具实例占用不同端口；必要时先完全退出开发者工具。',
      `4. 可手动执行: ${cliPath} auto --project ${root} --auto-port ${autoPort} --disable-gpu --trust-project`,
      '',
      '轻量逻辑测试仍可用: npm test'
    ].join('\n'));
  }

  try {
    await clearLogin(miniProgram);

    await testTripListClickFlow(miniProgram);
    await testProfileClickFlow(miniProgram);
    await testAuthClickFlow(miniProgram);
    await testPublishClickFlow(miniProgram);

    console.log('\nE2E click flow passed');
  } finally {
    await miniProgram.close();
  }
}

async function connectOrLaunch() {
  try {
    return await automator.connect({
      wsEndpoint: `ws://127.0.0.1:${autoPort}`
    });
  } catch (connectErr) {
    return await automator.launch({
      cliPath,
      projectPath: root,
      port: autoPort,
      args: ['--disable-gpu'],
      timeout: 60000,
      trustProject: true
    });
  }
}

async function clearLogin(miniProgram) {
  await miniProgram.callWxMethod('removeStorageSync', 'userInfo');
  await miniProgram.callWxMethod('removeStorageSync', 'openid');
  await miniProgram.callWxMethod('removeStorageSync', 'userId');
  await miniProgram.callWxMethod('removeStorageSync', 'lastLoginTime');
  await miniProgram.evaluate(() => {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.userInfo = null;
      app.globalData.openid = null;
      app.globalData.userId = null;
      app.globalData.isLoggedIn = false;
    }
  });
}

async function installCloudCallFunctionMock(miniProgram) {
  await miniProgram.evaluate(function installMock() {
    if (!wx.cloud) {
      wx.cloud = {};
    }

    wx.cloud.callFunction = function callFunction(options) {
      const name = options && options.name;
      const data = (options && options.data) || {};
      let result;

      if (name === 'login' && data.action === 'getPhoneNumber') {
        result = {
          success: true,
          phoneNumber: '13800138000',
          openid: 'auto-openid'
        };
      } else if (name === 'login') {
        result = {
          openid: 'auto-openid'
        };
      } else if (name === 'api' && data.action === 'user/loginByPhone') {
        result = {
          success: true,
          user: {
            _id: 'auto-user-doc',
            openid: 'auto-openid',
            nickname: (data.data && data.data.nickname) || '自动化用户',
            avatar: (data.data && data.data.avatar) || '',
            phone: data.data && data.data.phone
          }
        };
      } else if (name === 'api' && data.action === 'trip/create') {
        result = {
          success: true,
          trip: { _id: 'auto-trip-id' },
          tripImage: 'https://example.com/trip.jpg'
        };
      } else if (name === 'api' && data.action === 'attractions/get') {
        result = {
          success: true,
          place: {
            name: '东灵山',
            location: '北京市门头沟区',
            coverImage: 'https://example.com/place.jpg'
          }
        };
      } else if (name === 'api' && data.action === 'auth/trackEvent') {
        result = { success: true };
      } else if (name === 'api' && data.action === 'attractions/list') {
        result = { success: true, attractions: [] };
      } else {
        result = { success: true };
      }

      const response = { result };
      if (options && typeof options.success === 'function') {
        setTimeout(function onSuccess() {
          options.success(response);
        }, 0);
      }
      return Promise.resolve(response);
    };

    wx.cloud.getTempFileURL = function getTempFileURL() {
      return Promise.resolve({ fileList: [] });
    };
  });
}

async function setLoggedIn(miniProgram) {
  const user = {
    _id: 'auto-user-doc',
    openid: 'auto-openid',
    nickname: '自动化用户',
    avatar: '',
    phone: '13800138000',
    contactPhone: '13800138000'
  };
  await miniProgram.callWxMethod('setStorageSync', 'userInfo', user);
  await miniProgram.callWxMethod('setStorageSync', 'openid', user.openid);
  await miniProgram.callWxMethod('setStorageSync', 'userId', user._id);
  await miniProgram.callWxMethod('setStorageSync', 'lastLoginTime', Date.now());
  await miniProgram.evaluate((u) => {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.userInfo = u;
      app.globalData.openid = u.openid;
      app.globalData.userId = u._id;
      app.globalData.isLoggedIn = true;
    }
  }, user);
}

async function assertExists(page, selector, label) {
  await page.waitFor(selector);
  const element = await page.$(selector);
  assert(element, `${label || selector} not found`);
  return element;
}

async function getCurrentPath(miniProgram) {
  const page = await miniProgram.currentPage();
  return page.path;
}

async function tapAndWait(element, page, ms = 400) {
  await element.tap();
  await page.waitFor(ms);
}

async function testTripListClickFlow(miniProgram) {
  console.log('RUN trip-list real taps');
  const page = await miniProgram.reLaunch('/pages/trip-list/trip-list');
  await page.waitFor(1200);
  assert.strictEqual(page.path, 'pages/trip-list/trip-list');

  const filters = await page.$$('.filter-item');
  assert(filters.length >= 3, 'trip-list should render three filter items');

  await tapAndWait(filters[0], page);
  assert.strictEqual(await page.data('showDestinationFilter'), true);

  await tapAndWait(filters[1], page);
  assert.strictEqual(await page.data('showDepartureFilter'), true);
  assert.strictEqual(await page.data('showDestinationFilter'), false);

  await tapAndWait(filters[2], page);
  assert.strictEqual(await page.data('showDateFilter'), true);
  assert.strictEqual(await page.data('showDepartureFilter'), false);

  const fab = await assertExists(page, '.fab', 'publish fab');
  await fab.tap();
  await page.waitFor(1200);
  assert.strictEqual(await getCurrentPath(miniProgram), 'pages/auth/auth');
}

async function testProfileClickFlow(miniProgram) {
  console.log('RUN profile real taps');
  await clearLogin(miniProgram);
  let page = await miniProgram.switchTab('/pages/profile/profile');
  await page.waitFor(800);
  assert.strictEqual(page.path, 'pages/profile/profile');

  const userCard = await assertExists(page, '.user-card', 'profile login card');
  await userCard.tap();
  await page.waitFor(1000);
  assert.strictEqual(await getCurrentPath(miniProgram), 'pages/auth/auth');

  page = await miniProgram.switchTab('/pages/profile/profile');
  await page.waitFor(800);
  const entries = await page.$$('.info-bar');
  assert(entries.length >= 5, 'profile should render at least five entry rows');

  for (let i = 0; i < entries.length; i += 1) {
    page = await miniProgram.switchTab('/pages/profile/profile');
    await page.waitFor(500);
    const freshEntries = await page.$$('.info-bar');
    await freshEntries[i].tap();
    await page.waitFor(900);
    assert.strictEqual(await getCurrentPath(miniProgram), 'pages/auth/auth', `profile entry ${i} should navigate to auth`);
  }
}

async function testAuthClickFlow(miniProgram) {
  console.log('RUN auth real taps');
  await clearLogin(miniProgram);
  await installCloudCallFunctionMock(miniProgram);

  const page = await miniProgram.reLaunch('/pages/auth/auth');
  await page.waitFor(800);

  const loginButton = await assertExists(page, '.phone-login-btn', 'phone login button');
  await loginButton.tap();
  await page.waitFor(500);
  assert.strictEqual(await page.data('step'), 'phone');

  const agreement = await assertExists(page, '.agreement-row', 'agreement row');
  await agreement.tap();
  await page.waitFor(300);
  assert.strictEqual(await page.data('agreed'), true);

  // The native getPhoneNumber dialog cannot be completed reliably from a local
  // Node process without a configured WeChat test account. We still use a real
  // tap for the page control above, then inject the system callback result.
  await page.callMethod('onGetPhoneNumber', { detail: { code: 'mock-phone-code' } });
  await page.waitFor(800);
  assert.strictEqual(await page.data('step'), 'profile');

  const nicknameInput = await assertExists(page, '.nickname-input', 'nickname input');
  await nicknameInput.input('自动化用户');
  await page.waitFor(300);

  await page.setData({
    avatarUrl: 'https://example.com/avatar.jpg',
    phone: '13800138000'
  });

  const completeButton = await assertExists(page, '.complete-btn', 'complete login button');
  await completeButton.tap();
  await page.waitFor(1800);

  const storedUser = await miniProgram.callWxMethod('getStorageSync', 'userInfo');
  assert(storedUser, 'login should write userInfo to storage');
}

async function testPublishClickFlow(miniProgram) {
  console.log('RUN publish real taps');
  await setLoggedIn(miniProgram);
  await installCloudCallFunctionMock(miniProgram);

  const page = await miniProgram.reLaunch('/pages/trip-publish/trip-publish');
  await page.waitFor(1000);
  assert.strictEqual(page.path, 'pages/trip-publish/trip-publish');

  const submit = await assertExists(page, '.submit-btn', 'publish submit button');

  await submit.tap();
  await page.waitFor(300);
  assert.strictEqual(await page.data('placeName'), '');

  await page.setData({
    placeName: '东灵山',
    placeId: 'auto-place-id',
    date: '',
    departure: '海淀区',
    contactPhone: '13800138000'
  });
  await submit.tap();
  await page.waitFor(300);
  assert.strictEqual(await page.data('date'), '');

  await page.setData({
    date: '2026-05-07',
    departure: '',
    contactPhone: '13800138000'
  });
  await submit.tap();
  await page.waitFor(300);
  assert.strictEqual(await page.data('departure'), '');

  await page.setData({
    departure: '海淀区',
    contactPhone: ''
  });
  await submit.tap();
  await page.waitFor(300);
  assert.strictEqual(await page.data('contactPhone'), '');

  await page.setData({ contactPhone: '12345' });
  await submit.tap();
  await page.waitFor(300);
  assert.strictEqual(await page.data('contactPhone'), '12345');

  await page.setData({
    tripTitle: '自动化东灵山',
    placeId: 'auto-place-id',
    placeName: '东灵山',
    departure: '海淀区',
    date: '2026-05-07',
    hasCar: true,
    recruitCount: 3,
    contactPhone: '13800138000'
  });

  await submit.tap();
  await page.waitFor(1800);
  assert.strictEqual(await getCurrentPath(miniProgram), 'pages/trip-publish-success/trip-publish-success');

  const successPage = await miniProgram.currentPage();
  await assertExists(successPage, '.success-title', 'success title');
  await assertExists(successPage, '.btn-primary', 'view trip button');
  await assertExists(successPage, '.btn-secondary', 'back to trip list button');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
