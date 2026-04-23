// pages/profile/profile.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const nav = require('../../utils/nav.js');

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
    // 优先从storage读取最新数据
    const storedUserInfo = wx.getStorageSync('userInfo');
    const storedLoginTime = wx.getStorageSync('lastLoginTime');

    // 判断是否已登录：有用户信息且有登录时间
    const isLoggedIn = !!(storedUserInfo && storedUserInfo.nickname) && !!storedLoginTime;

    // 更新全局数据
    if (storedUserInfo && storedUserInfo.nickname) {
      app.globalData.userInfo = storedUserInfo;
      app.globalData.isLoggedIn = true;
    }

    this.setData({
      isLoggedIn,
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
    if (!openid || !wx.cloud) return;

    try {
      const db = wx.cloud.database();
      const _ = db.command;

      // 查询未处理的申请数量
      const res = await db.collection('applies')
        .where({
          toUserId: openid,
          type: _.in(['apply']),
          status: 'pending'
        })
        .count();

      this.setData({
        unreadCount: res.total || 0
      });
    } catch (err) {
      console.warn('加载未读消息数量失败', err);
    }
  },

  // 点击登录（默认跳转到注册页）
  onLogin: function () {
    nav.goToRegister();
  },

  // 编辑资料
  onEditProfile: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/edit-profile/edit-profile'
      });
    } else {
      nav.goToRegister('/pages/profile/profile');
    }
  },

  // 我的行程
  onTapMyTrips: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/my-trips/my-trips'
      });
    } else {
      nav.goToRegister('/pages/profile/profile');
    }
  },

  // 行程通知
  onTapTripNotifications: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/trip-notifications/trip-notifications'
      });
    } else {
      nav.goToRegister('/pages/trip-notifications/trip-notifications');
    }
  },

  // 我的收藏
  onTapCollections: function () {
    if (!auth.checkNeedLogin()) {
      wx.showToast({ title: '功能开发中', icon: 'none' });
    } else {
      nav.goToRegister('/pages/profile/profile');
    }
  },

  // 我的评论
  onTapComments: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/comments/comments'
      });
    } else {
      nav.goToRegister('/pages/profile/profile');
    }
  },

  // 关注/粉丝
  onTapFollow: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/followers/followers'
      });
    } else {
      nav.goToRegister('/pages/profile/profile');
    }
  },

  // 提交建议
  onTapFeedback: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/feedback/feedback'
      });
    } else {
      nav.goToRegister('/pages/feedback/feedback');
    }
  },

  // 关于我们
  onTapAbout: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/about/about'
      });
    } else {
      nav.goToRegister('/pages/about/about');
    }
  }
});
