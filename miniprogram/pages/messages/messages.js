// pages/messages/messages.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    messages: [],
    loading: true,
    isLoggedIn: false
  },

  onLoad: function () {
    this.checkLogin();
    this.loadMessages();
  },

  onShow: function () {
    this.checkLogin();
  },

  checkLogin: function () {
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });
  },

  loadMessages: function () {
    // 模拟数据
    const mockMessages = [
      {
        _id: 'msg_001',
        type: 'apply',
        title: '新的申请',
        content: '小王申请加入你的东灵山行程',
        isRead: false,
        createTime: '10分钟前'
      },
      {
        _id: 'msg_002',
        type: 'accept',
        title: '申请已通过',
        content: '小李同意了你的申请，可以一起去了！',
        isRead: true,
        createTime: '2小时前'
      },
      {
        _id: 'msg_003',
        type: 'invite',
        title: '收到邀请',
        content: '小张邀请你参加八达岭长城行程',
        isRead: true,
        createTime: '昨天'
      },
      {
        _id: 'msg_004',
        type: 'system',
        title: '系统通知',
        content: '欢迎来到北京去哪玩！快去发布你的第一个行程吧',
        isRead: true,
        createTime: '3天前'
      }
    ];

    this.setData({
      messages: mockMessages,
      loading: false
    });
  },

  // 点击消息
  onMessageTap: function (e) {
    const msgId = e.currentTarget.dataset.id;
    wx.showToast({ title: '查看消息详情', icon: 'none' });
  },

  // 登录
  onLogin: function () {
    app.wxLogin().then(userInfo => {
      this.setData({ isLoggedIn: true });
      this.loadMessages();
    });
  }
});
