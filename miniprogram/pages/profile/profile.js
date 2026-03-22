// pages/profile/profile.js
const app = getApp();
const api = require('../../utils/api.js');

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
    this.setData({ showLoginModal: true });
  },

  // 关闭登录弹窗
  onCloseLoginModal: function () {
    this.setData({ showLoginModal: false });
  },

  // 登录成功
  onLoginSuccess: function (e) {
    const user = e.detail.user;
    this.setData({
      userInfo: user,
      isLoggedIn: true,
      showLoginModal: false
    });
    this.loadUserStats();
  },

  // 编辑资料
  onEditProfile: function () {
    if (!this.data.isLoggedIn) {
      this.onLogin();
      return;
    }
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  // 菜单点击
  onMenuTap: function (e) {
    if (!this.data.isLoggedIn) {
      this.onLogin();
      return;
    }

    const key = e.currentTarget.dataset.key;
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
  }
});
