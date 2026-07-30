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
    cloudCalls: [],
    previewImage: [],
    openLocation: []
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
      Object.keys(patch).forEach((key) => {
        if (!key.includes('.')) {
          this.data = { ...this.data, [key]: patch[key] };
          return;
        }

        const parts = key.split('.');
        const rootKey = parts.shift();
        const nextRoot = { ...(this.data[rootKey] || {}) };
        let target = nextRoot;
        while (parts.length > 1) {
          const part = parts.shift();
          target[part] = { ...(target[part] || {}) };
          target = target[part];
        }
        target[parts[0]] = patch[key];
        this.data = { ...this.data, [rootKey]: nextRoot };
      });
    };
  };
  global.wx = {
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    removeStorageSync: (key) => { delete storage[key]; },
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    getWindowInfo: () => ({ statusBarHeight: 24, windowWidth: 390 }),
    getMenuButtonBoundingClientRect: () => ({ top: 28, left: 290, width: 88, height: 32 }),
    canIUse: () => false,
    getFileSystemManager: () => ({}),
    setNavigationBarTitle: () => {},
    navigateTo: (options) => { wxCalls.navigateTo.push(options); },
    switchTab: (options) => { wxCalls.switchTab.push(options); },
    redirectTo: (options) => { wxCalls.redirectTo.push(options); },
    navigateBack: () => { wxCalls.navigateBack = true; },
    showToast: (options) => { wxCalls.showToast.push(options); },
    showLoading: (options) => { wxCalls.showLoading.push(options); },
    hideLoading: () => { wxCalls.hideLoading += 1; },
    previewImage: (options) => { wxCalls.previewImage.push(options); },
    openLocation: (options) => { wxCalls.openLocation.push(options); },
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
                isNew: Boolean(wxCalls.loginByPhoneIsNew),
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
      getTempFileURL: async ({ fileList = [] } = {}) => ({
        fileList: fileList.map((fileID) => ({
          fileID,
          tempFileURL: `https://temp.example.com/${encodeURIComponent(fileID)}`
        }))
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
    'pages/community/community',
    'pages/profile/profile'
  ]);
});

test('trip-list UI 含筛选栏、行程卡片、空状态发布按钮和悬浮发布按钮', () => {
  const wxml = read('miniprogram/pages/trip-list/trip-list.wxml');
  ['data-filter="destination"', 'data-filter="departure"', 'data-filter="date"', 'bindtap="onPublishTrip"', 'class="trip-card"', '还没有人发起这段旅程'].forEach((needle) => {
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
  ['点击登录', '关注', '粉丝', '获赞', '我的行程', '我的作品', '互动记录', '消息中心',
    '行程通知', '上传景点', '提交建议', '关于我们'].forEach((text) => {
    assert(wxml.includes(text), `missing ${text}`);
  });
  assert(wxml.includes('statusBarHeight + navBarHeight'), 'profile page should reserve capsule-safe height');
  assert(!wxml.includes('profile-nav-title'), 'profile page should not render a custom title');
  assert(wxml.includes('menu-group menu-group-secondary'), 'secondary functions should use the selected tight second group');
  assert(!wxml.includes('>其他<'), 'profile should not render an extra section heading');
  assert(!wxml.includes('📅') && !wxml.includes('🔔'), 'profile should use real icon assets');

  const page = loadPage('pages/profile/profile.js');
  page.checkLogin();
  assert.strictEqual(page.data.isLoggedIn, false);

  ['onLogin', 'onTapMyTrips', 'onTapMyWorks', 'onTapTripNotifications', 'onTapUploadSpot', 'onTapFeedback', 'onTapAbout'].forEach((method) => {
    wxCalls.navigateTo = [];
    page[method]();
    assert.strictEqual(wxCalls.navigateTo.at(-1).url, '/pages/auth/auth', `${method} did not navigate to auth`);
  });
});

test('我的作品使用系统头部并展示全部审核状态', () => {
  const pageJson = JSON.parse(read('miniprogram/pages/community-mine/community-mine.json'));
  const wxml = read('miniprogram/pages/community-mine/community-mine.wxml');
  const js = read('miniprogram/pages/community-mine/community-mine.js');
  assert.strictEqual(pageJson.navigationBarTitleText, '我的作品');
  assert.notStrictEqual(pageJson.navigationStyle, 'custom');
  ['bindtap="onMoreTap"', 'bindtap="onPreviewImage"', 'item.authorAvatar', 'item.authorName', 'icon-more-gray.png'].forEach((needle) => {
    assert(wxml.includes(needle), `missing ${needle}`);
  });
  assert(!wxml.includes('bindtap="onDelete"'), 'direct delete button should be hidden');
  ['已发布', '审核中', '人工审核', '审核未通过'].forEach((needle) => {
    assert(js.includes(needle), `missing ${needle}`);
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
  assert.strictEqual(latestToast().title, '请先同意用户协议和隐私政策');
});

test('auth 勾选协议后老用户一键登录直接跳回首页', async () => {
  const page = loadPage('pages/auth/auth.js');
  page.onAgreeChange();
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } });
  assert.strictEqual(page.data.step, 'phone');
  assert.strictEqual(page.data.phone, '13800138000');
  assert.strictEqual(latestToast().title, '登录成功');
  assert.strictEqual(storage.openid, 'openid-test');
  assert.strictEqual(app.globalData.isLoggedIn, true);
});

test('auth 勾选协议后新用户进入完善资料，完成登录跳回首页', async () => {
  const page = loadPage('pages/auth/auth.js');
  wxCalls.loginByPhoneIsNew = true;
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

test('auth 新用户点击完成登录必须填写头像和昵称', async () => {
  const page = loadPage('pages/auth/auth.js');
  wxCalls.loginByPhoneIsNew = true;
  page.onAgreeChange();
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } });

  await page.onCompleteLogin();
  assert.strictEqual(latestToast().title, '请先设置头像');

  page.onChooseAvatar({ detail: { avatarUrl: 'https://example.com/avatar.jpg' } });
  await page.onCompleteLogin();
  assert.strictEqual(latestToast().title, '请输入昵称');
});

test('auth 新用户点击暂不填写可以跳过资料', async () => {
  const page = loadPage('pages/auth/auth.js');
  wxCalls.loginByPhoneIsNew = true;
  page.onAgreeChange();
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } });

  await page.onSkipProfile();
  assert.strictEqual(latestToast().title, '登录成功');
  assert.strictEqual(app.globalData.isLoggedIn, true);
});

test('auth 完成登录会先上传 wxfile 头像并保存云存储 fileID', async () => {
  const page = loadPage('pages/auth/auth.js');
  wxCalls.loginByPhoneIsNew = true;
  page.onAgreeChange();
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } });

  page.onNicknameInput({ detail: { value: '测试用户' } });
  page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp_755cd2900a1262da09d2da57cea295b8.jpg' } });
  await page.onCompleteLogin();

  const uploadCall = wxCalls.uploadFile && wxCalls.uploadFile[0];
  assert(uploadCall, 'wxfile avatar should be uploaded before login');
  assert.strictEqual(uploadCall.filePath, 'wxfile://tmp_755cd2900a1262da09d2da57cea295b8.jpg');

  const loginCall = wxCalls.cloudCalls.find((call) => (
    call.name === 'api' &&
    call.data.action === 'user/loginByPhone' &&
    call.data.data.avatar
  ));
  assert(loginCall, 'user/loginByPhone should be called');
  assert(loginCall.data.data.avatar.startsWith('cloud://test-env.avatars/'), 'login avatar should be cloud fileID');
});

test('edit-profile UI 支持微信头像并上传云存储头像', async () => {
  const wxml = read('miniprogram/pages/edit-profile/edit-profile.wxml');
  assert(wxml.includes('class="avatar-picker"'), 'edit-profile should render the native avatar picker');
  assert(wxml.includes('open-type="chooseAvatar"'), 'the avatar area should directly use WeChat chooseAvatar');
  assert(wxml.includes('bindchooseavatar="onChooseAvatar"'), 'the native WeChat avatar result should be handled');
  assert(wxml.includes('class="form-input" type="nickname"'), 'nickname input should use the same native type as registration');
  assert(wxml.includes('class="avatar-camera-badge"') && wxml.includes('/images/icon-camera-white.png'),
    'avatar should show a non-blocking camera badge');
  const wxss = read('miniprogram/pages/edit-profile/edit-profile.wxss');
  assert(/\.avatar-picker\s*\{[\s\S]*?width:\s*200rpx;[\s\S]*?height:\s*200rpx;/.test(wxss),
    'native chooseAvatar button should have an explicit clickable width and height');
  assert(/\.avatar-camera-badge\s*\{[\s\S]*?left:\s*-4rpx;[\s\S]*?bottom:\s*2rpx;/.test(wxss),
    'camera badge should sit at the avatar lower-left corner');
  assert(wxml.includes('地区'), 'edit-profile should include region');
  assert(wxml.includes('选择区（北京 · 共16个区）'), 'edit-profile should reuse the Beijing district selector');
  assert(wxml.includes('bindtap="onSave"'), 'edit-profile should provide an explicit save action');

  const page = loadPage('pages/edit-profile/edit-profile.js');

  storage.userInfo = {
    _id: 'user-doc-id',
    openid: 'openid-test',
    nickname: '测试用户',
    avatar: 'cloud://test-env.avatars/existing-avatar.jpg',
    photos: []
  };
  storage.userId = 'user-doc-id';
  storage.openid = 'openid-test';
  storage.lastLoginTime = Date.now();
  app.globalData.userInfo = storage.userInfo;
  app.globalData.openid = 'openid-test';

  await page.onLoad();
  assert(page.data.userInfo.avatar.includes('existing-avatar.jpg'), 'existing avatar should still be displayed');
  await page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp_profile_avatar.jpg' } });

  const uploadCall = wxCalls.uploadFile && wxCalls.uploadFile[0];
  assert(uploadCall, 'edit-profile wxfile avatar should be uploaded');
  assert.strictEqual(uploadCall.filePath, 'wxfile://tmp_profile_avatar.jpg');
  assert(page.data.userInfo.avatarFileID.startsWith('cloud://test-env.avatars/'), 'avatarFileID should be cloud fileID');

  await page.onSave();
  const updateCall = wxCalls.cloudCalls.find((call) => call.name === 'api' && call.data.action === 'user/update');
  assert(updateCall, 'edit-profile should sync avatar to database after save');
  assert(updateCall.data.data.avatar.startsWith('cloud://test-env.avatars/'), 'database avatar should be cloud fileID');
});

test('user-profile UI 支持作品动态流和行程切换', () => {
  const wxml = read('miniprogram/pages/user-profile/user-profile.wxml');
  const js = read('miniprogram/pages/user-profile/user-profile.js');
  ['个人主页', '关注', '粉丝', '获赞', '作品', '行程'].forEach((text) => {
    if (text !== '个人主页') assert(wxml.includes(text), `user-profile missing ${text}`);
  });
  assert(js.includes("'grid-1'"), 'user-profile should support a single-image work');
  assert(js.includes("'grid-2'"), 'user-profile should support a two-image work');
  assert(js.includes("'grid-3'"), 'user-profile should support multi-image works');
  assert(wxml.includes('onOpenPost'), 'user-profile works should open community detail');
  assert(wxml.includes('onSwitchTab'), 'user-profile should switch between works and trips');
  assert(js.includes('profileUpdated'), 'user-profile should receive saved profile fields through EventChannel');
  assert(js.includes('applyProfileUpdate'), 'user-profile should update profile fields without reloading the page');
  const onShowBody = js.match(/onShow:\s*function\s*\(\)\s*\{([\s\S]*?)\n\s*\},/);
  assert(onShowBody && !onShowBody[1].includes('loadUserProfile'), 'returning to user-profile should not reload all content');

  const json = JSON.parse(read('miniprogram/pages/user-profile/user-profile.json'));
  assert.strictEqual(json.navigationStyle, undefined, 'user-profile should use system navigation');
});

test('apply-modal 顶部不展示无意义默认头像', () => {
  const wxml = read('miniprogram/components/apply-modal/apply-modal.wxml');
  assert(wxml.includes('申请加入行程'), 'apply modal should keep title');
  assert(!wxml.includes('modal-icon-wrap'), 'apply modal should not render decorative avatar/icon wrapper');
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

test('community UI 含发布入口、动态列表和定位，隐藏审核状态标签', () => {
  const wxml = read('miniprogram/pages/community/community.wxml');
  ['bindtap="onPublish"', 'bindtap="onOpenDetail"', 'catchtap="onOpenLocation"'].forEach((needle) => {
    assert(wxml.includes(needle), `missing ${needle}`);
  });
  assert(!wxml.includes('审核中'), '审核中标签不应显示');
});

test('community 未登录发布会跳登录并保存发布页回跳地址', () => {
  const page = loadPage('pages/community/community.js');
  page.onPublish();
  assert.strictEqual(wxCalls.navigateTo.at(-1).url, '/pages/auth/auth');
  assert.strictEqual(storage.deepLinkUrl, '/pages/community-publish/community-publish');
});

test('community 已登录可进入发布页，定位参数经过校验后打开地图', () => {
  const page = loadPage('pages/community/community.js');
  storage.userInfo = { nickname: '测试用户' };
  storage.lastLoginTime = Date.now();

  page.onPublish();
  assert.strictEqual(wxCalls.navigateTo.at(-1).url, '/pages/community-publish/community-publish');

  page.onOpenLocation({ currentTarget: { dataset: { lat: 91, lng: 116.4, name: '错误位置' } } });
  assert.strictEqual(wxCalls.openLocation.length, 0);

  page.onOpenLocation({
    currentTarget: {
      dataset: { lat: 39.9, lng: 116.4, name: '北京', address: '北京市' }
    }
  });
  assert.deepStrictEqual(wxCalls.openLocation[0], {
    latitude: 39.9,
    longitude: 116.4,
    name: '北京',
    address: '北京市',
    scale: 16
  });
});

test('community-publish 纯文字发布不申请 COS 上传会话', async () => {
  const page = loadPage('pages/community-publish/community-publish.js');
  storage.userInfo = { nickname: '测试用户' };
  storage.lastLoginTime = Date.now();
  app.globalData.userInfo = storage.userInfo;
  page.setData({ content: '今天去爬山', contentLength: 6 });

  await page.onSubmit();

  const communityCalls = wxCalls.cloudCalls.filter((call) => (
    call.name === 'api' && call.data.action.startsWith('community/')
  ));
  assert.deepStrictEqual(communityCalls.map((call) => call.data.action), ['community/create']);
  assert.strictEqual(communityCalls[0].data.data.content, '今天去爬山');
  assert.strictEqual(communityCalls[0].data.data.images, undefined);
  assert.strictEqual(latestToast().title, '发布成功');
});

test('community-publish 图片重试沿用原上传位置，不串图', async () => {
  const page = loadPage('pages/community-publish/community-publish.js');
  const cosModulePath = path.join(miniRoot, 'utils/cos-upload.js');
  const cosUpload = require(cosModulePath);
  const uploaded = [];
  cosUpload.uploadImage = async (filePath, uploadItem, session, onProgress) => {
    uploaded.push({ filePath, key: uploadItem.cosKey, draftId: session.draftId });
    onProgress(100);
    return { key: uploadItem.cosKey, url: `${session.baseUrl}/${uploadItem.cosKey}` };
  };

  page.setData({
    images: [
      {
        id: 'img-0',
        path: 'wxfile://0.jpg',
        status: 'done',
        uploadIndex: 0,
        cosKey: 'miniapp/community/draft/key-0.jpg',
        url: 'https://cos.example/key-0.jpg',
        mimeType: 'image/jpeg',
        size: 100
      },
      {
        id: 'img-1',
        path: 'wxfile://1.jpg',
        status: 'pending',
        uploadIndex: 1,
        mimeType: 'image/jpeg',
        size: 200
      }
    ]
  });

  const result = await page._doUpload({
    draftId: 'draft-1',
    baseUrl: 'https://cos.example',
    uploadItems: [
      { cosKey: 'miniapp/community/draft/key-0.jpg', allowedMime: 'image/jpeg' },
      { cosKey: 'miniapp/community/draft/key-1.jpg', allowedMime: 'image/jpeg' }
    ]
  });

  assert.deepStrictEqual(uploaded, [{
    filePath: 'wxfile://1.jpg',
    key: 'miniapp/community/draft/key-1.jpg',
    draftId: 'draft-1'
  }]);
  assert.deepStrictEqual(result.images.map((image) => image.key), [
    'miniapp/community/draft/key-0.jpg',
    'miniapp/community/draft/key-1.jpg'
  ]);
  assert.strictEqual(result.draftId, 'draft-1');
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
