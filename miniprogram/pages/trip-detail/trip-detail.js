// pages/trip-detail/trip-detail.js
const app = getApp();

Page({
  data: {
    statusBarHeight: 0,
    tripId: '',
    trip: {
      title: '周六灵山徒步',
      placeName: '东灵山',
      placeHighlight: '北京最高峰',
      placeImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
      date: '2026-04-05',
      dateText: '2026年4月5日 周六',
      departure: '海淀区集合',
      currentCount: 2,
      totalCount: 4,
      hasCar: true,
      status: 'open',
      remark: '周六早上8点在海淀黄庄地铁站B口集合，自驾前往灵山，预计10:30到达。下午4点返程。费用AA，油费+门票约150元/人。',
      creatorName: '张伟',
      creatorAvatar: 'https://i.pravatar.cc/100?img=1',
      creatorTripCount: 5,
      creatorRating: 98
    },
    participants: [
      { _id: 'p1', name: '张伟', avatar: 'https://i.pravatar.cc/100?img=1' },
      { _id: 'p2', name: '李明', avatar: 'https://i.pravatar.cc/100?img=5' }
    ],
    statusText: '招募中',
    remainCount: 2,
    joinBtnText: '申请加入',
    canJoin: true
  },

  onLoad: function (options) {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight });

    const tripId = options.id || 'trip_001';
    this.setData({ tripId });
    this.loadTripDetail();
  },

  // 加载行程详情
  loadTripDetail: function () {
    // 模拟数据
    const mockTrip = {
      _id: 'trip_001',
      title: '周六灵山徒步',
      placeName: '东灵山',
      placeHighlight: '北京最高峰',
      placeImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
      date: '2026-04-05',
      dateText: '2026年4月5日 周六',
      departure: '海淀区集合',
      currentCount: 2,
      totalCount: 4,
      needCount: 2,
      hasCar: true,
      status: 'open',
      remark: '周六早上8点在海淀黄庄地铁站B口集合，自驾前往灵山，预计10:30到达。下午4点返程。费用AA，油费+门票约150元/人。',
      creatorId: 'user_001',
      creatorName: '张伟',
      creatorAvatar: 'https://i.pravatar.cc/100?img=1',
      creatorTripCount: 5,
      creatorRating: 98
    };

    const mockParticipants = [
      { _id: 'p1', name: '张伟', avatar: 'https://i.pravatar.cc/100?img=1' },
      { _id: 'p2', name: '李明', avatar: 'https://i.pravatar.cc/100?img=5' }
    ];

    // 计算状态
    const statusMap = {
      'open': '招募中',
      'full': '已满员',
      'ended': '已结束',
      'cancelled': '已取消'
    };

    const statusText = statusMap[mockTrip.status] || '招募中';
    const remainCount = mockTrip.totalCount - mockTrip.currentCount;
    const canJoin = mockTrip.status === 'open' && remainCount > 0;
    const joinBtnText = canJoin ? '申请加入' : (mockTrip.status === 'full' ? '已满员' : '不可加入');

    this.setData({
      trip: mockTrip,
      participants: mockParticipants,
      statusText,
      remainCount,
      canJoin,
      joinBtnText
    });
  },

  // 返回
  onBackTap: function () {
    wx.navigateBack();
  },

  // 更多操作
  onMoreTap: function () {
    wx.showActionSheet({
      itemList: ['分享行程', '举报行程'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 分享
          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage']
          });
        } else if (res.tapIndex === 1) {
          // 举报
          wx.showToast({ title: '举报成功', icon: 'success' });
        }
      }
    });
  },

  // 关注发起人
  onFollowTap: function () {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showToast({ title: '关注成功', icon: 'success' });
  },

  // 申请加入
  onJoinTap: function () {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (!this.data.canJoin) {
      return;
    }

    // 显示申请弹窗或直接跳转
    wx.showModal({
      title: '申请加入',
      content: `确定要加入"${this.data.trip.title}"吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '申请中...' });
          setTimeout(() => {
            wx.hideLoading();
            wx.showToast({ title: '申请成功', icon: 'success' });
          }, 500);
        }
      }
    });
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: `${this.data.trip.creatorName} 邀你一起去 ${this.data.trip.placeName}`,
      path: `/pages/trip-detail/trip-detail?id=${this.data.tripId}`,
      imageUrl: this.data.trip.placeImage
    };
  }
});
