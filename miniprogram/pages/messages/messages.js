// pages/messages/messages.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    showLoginModal: false,
    notifications: [],
    conversations: []
  },

  onLoad: function () {
    // 页面加载不强制检查，展示内容
  },

  onShow: function () {
    // 每次显示时检查登录状态，但不强制跳转
    this.checkLogin();
    if (this.data.isLoggedIn) {
      this.loadData();
    }
  },

  // 检查登录状态
  checkLogin: function () {
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });
  },

  // 页面跳转时检查登录
  onTapConversation: function () {
    if (!auth.checkNeedLogin()) {
      // 已登录，允许访问
      this.loadData();
    } else {
      // 未登录，跳转到登录页
      auth.goToLogin('/pages/messages/messages');
    }
  },

  // 加载数据
  loadData: async function () {
    // 模拟数据
    this.setData({
      notifications: [
        { _id: '1', type: 'apply', content: '小明申请加入你的「颐和园」行程', time: '刚刚' },
        { _id: '2', type: 'notice', content: '你的「长城」行程即将开始，记得准时参加', time: '1小时前' }
      ],
      conversations: [
        { _id: '1', name: '颐和园行程群', avatar: 'https://picsum.photos/100/100?random=1', lastMessage: '明天见！', lastTime: '10:30', unreadCount: 2 },
        { _id: '2', name: '小红', avatar: 'https://picsum.photos/100/100?random=2', lastMessage: '好的，没问题', lastTime: '昨天', unreadCount: 0 }
      ]
    });
  },

  // 点击登录按钮
  onTapLogin: function () {
    auth.goToLogin('/pages/messages/messages');
  },

  // 点击会话
  onTapConversation: function () {
    if (!auth.checkNeedLogin()) {
      // 已登录，允许访问
      this.onConversationTap();
    } else {
      // 未登录，跳转到登录页
      auth.goToLogin('/pages/messages/messages');
    }
  },

  // 实际处理会话点击
  onConversationTap: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({ title: '聊天功能开发中', icon: 'none' });
  }
});
