// pages/trip-publish-success/trip-publish-success.js
Page({
  data: {
    tripId: '',
    placeId: '',
    placeName: '',
    placeAddress: '',
    tripImage: '',
    dateText: '',
    currentCount: 1,
    totalCount: 4
  },

  onLoad: function (options) {
    // 获取行程信息
    const tripId = options.tripId || '';
    const placeId = options.placeId || '';
    const placeName = decodeURIComponent(options.placeName || '未知地点');
    const placeAddress = decodeURIComponent(options.placeAddress || '北京市');
    const tripImage = options.tripImage ? decodeURIComponent(options.tripImage) : 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop';
    const dateText = decodeURIComponent(options.dateText || '');
    const currentCount = parseInt(options.currentCount) || 1;
    const needCount = parseInt(options.needCount) || 3;
    const totalCount = currentCount + needCount;

    this.setData({
      tripId,
      placeId,
      placeName,
      placeAddress,
      tripImage,
      dateText,
      currentCount,
      totalCount
    });
  },

  // 查看行程详情
  onViewTrip: function () {
    const tripId = this.data.tripId;
    if (tripId) {
      wx.redirectTo({
        url: '/pages/trip-detail/trip-detail?id=' + tripId
      });
    } else {
      wx.switchTab({
        url: '/pages/trip-notifications/trip-notifications'
      });
    }
  },

  // 返回地点详情
  onBackToPlace: function () {
    const placeId = this.data.placeId;
    if (placeId) {
      wx.redirectTo({
        url: '/pages/place-detail/place-detail?id=' + placeId
      });
    } else {
      wx.navigateBack();
    }
  }
});
