#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');

let app;
let wxCalls;
let storage;
let currentPage;
let pagesStack;

function resetRuntime() {
  storage = {};
  wxCalls = {
    navigateTo: [],
    switchTab: [],
    redirectTo: [],
    showToast: [],
    showLoading: [],
    hideLoading: 0,
    cloudCalls: []
  };
  app = {
    globalData: {
      userInfo: null,
      openid: null,
      isLoggedIn: false,
      attractions: [],
      attractionsLoaded: false
    },
    getAttractions: async () => []
  };
  pagesStack = [{}];

  global.getApp = () => app;
  global.getCurrentPages = () => pagesStack;
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
    navigateTo: (options) => { wxCalls.navigateTo.push(options); },
    switchTab: (options) => { wxCalls.switchTab.push(options); },
    redirectTo: (options) => { wxCalls.redirectTo.push(options); },
    navigateBack: () => { wxCalls.navigateBack = true; },
    showToast: (options) => { wxCalls.showToast.push(options); },
    showLoading: (options) => { wxCalls.showLoading.push(options); },
    hideLoading: () => { wxCalls.hideLoading += 1; },
    cloud: {
      uploadFile: async ({ cloudPath, filePath }) => {
        wxCalls.uploadFile = wxCalls.uploadFile || [];
        wxCalls.uploadFile.push({ cloudPath, filePath });
        return { fileID: `cloud://test-env.${cloudPath}` };
      },
      callFunction: async ({ name, data = {} }) => {
        wxCalls.cloudCalls.push({ name, data });
        if (name === 'login') {
          if (data.action === 'getPhoneNumber') {
            return { result: { success: true, phoneNumber: '13800138000', openid: 'openid-test' } };
          }
          return { result: { openid: 'openid-test' } };
        }
        if (name === 'api') {
          if (data.action === 'user/loginByPhone') {
            return {
              result: {
                success: true,
                user: {
                  _id: 'user-doc-id',
                  openid: 'openid-test',
                  phone: data.data.phone,
                  nickname: data.data.nickname || '旅行者',
                  avatar: data.data.avatar || ''
                }
              }
            };
          }
          if (data.action === 'auth/trackEvent') {
            return { result: { success: true } };
          }
          if (data.action === 'trip/create') {
            return { result: { success: true, trip: { _id: 'trip-created-id' }, tripImage: 'https://example.com/trip.jpg' } };
          }
          if (data.action === 'attractions/get') {
            return { result: { success: true, place: { name: '东灵山', location: '北京市门头沟区', coverImage: 'https://example.com/place.jpg' } } };
          }
          return { result: { success: true } };
        }
        return { result: { success: true } };
      },
      getTempFileURL: async () => ({ fileList: [] })
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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function tap(filter) {
  return { currentTarget: { dataset: { filter } } };
}

function valueEvent(value) {
  return { currentTarget: { dataset: { value } }, detail: { value } };
}

function latestToast() {
  return wxCalls.showToast[wxCalls.showToast.length - 1] || {};
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('app.json 默认首页是 trip-list，tabBar 含行程和我的', () => {
  const appJson = JSON.parse(read('miniprogram/app.json'));
  assert.strictEqual(appJson.pages[0], 'pages/trip-list/trip-list');
  assert.deepStrictEqual(appJson.tabBar.list.map((item) => item.pagePath), [
    'pages/trip-list/trip-list',
    'pages/profile/profile'
  ]);
});

test('trip-list UI 含筛选栏、行程卡片、空状态发布按钮和悬浮发布按钮', () => {
  const wxml = read('miniprogram/pages/trip-list/trip-list.wxml');
  ['data-filter="destination"', 'data-filter="departure"', 'data-filter="date"', 'bindtap="onPublishTrip"', 'class="trip-card"', '暂无行程'].forEach((needle) => {
    assert(wxml.includes(needle), `missing ${needle}`);
  });
});

test('trip-list 筛选点击会打开对应面板并关闭其他面板', () => {
  const page = loadPage('pages/trip-list/trip-list.js');
  page.onFilterTap(tap('destination'));
  assert.strictEqual(page.data.showDestinationFilter, true);
  assert.strictEqual(page.data.showDepartureFilter, false);
  assert.strictEqual(page.data.showDateFilter, false);

  page.onFilterTap(tap('departure'));
  assert.strictEqual(page.data.showDestinationFilter, false);
  assert.strictEqual(page.data.showDepartureFilter, true);
  assert.strictEqual(page.data.showDateFilter, false);

  page.onFilterTap(tap('date'));
  assert.strictEqual(page.data.showDestinationFilter, false);
  assert.strictEqual(page.data.showDepartureFilter, false);
  assert.strictEqual(page.data.showDateFilter, true);
});

test('trip-list 未登录点击发布跳转登录页', () => {
  const page = loadPage('pages/trip-list/trip-list.js');
  page.onPublishTrip();
  assert.strictEqual(wxCalls.navigateTo.at(-1).url, '/pages/auth/auth');
});

test('profile 未登录 UI 和入口都指向登录页', () => {
  const wxml = read('miniprogram/pages/profile/profile.wxml');
  ['点击登录', '我的行程', '行程通知', '上传景点', '提交建议', '关于我们'].forEach((text) => {
    assert(wxml.includes(text), `missing ${text}`);
  });

  const page = loadPage('pages/profile/profile.js');
  page.checkLogin();
  assert.strictEqual(page.data.isLoggedIn, false);

  ['onLogin', 'onTapMyTrips', 'onTapTripNotifications', 'onTapUploadSpot', 'onTapFeedback', 'onTapAbout'].forEach((method) => {
    wxCalls.navigateTo = [];
    page[method]();
    assert.strictEqual(wxCalls.navigateTo.at(-1).url, '/pages/auth/auth', `${method} did not navigate to auth`);
  });
});

test('auth UI 要求协议、手机号登录、头像昵称和完成登录', () => {
  const wxml = read('miniprogram/pages/auth/auth.wxml');
  ['open-type="getPhoneNumber"', 'bindgetphonenumber="onGetPhoneNumber"', '用户协议', '隐私政策', 'open-type="chooseAvatar"', 'type="nickname"', '完成登录'].forEach((needle) => {
    assert(wxml.includes(needle), `missing ${needle}`);
  });
});

test('auth 未勾选协议时手机号登录给出提示', async () => {
  const page = loadPage('pages/auth/auth.js');
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } });
  assert.strictEqual(latestToast().title, '请先同意用户协议');
});

test('auth 勾选协议后获取手机号进入完善资料，完成登录跳回首页', async () => {
  const page = loadPage('pages/auth/auth.js');
  page.onAgreeChange();
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } });
  assert.strictEqual(page.data.step, 'profile');
  assert.strictEqual(page.data.phone, '13800138000');

  page.onNicknameInput({ detail: { value: '测试用户' } });
  page.onChooseAvatar({ detail: { avatarUrl: 'https://example.com/avatar.jpg' } });
  await page.onCompleteLogin();

  assert.strictEqual(latestToast().title, '登录成功');
  assert.strictEqual(storage.openid, 'openid-test');
  assert.strictEqual(app.globalData.isLoggedIn, true);
});

test('auth 完成登录会先上传 wxfile 头像并保存云存储 fileID', async () => {
  const page = loadPage('pages/auth/auth.js');
  page.onAgreeChange();
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } });

  page.onNicknameInput({ detail: { value: '测试用户' } });
  page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp_755cd2900a1262da09d2da57cea295b8.jpg' } });
  await page.onCompleteLogin();

  const uploadCall = wxCalls.uploadFile && wxCalls.uploadFile[0];
  assert(uploadCall, 'wxfile avatar should be uploaded before login');
  assert.strictEqual(uploadCall.filePath, 'wxfile://tmp_755cd2900a1262da09d2da57cea295b8.jpg');

  const loginCall = wxCalls.cloudCalls.find((call) => call.name === 'api' && call.data.action === 'user/loginByPhone');
  assert(loginCall, 'user/loginByPhone should be called');
  assert(loginCall.data.data.avatar.startsWith('cloud://test-env.avatars/'), 'login avatar should be cloud fileID');
});

test('trip-publish UI 含必填项、发布按钮和出发地弹窗', () => {
  const wxml = read('miniprogram/pages/trip-publish/trip-publish.wxml');
  ['目的地<text class="required">*</text>', '出发地<text class="required">*</text>', '出行日期<text class="required">*</text>', '招募人数<text class="required">*</text>', '手机号<text class="required">*</text>', '发布行程', '选择出发地'].forEach((needle) => {
    assert(wxml.includes(needle), `missing ${needle}`);
  });
});

test('trip-publish 未登录提交提示请先登录', async () => {
  const page = loadPage('pages/trip-publish/trip-publish.js');
  await page.onSubmit();
  assert.strictEqual(latestToast().title, '请先登录');
});

test('trip-publish 必填项校验按顺序提示', async () => {
  const page = loadPage('pages/trip-publish/trip-publish.js');
  storage.userInfo = { nickname: '测试用户' };
  storage.lastLoginTime = Date.now();

  await page.onSubmit();
  assert.strictEqual(latestToast().title, '请选择目的地');

  page.setData({ placeName: '东灵山', placeId: 'place-1', date: '' });
  await page.onSubmit();
  assert.strictEqual(latestToast().title, '请选择出行日期');

  page.setData({ date: '2026-05-07', departure: '' });
  await page.onSubmit();
  assert.strictEqual(latestToast().title, '请选择出发地');

  page.setData({ departure: '海淀区', contactPhone: '' });
  await page.onSubmit();
  assert.strictEqual(latestToast().title, '请输入联系方式');

  page.setData({ contactPhone: '12345' });
  await page.onSubmit();
  assert.strictEqual(latestToast().title, '请输入正确的手机号');
});

test('trip-publish 成功发布会调用 trip/create 并跳转发布成功页', async () => {
  const page = loadPage('pages/trip-publish/trip-publish.js');
  storage.userInfo = { nickname: '测试用户' };
  storage.lastLoginTime = Date.now();
  page.setData({
    tripTitle: '周末东灵山',
    placeId: 'place-1',
    placeName: '东灵山',
    departure: '海淀区',
    date: '2026-05-07',
    hasCar: true,
    recruitCount: 3,
    contactPhone: '13800138000'
  });

  await page.onSubmit();

  const createCall = wxCalls.cloudCalls.find((call) => call.name === 'api' && call.data.action === 'trip/create');
  assert(createCall, 'trip/create was not called');
  assert.strictEqual(wxCalls.redirectTo.length, 1);
  assert(wxCalls.redirectTo[0].url.startsWith('/pages/trip-publish-success/trip-publish-success?'));
  assert(wxCalls.redirectTo[0].url.includes('tripId=trip-created-id'));
});

test('trip-publish-success UI 含发布成功、摘要和返回按钮', () => {
  const wxml = read('miniprogram/pages/trip-publish-success/trip-publish-success.wxml');
  ['发布成功', '你的行程已成功发布', '查看行程详情', '返回行程页', '招募人数'].forEach((needle) => {
    assert(wxml.includes(needle), `missing ${needle}`);
  });
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
