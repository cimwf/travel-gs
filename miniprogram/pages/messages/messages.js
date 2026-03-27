// pages/messages/messages.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    messages: []
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.checkLogin();
  },

  // 检查登录状态
  checkLogin: function () {
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });

    if (isLoggedIn) {
      this.loadMessages();
    }
  },

  // 加载消息列表
  loadMessages: function () {
    this.setData({ loading: true });

    // 模拟数据
    setTimeout(() => {
      const messages = [
        {
          _id: '1',
          name: '灵山踏青小队',
          avatarText: '🏔️',
          avatarBg: 'linear-gradient(135deg, #4A90E2, #6BA3E8)',
          lastMessage: '小王: 明天几点出发？',
          time: '刚刚',
          unreadCount: 3,
          type: 'group'
        },
        {
          _id: '2',
          name: '李明',
          avatarText: '李',
          avatarBg: 'linear-gradient(135deg, #FF6B6B, #FF8E53)',
          lastMessage: '好的，那我们周末见！',
          time: '10:30',
          unreadCount: 0,
          type: 'private'
        },
        {
          _id: '3',
          name: '系统通知',
          avatarText: '🔔',
          avatarBg: 'linear-gradient(135deg, #8E8EA0, #4A4A68)',
          lastMessage: '您的行程申请已通过',
          time: '昨天',
          unreadCount: 1,
          type: 'system'
        },
        {
          _id: '4',
          name: '百花山看花团',
          avatarText: '🌸',
          avatarBg: 'linear-gradient(135deg, #56AB2F, #A8E6CF)',
          lastMessage: '行程已结束，期待下次出行！',
          time: '周二',
          unreadCount: 0,
          type: 'group'
        }
      ];

      this.setData({
        loading: false,
        messages
      });
    }, 300);
  },

  // 点击登录
  onTapLogin: function () {
    auth.goToLogin('/pages/messages/messages');
  },

  // 点击消息
  onTapMessage: function (e) {
    const { id, type } = e.currentTarget.dataset;

    // 清除未读
    const messages = this.data.messages.map(m =>
      m._id === id ? { ...m, unreadCount: 0 } : m
    );
    this.setData({ messages });

    // 根据类型跳转
    if (type === 'private' || type === 'group') {
      wx.navigateTo({
        url: '/pages/chat/chat?id=' + id
      });
    } else if (type === 'system') {
      wx.showToast({ title: '系统通知详情开发中', icon: 'none' });
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    if (this.data.isLoggedIn) {
      this.loadMessages();
    }
    wx.stopPullDownRefresh();
  }
});
