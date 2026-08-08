// pages/profile/profile.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    unreadCount: 0,
    stats: {
      following: 0,
      followers: 0,
      receivedLikes: 0,
      trips: 0,
      works: 0
    }
  },

  onLoad: function () {
    const windowInfo = wx.getWindowInfo();
    const statusBarHeight = windowInfo.statusBarHeight || 0;
    let menuButton = null;
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      menuButton = wx.getMenuButtonBoundingClientRect();
    }
    const menuGap = menuButton && menuButton.top > statusBarHeight
      ? menuButton.top - statusBarHeight
      : 6;
    const navBarHeight = menuButton && menuButton.height
      ? menuButton.height + menuGap * 2
      : 44;
    this.setData({
      statusBarHeight,
      navBarHeight
    });

    this.checkLogin();
  },

  onShow: function () {
    this.checkLogin();
    if (this.data.isLoggedIn) {
      this.loadUserStats();
      this.loadUnreadCount();
    }
  },

  // 检查登录状态
  checkLogin: async function () {
    auth.syncToApp(app);

    const storedUserInfo = wx.getStorageSync('userInfo');
    const loggedIn = auth.isLoggedIn();

    this.setData({
      isLoggedIn: loggedIn,
      userInfo: storedUserInfo || null,
      stats: this.getStatsFromUser(storedUserInfo)
    });

    // 处理云存储链接
    if (storedUserInfo) {
      await this.convertCloudUrls();
    }
  },

  getStatsFromUser: function (userInfo) {
    userInfo = userInfo || {};
    return {
      following: Math.max(0, Number(userInfo.following) || 0),
      followers: Math.max(0, Number(userInfo.followers) || 0),
      receivedLikes: Math.max(0, Number(userInfo.receivedLikes) || 0),
      trips: Math.max(0, Number(userInfo.trips) || 0),
      works: Math.max(0, Number(userInfo.works) || 0)
    };
  },

  // 转换云存储链接为临时URL
  convertCloudUrls: async function () {
    const { avatar, background } = this.data.userInfo || {};
    const cloudUrls = [];

    if (avatar && avatar.startsWith('cloud://')) {
      cloudUrls.push(avatar);
    }
    if (background && background.startsWith('cloud://')) {
      cloudUrls.push(background);
    }

    if (cloudUrls.length > 0 && wx.cloud) {
      try {
        const urlRes = await wx.cloud.getTempFileURL({ fileList: cloudUrls });
        if (urlRes.fileList) {
          const updates = { userInfo: { ...this.data.userInfo } };
          urlRes.fileList.forEach(item => {
            if (item.tempFileURL) {
              if (item.fileID === avatar) {
                updates.userInfo.avatar = item.tempFileURL;
              }
              if (item.fileID === background) {
                updates.userInfo.background = item.tempFileURL;
              }
            }
          });
          this.setData(updates);
        }
      } catch (err) {
        console.warn('转换云存储链接失败', err);
      }
    }
  },

  // 加载用户统计
  loadUserStats: async function () {
    try {
      const storedUserInfo = wx.getStorageSync('userInfo') || this.data.userInfo;
      const userId = (storedUserInfo && (storedUserInfo.openid || storedUserInfo._id)) ||
        app.globalData.openid;
      if (!storedUserInfo || !userId) return;

      const result = await api.userGet(userId);
      const latestUserInfo = { ...storedUserInfo, ...(result.user || {}) };
      wx.setStorageSync('userInfo', latestUserInfo);
      app.globalData.userInfo = latestUserInfo;
      this.setData({ stats: this.getStatsFromUser(latestUserInfo) });
    } catch (err) {
      console.error('加载统计数据失败', err);
    }
  },

  // 加载未读消息数量
  loadUnreadCount: async function () {
    const openid = app.globalData.openid;
    if (!openid) return;

    try {
      const results = await Promise.all([
        api.applyUnreadCount(),
        api.communityNotifications({ pageSize: 100 })
      ]);
      const tripCount = results[0] && results[0].success
        ? Number(results[0].count) || 0
        : 0;
      const interactionCount = results[1] && results[1].success
        ? Number(results[1].unreadCount) || 0
        : 0;
      this.setData({ unreadCount: tripCount + interactionCount });
    } catch (err) {
      console.warn('加载未读消息数量失败', err);
    }
  },

  // 点击登录
  onLogin: function () {
    auth.ensureLogin();
  },

  // 编辑资料
  onEditProfile: function () {
    auth.navigateIfLoggedIn('/pages/edit-profile/edit-profile');
  },

  // 我的主页
  onTapMyProfile: function () {
    auth.navigateIfLoggedIn('/pages/user-profile/user-profile');
  },

  // 我的行程
  onTapMyTrips: function () {
    auth.navigateIfLoggedIn('/pages/my-trips/my-trips');
  },

  // 我的作品
  onTapMyWorks: function () {
    auth.navigateIfLoggedIn('/pages/community-mine/community-mine');
  },

  // 消息中心
  onTapTripNotifications: function () {
    auth.navigateIfLoggedIn('/pages/message-center/message-center');
  },

  // 我的互动
  onTapInteractionRecords: function () {
    auth.navigateIfLoggedIn('/pages/community-interactions/community-interactions');
  },

  onTapSocialStat: function (event) {
    if (!auth.ensureLogin()) return;
    const type = event.currentTarget.dataset.type;
    if (type === 'following' || type === 'followers') {
      wx.navigateTo({
        url: '/pages/followers/followers?type=' + type
      });
    }
  },

  // 上传景点
  onTapUploadSpot: function () {
    auth.navigateIfLoggedIn('/pages/upload-spot/upload-spot');
  },

  // 我的收藏
  onTapCollections: function () {
    if (auth.ensureLogin()) {
      wx.showToast({ title: '功能开发中', icon: 'none' });
    }
  },

  // 我的评论
  onTapComments: function () {
    auth.navigateIfLoggedIn('/pages/comments/comments');
  },

  // 关注/粉丝
  onTapFollow: function () {
    auth.navigateIfLoggedIn('/pages/followers/followers');
  },

  // 提交建议
  onTapFeedback: function () {
    auth.navigateIfLoggedIn('/pages/feedback/feedback');
  },

  // 关于我们
  onTapAbout: function () {
    auth.navigateIfLoggedIn('/pages/about/about');
  },

});
