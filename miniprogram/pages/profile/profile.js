// pages/profile/profile.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    showLoginModal: false,
    stats: {
      published: 0,
      wanted: 0,
      completed: 0
    },
    menuList: [
      { icon: '📝', text: '我发布的行程', key: 'published' },
      { icon: '📬', text: '我收到的申请', key: 'received' },
      { icon: '📤', text: '我发起的申请', key: 'applied' }
    ],
    settingsList: [
      { icon: '⚙️', text: '设置', key: 'settings' },
      { icon: '❓', text: '帮助与反馈', key: 'help' },
      { icon: 'ℹ️', text: '关于我们', key: 'about' }
    ]
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
    this.setData({ isLoggedIn, userInfo });
  },

  // 加载用户统计
  loadUserStats: async function () {
    try {
      // 获取我的行程
      const tripsRes = await api.tripMy();
      const published = tripsRes.trips.filter(t => t.creatorId === app.globalData.openid).length;
      
      // 获取想去的地方
      const wantsRes = await api.wantList();
      
      this.setData({
        stats: {
          published,
          wanted: wantsRes.wants.length,
          completed: 0
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

  // 菜单点击（检查登录）
  onMenuTap: function (e) {
    // 检查是否需要登录
    if (!auth.checkNeedLogin()) {
      // 已登录，执行实际操作
      this.doMenuAction(e.currentTarget.dataset.key);
    } else {
      // 未登录，跳转到登录页
      auth.goToLogin('/pages/profile/profile');
    }
  },

  // 实际菜单操作
  doMenuAction: function (key) {
    switch (key) {
      case 'published':
        wx.showToast({ title: '我发布的行程', icon: 'none' });
        break;
      case 'received':
        wx.showToast({ title: '我收到的申请', icon: 'none' });
        break;
      case 'applied':
        wx.showToast({ title: '我发起的申请', icon: 'none' });
        break;
      case 'settings':
        wx.showToast({ title: '设置', icon: 'none' });
        break;
      case 'help':
        wx.showToast({ title: '帮助与反馈', icon: 'none' });
        break;
      case 'about':
        wx.showToast({ title: '北京去哪玩 v1.0', icon: 'none' });
        break;
    }
  },

  // 保留原有方法兼容性
  onEditProfile: function () {
    if (!auth.checkNeedLogin()) {
      wx.showToast({ title: '功能开发中', icon: 'none' });
    } else {
      auth.goToLogin('/pages/profile/profile');
    }
  }
});
