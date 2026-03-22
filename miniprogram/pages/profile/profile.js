// pages/profile/profile.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    stats: {
      published: 5,
      wanted: 12,
      completed: 8
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
  },

  checkLogin: function () {
    const isLoggedIn = app.globalData.isLoggedIn;
    const userInfo = app.globalData.userInfo;
    this.setData({ isLoggedIn, userInfo });
  },

  // 登录
  onLogin: function () {
    app.wxLogin().then(userInfo => {
      this.setData({
        userInfo: userInfo,
        isLoggedIn: true
      });
    }).catch(err => {
      console.error('登录失败', err);
    });
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
