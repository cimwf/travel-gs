// pages/profile/profile.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    statusBarHeight: 0,
    unreadCount: 0,
    stats: {
      following: 0,
      followers: 0,
      trips: 0
    }
  },

  onLoad: function () {
    // 获取状态栏高度
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });

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
      userInfo: storedUserInfo || null
    });

    // 处理云存储链接
    if (storedUserInfo) {
      await this.convertCloudUrls();
    }
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
      // 模拟数据
      this.setData({
        stats: {
          following: 12,
          followers: 28,
          trips: 5
        }
      });
    } catch (err) {
      console.error('加载统计数据失败', err);
    }
  },

  // 加载未读消息数量
  loadUnreadCount: async function () {
    const openid = app.globalData.openid;
    if (!openid) return;

    try {
      const res = await api.applyUnreadCount();

      if (res.success) {
        this.setData({
          unreadCount: res.count || 0
        });
      }
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

  // 我的行程
  onTapMyTrips: function () {
    auth.navigateIfLoggedIn('/pages/my-trips/my-trips');
  },

  // 行程通知
  onTapTripNotifications: function () {
    auth.navigateIfLoggedIn('/pages/trip-notifications/trip-notifications');
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
