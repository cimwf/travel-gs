// pages/messages/messages.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    notifications: []
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
      this.loadNotifications();
    }
  },

  // 加载通知数据
  loadNotifications: function () {
    this.setData({ loading: true });

    // 模拟申请通知数据
    const mockApplyList = [
      {
        _id: 'apply_001',
        type: 'apply',
        userName: '李明',
        avatarBg: 'linear-gradient(135deg, #FF6B6B, #FF8E53)',
        headerTitle: '李明 申请加入您的行程',
        headerMeta: '周六灵山徒步',
        timeAgo: '10分钟前',
        phone: '138****8888',
        introduction: '有户外经验，可以分摊油费',
        isHandled: false
      },
      {
        _id: 'apply_002',
        type: 'apply',
        userName: '王小华',
        avatarBg: 'linear-gradient(135deg, #56AB2F, #A8E6CF)',
        headerTitle: '王小华 申请加入您的行程',
        headerMeta: '周六灵山徒步',
        timeAgo: '1小时前',
        isHandled: true,
        status: 'agreed',
        statusText: '已同意'
      }
    ];

    // 模拟邀请消息数据
    const mockInviteList = [
      {
        _id: 'invite_001',
        type: 'invite',
        userName: '张伟',
        avatarBg: 'linear-gradient(135deg, #4A90E2, #6BA3E8)',
        headerTitle: '张伟 邀请您一起游玩',
        headerMeta: '东灵山',
        placeName: '东灵山',
        tripDate: '4/5',
        hasCar: true,
        timeAgo: '30分钟前',
        phone: '139****6666',
        message: '周末一起去灵山看日出吧，我有车可以载你',
        tripId: 'trip_001',
        isHandled: false
      },
      {
        _id: 'invite_002',
        type: 'invite',
        userName: '小李',
        avatarBg: 'linear-gradient(135deg, #f093fb, #f5576c)',
        headerTitle: '小李 邀请您一起游玩',
        headerMeta: '百花山',
        placeName: '百花山',
        tripDate: '4/6',
        hasCar: false,
        timeAgo: '2小时前',
        isHandled: true,
        status: 'ignored',
        statusText: '已忽略'
      }
    ];

    // 合并列表，按时间排序（未处理的优先）
    const notifications = [...mockApplyList, ...mockInviteList].sort((a, b) => {
      if (a.isHandled !== b.isHandled) {
        return a.isHandled ? 1 : -1;
      }
      return 0;
    });

    setTimeout(() => {
      this.setData({
        loading: false,
        notifications
      });
    }, 300);
  },

  // 点击登录
  onTapLogin: function () {
    auth.goToLogin('/pages/messages/messages');
  },

  // 拒绝申请
  onRejectApply: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认拒绝',
      content: '确定要拒绝此申请吗？',
      success: (res) => {
        if (res.confirm) {
          this.updateNotificationStatus(id, 'rejected', '已拒绝');
        }
      }
    });
  },

  // 同意申请
  onAgreeApply: function (e) {
    const id = e.currentTarget.dataset.id;
    this.updateNotificationStatus(id, 'agreed', '已同意');
  },

  // 忽略邀请
  onIgnoreInvite: function (e) {
    const id = e.currentTarget.dataset.id;
    this.updateNotificationStatus(id, 'ignored', '已忽略');
  },

  // 查看行程
  onViewTrip: function (e) {
    const tripId = e.currentTarget.dataset.tripid;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 更新通知状态
  updateNotificationStatus: function (id, status, statusText) {
    const notifications = this.data.notifications.map(item => {
      if (item._id === id) {
        return { ...item, isHandled: true, status, statusText };
      }
      return item;
    });
    // 重新排序，将已处理的放到后面
    notifications.sort((a, b) => {
      if (a.isHandled !== b.isHandled) {
        return a.isHandled ? 1 : -1;
      }
      return 0;
    });
    this.setData({ notifications });
    wx.showToast({ title: '操作成功', icon: 'success' });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    if (this.data.isLoggedIn) {
      this.loadNotifications();
    }
    wx.stopPullDownRefresh();
  }
});
