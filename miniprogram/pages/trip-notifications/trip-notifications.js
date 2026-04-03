// pages/trip-notifications/trip-notifications.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 0,
    activeTab: 'apply',
    applyList: [],
    inviteList: []
  },

  onLoad: function (options) {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight });

    // 设置默认标签
    const tab = options.tab || 'apply';
    this.setData({ activeTab: tab });

    // 加载数据
    this.loadNotifications();
  },

  onShow: function () {
    this.loadNotifications();
  },

  // 加载通知数据
  loadNotifications: function () {
    // 模拟申请通知数据
    const mockApplyList = [
      {
        _id: 'apply_001',
        userName: '李明',
        avatarBg: 'linear-gradient(135deg, #FF6B6B, #FF8E53)',
        tripName: '周六灵山徒步',
        timeAgo: '10分钟前',
        phone: '138****8888',
        introduction: '有户外经验，可以分摊油费',
        isHandled: false
      },
      {
        _id: 'apply_002',
        userName: '王小华',
        avatarBg: 'linear-gradient(135deg, #56AB2F, #A8E6CF)',
        tripName: '周六灵山徒步',
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
        userName: '张伟',
        avatarBg: 'linear-gradient(135deg, #4A90E2, #6BA3E8)',
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
        userName: '小李',
        avatarBg: 'linear-gradient(135deg, #f093fb, #f5576c)',
        placeName: '百花山',
        tripDate: '4/6',
        hasCar: false,
        timeAgo: '2小时前',
        isHandled: true,
        status: 'ignored',
        statusText: '已忽略'
      }
    ];

    this.setData({
      applyList: mockApplyList,
      inviteList: mockInviteList
    });
  },

  // 返回
  onBackTap: function () {
    wx.navigateBack();
  },

  // 切换标签
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 拒绝申请
  onRejectApply: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认拒绝',
      content: '确定要拒绝此申请吗？',
      success: (res) => {
        if (res.confirm) {
          this.updateApplyStatus(id, 'rejected', '已拒绝');
        }
      }
    });
  },

  // 同意申请
  onAgreeApply: function (e) {
    const id = e.currentTarget.dataset.id;
    this.updateApplyStatus(id, 'agreed', '已同意');
  },

  // 更新申请状态
  updateApplyStatus: function (id, status, statusText) {
    const applyList = this.data.applyList.map(item => {
      if (item._id === id) {
        return { ...item, isHandled: true, status, statusText };
      }
      return item;
    });
    this.setData({ applyList });
    wx.showToast({ title: '操作成功', icon: 'success' });
  },

  // 忽略邀请
  onIgnoreInvite: function (e) {
    const id = e.currentTarget.dataset.id;
    this.updateInviteStatus(id, 'ignored', '已忽略');
  },

  // 查看行程
  onViewTrip: function (e) {
    const tripId = e.currentTarget.dataset.tripid;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 更新邀请状态
  updateInviteStatus: function (id, status, statusText) {
    const inviteList = this.data.inviteList.map(item => {
      if (item._id === id) {
        return { ...item, isHandled: true, status, statusText };
      }
      return item;
    });
    this.setData({ inviteList });
    wx.showToast({ title: '操作成功', icon: 'success' });
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '行程通知 - 北京去哪玩',
      path: '/pages/trip-notifications/trip-notifications'
    };
  }
});
