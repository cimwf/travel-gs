// pages/profile/profile.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    unreadCount: 0,
    stats: {
      following: 0,
      followers: 0,
      trips: 0
    }
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.checkLogin();
    if (this.data.isLoggedIn) {
      this.loadUserStats();
    }
  },

  // 检查登录状态
  checkLogin: function () {
    const isLoggedIn = app.globalData.isLoggedIn;
    const userInfo = app.globalData.userInfo;

    // 获取存储的用户信息
    const storedUserInfo = wx.getStorageSync('userInfo');

    this.setData({
      isLoggedIn,
      userInfo: userInfo || storedUserInfo
    });
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

  // 点击登录
  onLogin: function () {
    auth.goToLogin('/pages/profile/profile');
  },

  // 编辑资料
  onEditProfile: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/edit-profile/edit-profile'
      });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 我的行程
  onTapMyTrips: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/my-trips/my-trips'
      });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 行程通知
  onTapNotifications: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/trip-notifications/trip-notifications'
      });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 我的收藏
  onTapCollections: function () {
    if (!auth.checkNeedLogin()) {
      wx.showToast({ title: '功能开发中', icon: 'none' });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 我的评论
  onTapComments: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/comments/comments'
      });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 关注/粉丝
  onTapFollow: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/followers/followers'
      });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 点击关注数
  onTapFollowing: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/followers/followers?tab=following'
      });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 点击粉丝数
  onTapFollowers: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/followers/followers?tab=followers'
      });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 点击行程数
  onTapTrips: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/my-trips/my-trips'
      });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 设置
  onTapSettings: function () {
    if (!auth.checkNeedLogin()) {
      wx.navigateTo({
        url: '/pages/settings/settings'
      });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  }
});
