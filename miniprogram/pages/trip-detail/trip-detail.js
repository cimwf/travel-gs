// pages/trip-detail/trip-detail.js
const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    tripId: '',
    trip: {},
    participants: [],
    statusText: '招募中',
    remainText: '剩余名额',
    joinBtnText: '申请加入',
    canJoin: false
  },

  onLoad: function (options) {
    this.setData({ tripId: options.id });
    this.loadTripDetail();
  },

  // 加载行程详情
  loadTripDetail: async function () {
    try {
      const res = await api.tripGet(this.data.tripId);
      const trip = res.trip;
      
      // 计算状态文本
      let statusText = '招募中';
      if (trip.status === 'full') statusText = '已满员';
      else if (trip.status === 'cancelled') statusText = '已取消';
      else if (trip.status === 'ended') statusText = '已结束';
      
      // 计算剩余名额
      const remain = trip.maxParticipants - (trip.currentCount || 1);
      const remainText = remain > 0 ? `剩余${remain}位` : '已满员';
      
      // 是否可以加入
      const isLoggedIn = app.globalData.isLoggedIn;
      const isCreator = trip.creatorId === app.globalData.openid;
      const canJoin = isLoggedIn && trip.status === 'open' && remain > 0 && !isCreator;
      
      // 加入按钮文本
      let joinBtnText = '申请加入';
      if (!isLoggedIn) joinBtnText = '请先登录';
      else if (isCreator) joinBtnText = '我发起的';
      else if (trip.status !== 'open') joinBtnText = '不可加入';
      else if (remain <= 0) joinBtnText = '已满员';
      
      this.setData({
        trip,
        participants: trip.participants || [],
        statusText,
        remainText,
        canJoin,
        joinBtnText
      });
    } catch (err) {
      console.error('加载行程详情失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 跳转地点详情
  onPlaceTap: function () {
    if (this.data.trip.placeId) {
      wx.navigateTo({
        url: `/pages/place-detail/place-detail?id=${this.data.trip.placeId}`
      });
    }
  },

  // 申请加入
  onJoinTap: async function () {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    
    if (!this.data.canJoin) {
      return;
    }
    
    try {
      await api.tripJoin(this.data.tripId);
      wx.showToast({ title: '申请成功', icon: 'success' });
      
      // 刷新详情
      setTimeout(() => {
        this.loadTripDetail();
      }, 1000);
    } catch (err) {
      console.error('申请加入失败', err);
      wx.showToast({ title: err.message || '申请失败', icon: 'none' });
    }
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
