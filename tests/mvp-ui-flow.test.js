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
    getFileInfo: ({ success }) => success({ size: 1024 }),
    getImageInfo: ({ success }) => success({ width: 200, height: 200, type: 'jpeg' }),
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
          if (data.action === 'tripMedia/createUploadSession') {
            return {
              result: {
                success: true,
                sessionId: 'avatar-session-1',
                bucket: 'test-bucket-1234567890',
                region: 'ap-beijing',
                baseUrl: 'https://cos.example.com',
                uploadItems: [{ index: 0, cosKey: 'miniapp/user-avatars/test-avatar.jpg', allowedMime: 'image/jpeg' }],
                credentials: { tmpSecretId: 'tmp-id', tmpSecretKey: 'tmp-key', sessionToken: 'token', startTime: 1, expiredTime: 2 }
              }
            };
          }
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

function mockCosUpload() {
  const cosUpload = require(path.join(miniRoot, 'utils/cos-upload.js'));
  cosUpload.uploadImage = async (filePath, uploadItem, session, onProgress) => {
    if (onProgress) onProgress(100);
    wxCalls.cosUploads = wxCalls.cosUploads || [];
    wxCalls.cosUploads.push({ filePath, key: uploadItem.cosKey });
    return { key: uploadItem.cosKey, url: `${session.baseUrl}/${uploadItem.cosKey}` };
  };
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('app.json 默认首页是社区，tabBar 顺序为社区、行程、我的', () => {
  const appJson = JSON.parse(read('miniprogram/app.json'));
  const navJs = read('miniprogram/utils/nav.js');
  const settingsJs = read('miniprogram/pages/settings/settings.js');
  assert.strictEqual(appJson.pages[0], 'pages/community/community');
  assert(appJson.pages.includes('pages/message-center/message-center'));
  assert.deepStrictEqual(appJson.tabBar.list.map((item) => item.pagePath), [
    'pages/community/community',
    'pages/trip-list/trip-list',
    'pages/profile/profile'
  ]);
  assert(navJs.includes("const HOME_PAGE = '/pages/community/community'"));
  assert(settingsJs.includes('nav.goHome()'), '退出登录应返回社区首页');
});

test('消息中心使用系统头部并支持全部、行程和互动筛选', () => {
  const json = JSON.parse(read('miniprogram/pages/message-center/message-center.json'));
  assert.strictEqual(json.navigationBarTitleText, '消息中心');
  assert.notStrictEqual(json.navigationStyle, 'custom');

  const wxml = read('miniprogram/pages/message-center/message-center.wxml');
  ['data-filter="all"', 'data-filter="trip"', 'data-filter="interaction"',
    'bindtap="onMarkAllRead"', 'class="message-row ', 'class="message-unread-dot"'].forEach((needle) => {
    assert(wxml.includes(needle), `message-center missing ${needle}`);
  });

  const js = read('miniprogram/pages/message-center/message-center.js');
  ['api.notificationList({', 'api.notificationMarkRead(message._id)',
    "api.notificationMarkAllRead('')", 'onReachBottom', 'api.applyHandle(message.applyId, accept)',
    "'/pages/community-detail/community-detail?id='"].forEach((needle) => {
    assert(js.includes(needle), `message-center missing behavior ${needle}`);
  });
  ['申请加入「{{item.tripTitle}}」', 'data-accept="false">拒绝', 'data-accept="true">同意', '已同意', '已拒绝'].forEach((needle) => {
    assert(wxml.includes(needle), `message-center missing application UI ${needle}`);
  });
  assert(!js.includes('/pages/trip-notifications/trip-notifications'), 'message center should not use the old trip notification page');
  assert(js.includes("'/images/xing-logo.png'"), 'system notifications should use the product logo');
  assert(!wxml.includes('message-trip-avatar'), 'trip notification avatars should stay circular');
  assert(js.includes("message.sourceType === 'comment' || message.sourceType === 'reply'"),
    'comment notifications should request comment-section focus');

  const profileJs = read('miniprogram/pages/profile/profile.js');
  assert(profileJs.includes("auth.navigateIfLoggedIn('/pages/message-center/message-center')"));
  assert(profileJs.includes('api.notificationUnreadCount()'));
});

test('trip-list UI 含筛选栏、行程卡片、空状态发布按钮和悬浮发布按钮', () => {
  const wxml = read('miniprogram/pages/trip-list/trip-list.wxml');
  ['data-filter="destination"', 'data-filter="departure"', 'data-filter="date"', 'bindtap="onPublishTrip"', 'class="trip-card"', '还没有人发起这段旅程'].forEach((needle) => {
    assert(wxml.includes(needle), `missing ${needle}`);
  });
  ['class="trip-card-cover"', 'class="trip-card-avatar-cover"', 'class="trip-creator-avatar"',
    'class="trip-card-title-row"', 'class="trip-card-footer"', 'class="trip-publish-time"'].forEach((needle) => {
    assert(wxml.includes(needle), `trip-list missing large-card element ${needle}`);
  });
  assert(!wxml.includes('查看详情'), 'trip-list should use whole-card navigation without a detail link');
  const js = read('miniprogram/pages/trip-list/trip-list.js');
  assert(js.includes("const creatorAvatar = creator.avatar || trip.creatorAvatar || '';"),
    'trip-list should fall back to creator avatar when no trip/place cover exists');
  assert(js.includes('formatPublishTime'), 'trip-list should format the trip publication time');
});

test('我的行程复用大图卡片并支持头像兜底', () => {
  const wxml = read('miniprogram/pages/my-trips/my-trips.wxml');
  ['data-tab="all"', 'data-tab="created"', 'data-tab="joined"', 'data-tab="ended"',
    'class="trip-card-cover"', 'class="trip-card-avatar-cover"', 'class="trip-creator-avatar"',
    'catchtap="onManageTap"', 'class="trip-publish-time"'].forEach((needle) => {
    assert(wxml.includes(needle), `my-trips missing ${needle}`);
  });
  assert(!wxml.includes('查看详情'), 'my-trips should use whole-card navigation without a detail link');
  const js = read('miniprogram/pages/my-trips/my-trips.js');
  assert(js.includes("const creatorAvatar = creator.avatar || item.creatorAvatar || '';"),
    'my-trips should fall back to creator avatar when no trip/place cover exists');
  assert(js.includes('formatPublishTime'), 'my-trips should format the trip publication time');
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
  const pageJson = JSON.parse(read('miniprogram/pages/profile/profile.json'));
  const wxml = read('miniprogram/pages/profile/profile.wxml');
  const js = read('miniprogram/pages/profile/profile.js');
  assert.strictEqual(pageJson.navigationBarTextStyle, 'black', 'profile should use dark system status-bar icons');
  ['点击登录', '关注', '粉丝', '获赞', '我的行程', '我的作品', '我的互动', '消息中心',
    '行程通知', '上传景点', '提交建议', '关于我们'].forEach((text) => {
    assert(wxml.includes(text), `missing ${text}`);
  });
  assert(wxml.includes('statusBarHeight + navBarHeight'), 'profile page should reserve capsule-safe height');
  assert(!wxml.includes('profile-nav-title'), 'profile page should not render a custom title');
  assert(wxml.includes('menu-group menu-group-secondary'), 'secondary functions should use the selected tight second group');
  assert(wxml.includes('bindtap="onTapReceivedLikes"'), 'received likes should open its count dialog');
  assert(js.includes("title: '累计获赞'") && js.includes("'你发布的作品共获得 ' + count + ' 个赞'"),
    'received likes dialog should show the current count');
  assert(!wxml.includes('>其他<'), 'profile should not render an extra section heading');
  assert(!wxml.includes('📅') && !wxml.includes('🔔'), 'profile should use real icon assets');

  const page = loadPage('pages/profile/profile.js');
  page.checkLogin();
  assert.strictEqual(page.data.isLoggedIn, false);

  ['onLogin', 'onTapMyTrips', 'onTapMyWorks', 'onTapInteractionRecords', 'onTapTripNotifications',
    'onTapUploadSpot', 'onTapFeedback', 'onTapAbout'].forEach((method) => {
    wxCalls.navigateTo = [];
    page[method]();
    assert.strictEqual(wxCalls.navigateTo.at(-1).url, '/pages/auth/auth', `${method} did not navigate to auth`);
  });
});

test('我的页面行程数使用真实行程列表，零行程时不展示', () => {
  const js = read('miniprogram/pages/profile/profile.js');
  const wxml = read('miniprogram/pages/profile/profile.wxml');
  assert(js.includes('api.tripMy()'), 'profile should load the real current-user trip list');
  assert(js.includes('tripResult.trips.length'), 'profile should derive the count from real trips');
  assert(!js.includes('trips: Math.max(0, Number(userInfo.trips)'), 'profile should ignore the historical cached trip counter');
  assert(wxml.includes('wx:if="{{stats.trips > 0}}"'), 'zero trip count should stay hidden');
});

test('我的互动使用系统头部并区分赞过和评论', () => {
  const pageJson = JSON.parse(read('miniprogram/pages/community-interactions/community-interactions.json'));
  const wxml = read('miniprogram/pages/community-interactions/community-interactions.wxml');
  const js = read('miniprogram/pages/community-interactions/community-interactions.js');
  assert.strictEqual(pageJson.navigationBarTitleText, '我的互动');
  assert.notStrictEqual(pageJson.navigationStyle, 'custom');
  ['data-tab="liked"', 'data-tab="commented"', '我的评论：',
    'icon-like-heart-active.svg', 'icon-comment-gray.svg',
    'bindtap="onOpenDetail"'].forEach((needle) => {
    assert(wxml.includes(needle), `community-interactions missing ${needle}`);
  });
  assert(!wxml.includes('评论过'));
  assert(js.includes('api.communityInteractions(request)'));
  assert(js.includes('removeLikedPost'));
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
  ['已发布', '已发布 · 待复核', '审核中', '待人工审核', '审核未通过'].forEach((needle) => {
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

test('auth 完成登录会先上传 wxfile 头像到 COS 并提交上传会话', async () => {
  const page = loadPage('pages/auth/auth.js');
  mockCosUpload();
  wxCalls.loginByPhoneIsNew = true;
  page.onAgreeChange();
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } });

  page.onNicknameInput({ detail: { value: '测试用户' } });
  page.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp_755cd2900a1262da09d2da57cea295b8.jpg' } });
  await page.onCompleteLogin();

  const uploadCall = wxCalls.cosUploads && wxCalls.cosUploads[0];
  assert(uploadCall, 'wxfile avatar should be uploaded before login');
  assert.strictEqual(uploadCall.filePath, 'wxfile://tmp_755cd2900a1262da09d2da57cea295b8.jpg');

  const loginCall = wxCalls.cloudCalls.find((call) => (
    call.name === 'api' &&
    call.data.action === 'user/loginByPhone' &&
    call.data.data.avatar
  ));
  assert(loginCall, 'user/loginByPhone should be called');
  assert(loginCall.data.data.avatar.startsWith('https://cos.example.com/'), 'login avatar should be COS URL');
  assert.strictEqual(loginCall.data.data.avatarUploadSessionId, 'avatar-session-1');
  assert.strictEqual(loginCall.data.data.avatarMedia.key, 'miniapp/user-avatars/test-avatar.jpg');
});

test('edit-profile UI 支持微信头像并上传 COS 头像', async () => {
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
  mockCosUpload();

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

  const uploadCall = wxCalls.cosUploads && wxCalls.cosUploads[0];
  assert(uploadCall, 'edit-profile wxfile avatar should be uploaded');
  assert.strictEqual(uploadCall.filePath, 'wxfile://tmp_profile_avatar.jpg');
  assert(page.data.userInfo.avatar.startsWith('https://cos.example.com/'), 'avatar should use COS URL');

  page.onSelectDistrict({ currentTarget: { dataset: { district: '朝阳区' } } });
  await page.onSave();
  const updateCall = wxCalls.cloudCalls.find((call) => call.name === 'api' && call.data.action === 'user/update');
  assert(updateCall, 'edit-profile should sync avatar to database after save');
  assert(updateCall.data.data.avatar.startsWith('https://cos.example.com/'), 'database avatar should be COS URL');
  assert.strictEqual(updateCall.data.data.avatarUploadSessionId, 'avatar-session-1');
  assert.strictEqual(updateCall.data.data.region, '朝阳区', 'selected region should be sent to the backend');
  assert(storage.userInfo.avatar.startsWith('https://cos.example.com/'), 'local profile should keep the durable COS URL');
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
  ['class="trip-card-cover"', 'class="trip-card-avatar-cover"', 'class="trip-creator-avatar"',
    'class="trip-card-title-row"', 'class="trip-card-meta-row"', 'class="trip-card-footer"',
    'class="trip-publish-time"'].forEach((needle) => {
    assert(wxml.includes(needle), `user-profile trip card should reuse homepage structure: ${needle}`);
  });
  assert(js.includes('formatTripPublishTime'), 'user-profile trip card should use homepage publish-time formatting');
  assert(js.includes('displayParticipants'), 'user-profile trip card should render participant avatars');
  assert(js.includes('statusClass'), 'user-profile trip card should render trip status');
  assert(js.includes('profileUpdated'), 'user-profile should receive saved profile fields through EventChannel');
  assert(js.includes('applyProfileUpdate'), 'user-profile should update profile fields without reloading the page');
  const onShowBody = js.match(/onShow:\s*function\s*\(\)\s*\{([\s\S]*?)\n\s*\},/);
  assert(onShowBody && !onShowBody[1].includes('loadUserProfile'), 'returning to user-profile should not reload all content');

  const json = JSON.parse(read('miniprogram/pages/user-profile/user-profile.json'));
  assert.strictEqual(json.navigationStyle, undefined, 'user-profile should use system navigation');
});

test('关注与粉丝页面使用选定胶囊标签方案并支持关注状态', () => {
  const appJson = JSON.parse(read('miniprogram/app.json'));
  const pageJson = JSON.parse(read('miniprogram/pages/followers/followers.json'));
  const wxml = read('miniprogram/pages/followers/followers.wxml');
  const wxss = read('miniprogram/pages/followers/followers.wxss');
  const js = read('miniprogram/pages/followers/followers.js');
  const profileWxml = read('miniprogram/pages/user-profile/user-profile.wxml');
  const profileJs = read('miniprogram/pages/user-profile/user-profile.js');
  const api = read('miniprogram/utils/api.js');
  const handler = read('cloudfunctions/api/handlers/user.js');
  const router = read('cloudfunctions/api/index.js');

  assert(appJson.pages.includes('pages/followers/followers'), 'followers page should be registered');
  assert.strictEqual(pageJson.navigationStyle, undefined, 'followers page should use system navigation');
  assert.strictEqual(pageJson.navigationBarBackgroundColor, '#ffffff',
    'followers system navigation should use white background');
  assert.strictEqual(pageJson.backgroundColor, '#ffffff',
    'followers page should use white background');
  ['关注 {{counts.following}}', '粉丝 {{counts.followers}}', 'follow-tabs', 'follow-row',
    'relationshipText'].forEach((needle) => {
    assert(wxml.includes(needle), `followers UI missing ${needle}`);
  });
  ['follow-button-follow', 'follow-button-following', 'follow-button-mutual'].forEach((needle) => {
    assert(wxss.includes(needle), `followers styles missing ${needle}`);
  });
  ['还没有关注的人', '还没有粉丝', '去社区看看', '去发布内容',
    'icon-follow-empty.svg', 'icon-followers-empty.svg'].forEach((needle) => {
    assert(wxml.includes(needle), `followers empty state missing ${needle}`);
  });
  assert(wxss.includes('follow-empty-action-primary'), 'following CTA should use solid blue style');
  assert(wxss.includes('follow-empty-action-outline'), 'followers CTA should use outline style');
  assert(js.includes('onEmptyAction'), 'followers empty-state CTA should be interactive');
  assert(js.includes("wx.switchTab({ url: '/pages/community/community' })"),
    'following empty CTA should open community');
  assert(js.includes("wx.navigateTo({ url: '/pages/community-publish/community-publish' })"),
    'followers empty CTA should open publish page');
  assert(js.includes('userFollowList'), 'followers page should load real relationship data');
  assert(js.includes('userFollowToggle'), 'followers page should toggle follow state');
  assert(profileWxml.includes('profile-follow-btn'), 'other user profile should render follow button');
  assert(profileJs.includes('loadFollowStatus'), 'user profile should load follow status');
  assert(profileJs.includes('onOpenFollowList'), 'profile stats should open relationship list');
  ['userFollowStatus', 'userFollowToggle', 'userFollowList'].forEach((needle) => {
    assert(api.includes(needle), `api missing ${needle}`);
    assert(handler.includes(needle), `user handler missing ${needle}`);
  });
  ['user/followStatus', 'user/followToggle', 'user/followList'].forEach((route) => {
    assert(router.includes(route), `cloud route missing ${route}`);
  });
  assert(handler.includes("collection('user_follows')"), 'follow relationships should use user_follows');
  assert(handler.includes('不能关注自己'), 'follow handler should block self-follow');
  assert(handler.includes('runTransaction'), 'follow toggle should update relation and counters atomically');
});

test('申请加入行程直接发送，不再填写手机号和备注', () => {
  const tripDetail = read('miniprogram/pages/trip-detail/trip-detail.js');
  const placeDetail = read('miniprogram/pages/place-detail/place-detail.js');
  const appJson = read('miniprogram/app.json');
  [tripDetail, placeDetail].forEach((js) => {
    assert(js.includes('api.applyCreate({'), 'apply entry should call applyCreate directly');
    assert(!js.includes('contactValue:') && !js.includes('message:'), 'direct application should not submit contact or remarks');
    assert(js.includes("title: '申请已发送'"), 'direct application should confirm it was sent');
  });
  assert(!appJson.includes('pages/trip-notifications/trip-notifications'), 'old trip notification page should be removed');
});

test('行程和地点详情加载失败时不展示模拟数据', () => {
  const tripJs = read('miniprogram/pages/trip-detail/trip-detail.js');
  const tripWxml = read('miniprogram/pages/trip-detail/trip-detail.wxml');
  const placeJs = read('miniprogram/pages/place-detail/place-detail.js');
  const placeWxml = read('miniprogram/pages/place-detail/place-detail.wxml');

  assert(!tripJs.includes('loadMockTripDetail'), 'trip detail should not fall back to a fake trip');
  assert(!tripJs.includes("_id: 'trip_001'"), 'fake trip data should be removed');
  assert(tripWxml.includes('bindtap="onRetryTripDetail"'), 'trip detail should provide a retry state');
  assert(!placeJs.includes('loadMockPlaceDetail'), 'place detail should not fall back to a fake place');
  assert(!placeJs.includes("'place_001': {"), 'fake place data should be removed');
  assert(placeWxml.includes('bindtap="onRetryPlaceDetail"'), 'place detail should provide a retry state');
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

test('trip-publish 发布中防止重复提交并保留招募人数 0', async () => {
  const page = loadPage('pages/trip-publish/trip-publish.js');
  storage.userInfo = { nickname: '测试用户' };
  storage.lastLoginTime = Date.now();
  page.setData({
    placeName: '东灵山',
    departure: '海淀区',
    date: '2026-05-07',
    recruitCount: 0,
    contactPhone: '13800138000'
  });

  await page.onSubmit();
  await page.onSubmit();

  const createCalls = wxCalls.cloudCalls.filter((call) => call.name === 'api' && call.data.action === 'trip/create');
  assert.strictEqual(createCalls.length, 1, 'publishing state should block duplicate trip/create calls');
  assert.strictEqual(createCalls[0].data.data.needCount, 0, 'needCount 0 should be sent unchanged');
  assert(wxCalls.redirectTo[0].url.includes('needCount=0'), 'success page should receive needCount 0');
});

test('trip-publish-success 将招募人数 0 计入总人数', () => {
  const page = loadPage('pages/trip-publish-success/trip-publish-success.js');
  page.onLoad({ currentCount: '1', needCount: '0', placeName: '东灵山' });
  assert.strictEqual(page.data.currentCount, 1);
  assert.strictEqual(page.data.totalCount, 1);
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

test('community 关注频道和作者地区筛选会传给后端', async () => {
  const page = loadPage('pages/community/community.js');
  storage.userInfo = { nickname: '测试用户' };
  storage.lastLoginTime = Date.now();

  await page.onFeedTabTap({ currentTarget: { dataset: { feed: 'following' } } });
  let listCall = wxCalls.cloudCalls.filter((call) => (
    call.name === 'api' && call.data.action === 'community/list'
  )).at(-1);
  assert.strictEqual(listCall.data.data.feedType, 'following');
  assert.strictEqual(listCall.data.data.region, '');

  await page.onSelectRegion({ currentTarget: { dataset: { region: '朝阳区' } } });
  listCall = wxCalls.cloudCalls.filter((call) => (
    call.name === 'api' && call.data.action === 'community/list'
  )).at(-1);
  assert.strictEqual(listCall.data.data.feedType, 'following');
  assert.strictEqual(listCall.data.data.region, '朝阳区');
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
