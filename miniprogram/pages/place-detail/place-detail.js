// pages/place-detail/place-detail.js
const app = getApp();

Page({
  data: {
    place: null,
    trips: [],
    loading: true,
    isCollected: false,
    userInfo: null
  },

  onLoad: function (options) {
    const placeId = options.id || 'place_001';
    this.loadPlaceDetail(placeId);
    this.loadTrips(placeId);
    this.setData({ userInfo: app.globalData.userInfo });
  },

  onShow: function () {
    this.setData({ userInfo: app.globalData.userInfo });
  },

  // 加载地点详情
  loadPlaceDetail: function (placeId) {
    // 模拟数据
    const mockPlaces = {
      'place_001': {
        _id: 'place_001',
        name: '东灵山',
        images: [
          'https://picsum.photos/400/300?random=1',
          'https://picsum.photos/400/300?random=2',
          'https://picsum.photos/400/300?random=3',
          'https://picsum.photos/400/300?random=4'
        ],
        description: '北京最高峰，海拔2303米，位于门头沟区。山顶有高山草甸，夏季野花遍地，秋季层林尽染。是北京驴友必打卡之地。登顶可俯瞰群山，天气好时能看到远处的城市轮廓。',
        category: '自然风光',
        distance: 150,
        difficulty: '中等',
        rating: '4.9',
        bestSeason: '春夏秋',
        duration: '1天',
        altitude: '2303m',
        location: '北京市门头沟区清水镇',
        openTime: '全天开放',
        tags: ['爬山', '看日出', '露营', '高山草甸'],
        wantCount: 32,
        tips: '建议凌晨出发看日出，带足保暖衣物，山顶温度较低。注意防晒和补水，建议穿登山鞋。'
      }
    };

    const place = mockPlaces[placeId] || mockPlaces['place_001'];
    
    // 检查是否已收藏
    const collections = wx.getStorageSync('collections') || [];
    const isCollected = collections.includes(place._id);
    
    this.setData({ place, isCollected, loading: false });
  },

  // 加载该地点的行程列表
  loadTrips: function (placeId) {
    // 模拟数据
    const mockTrips = [
      {
        _id: 'trip_001',
        userName: '户外小王',
        userAvatar: 'https://picsum.photos/100/100?random=10',
        date: '03-25 周三',
        hasCar: true,
        currentCount: 2,
        needCount: 2,
        remark: '有车求队友，AA制，早上6点出发',
        status: 'open'
      },
      {
        _id: 'trip_002',
        userName: '旅行达人',
        userAvatar: 'https://picsum.photos/100/100?random=11',
        date: '03-26 周四',
        hasCar: false,
        currentCount: 1,
        needCount: 3,
        remark: '无车等拼车，可以分摊油费',
        status: 'open'
      },
      {
        _id: 'trip_003',
        userName: '周末玩家',
        userAvatar: 'https://picsum.photos/100/100?random=12',
        date: '03-27 周五',
        hasCar: true,
        currentCount: 1,
        needCount: 3,
        remark: '周末自驾，有车，求3人同行',
        status: 'open'
      }
    ];

    this.setData({ trips: mockTrips });
  },

  // 返回
  onBackTap: function () {
    wx.navigateBack();
  },

  // 分享按钮
  onShareTap: function () {
    // 触发分享
  },

  // 收藏
  onCollectTap: function () {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const isCollected = !this.data.isCollected;
    const placeId = this.data.place._id;
    
    // 更新本地收藏列表
    let collections = wx.getStorageSync('collections') || [];
    if (isCollected) {
      collections.push(placeId);
      wx.showToast({ title: '已收藏', icon: 'success' });
    } else {
      collections = collections.filter(id => id !== placeId);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    }
    wx.setStorageSync('collections', collections);
    
    this.setData({ isCollected });
  },

  // 发布行程
  onPublishTrip: function () {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/trip-publish/trip-publish?placeId=${this.data.place._id}&placeName=${this.data.place.name}`
    });
  },

  // 申请加入
  onApplyTap: function (e) {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const tripId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '申请加入',
      content: '确认申请加入这个行程吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '申请已发送', icon: 'success' });
        }
      }
    });
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: `一起去${this.data.place.name}吧！`,
      path: `/pages/place-detail/place-detail?id=${this.data.place._id}`
    };
  }
});