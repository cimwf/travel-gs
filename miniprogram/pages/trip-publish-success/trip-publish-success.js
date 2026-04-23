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
    const dateText = decodeURIComponent(options.dateText || '');
    const currentCount = parseInt(options.currentCount) || 1;
    const needCount = parseInt(options.needCount) || 3;
    const totalCount = currentCount + needCount;

    this.setData({
      tripId,
      placeId,
      dateText,
      currentCount,
      totalCount
    });

    // 从 quick_attractions 获取景点信息
    if (placeId && wx.cloud) {
      this.loadPlaceInfo(placeId);
    } else {
      // 没有 placeId 时用 URL 参数兜底
      const placeName = decodeURIComponent(options.placeName || '未知地点');
      const placeAddress = decodeURIComponent(options.placeAddress || '北京市');
      const tripImage = options.tripImage ? decodeURIComponent(options.tripImage) : 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop';
      this.setData({ placeName, placeAddress, tripImage });
    }
  },

  // 从 quick_attractions 加载景点信息
  loadPlaceInfo: async function (placeId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('quick_attractions').doc(placeId).get();
      if (res.data) {
        const place = res.data;
        let tripImage = place.coverImage || '';
        if (tripImage && tripImage.startsWith('cloud://')) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({
              fileList: [tripImage]
            });
            if (urlRes.fileList && urlRes.fileList[0]) {
              tripImage = urlRes.fileList[0].tempFileURL || tripImage;
            }
          } catch (err) {
            console.warn('获取图片临时链接失败', err);
          }
        }
        this.setData({
          placeName: place.name || place.placeName || '未知地点',
          placeAddress: place.location || place.address || '北京市',
          tripImage: tripImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop'
        });
      }
    } catch (err) {
      console.warn('加载景点信息失败', err);
    }
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

  // 返回行程页
  onBackToPlace: function () {
    wx.switchTab({
      url: '/pages/trip-list/trip-list'
    });
  }
});
