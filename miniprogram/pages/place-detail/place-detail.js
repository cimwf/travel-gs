// pages/place-detail/place-detail.js
const app = getApp();

Page({
  data: {
    place: null,
    trips: [],
    loading: true,
    isCollected: false,
    userInfo: null,
    statusBarHeight: 0,

    // 弹窗相关
    showApplyModal: false,
    showInviteModal: false,
    currentTrip: null,
    contactType: 'phone',
    contactValue: '',
    introduction: ''
  },

  onLoad: function (options) {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight });

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
    // 模拟数据 - 使用设计稿中的图片
    const mockPlaces = {
      'place_001': {
        _id: 'place_001',
        name: '东灵山',
        images: [
          'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=800&h=600&fit=crop'
        ],
        description: '东灵山位于北京市门头沟区清水镇，是北京最高峰，海拔2303米，被誉为"京西珠穆朗玛"。山顶有广阔的高山草甸，夏季野花遍地，色彩斑斓；秋季层林尽染，美不胜收。\n\n这里是北京驴友必打卡之地，也是观赏日出、云海的绝佳地点。山顶气温较低，夏季凉爽宜人，是避暑胜地；秋冬季节则可欣赏壮观的日出和云海奇观。',
        category: '山岳风光',
        distance: 150,
        difficulty: '中等',
        rating: '4.8',
        bestSeason: '春夏秋',
        duration: '1天',
        altitude: '2303m',
        location: '北京市门头沟区清水镇',
        openTime: '全天开放',
        tags: ['爬山', '看日出', '露营', '高山草甸'],
        wantCount: 32,
        tipsList: [
          '山顶气温较低，建议携带保暖衣物，即使是夏季也要准备外套',
          '建议凌晨出发看日出，需要提前查看天气情况',
          '山区信号较弱，建议提前下载离线地图',
          '带足饮用水和食物，山上没有补给点',
          '注意保护环境，带走自己的垃圾'
        ]
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
        userName: '小王',
        avatarBg: 'linear-gradient(135deg, #FF6B6B, #FF8E53)',
        date: '03月25日',
        hasCar: true,
        currentCount: 2,
        needCount: 2,
        remark: '有车求队友，AA制，早上6点出发'
      },
      {
        _id: 'trip_002',
        userName: '小李',
        avatarBg: 'linear-gradient(135deg, #4A90E2, #667eea)',
        date: '03月26日',
        hasCar: false,
        currentCount: 1,
        needCount: 3,
        remark: '无车等拼车，可以分摊油费'
      },
      {
        _id: 'trip_003',
        userName: '小张',
        avatarBg: 'linear-gradient(135deg, #56AB2F, #A8E6CF)',
        date: '03月27日',
        hasCar: true,
        currentCount: 1,
        needCount: 3,
        remark: '周末自驾，有车，求3人同行'
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
    // 触发分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
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

  // 点击申请加入/邀请他
  onApplyTap: function (e) {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const tripId = e.currentTarget.dataset.id;
    const hasCar = e.currentTarget.dataset.hascar;
    const trip = this.data.trips.find(t => t._id === tripId);

    if (trip) {
      this.setData({
        currentTrip: trip,
        contactType: 'phone',
        contactValue: '',
        introduction: ''
      });

      if (hasCar) {
        // 有车 - 显示申请加入弹窗
        this.setData({ showApplyModal: true });
      } else {
        // 无车 - 显示邀请弹窗
        this.setData({ showInviteModal: true });
      }
    }
  },

  // 选择联系方式类型
  onSelectContactType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ contactType: type, contactValue: '' });
  },

  // 输入联系方式
  onContactInput: function (e) {
    this.setData({ contactValue: e.detail.value });
  },

  // 输入自我介绍/留言
  onIntroductionInput: function (e) {
    this.setData({ introduction: e.detail.value });
  },

  // 关闭申请加入弹窗
  onCloseApplyModal: function () {
    this.setData({ showApplyModal: false });
  },

  // 关闭邀请弹窗
  onCloseInviteModal: function () {
    this.setData({ showInviteModal: false });
  },

  // 提交申请
  onSubmitApply: function () {
    if (!this.data.contactValue) {
      wx.showToast({ title: '请填写联系方式', icon: 'none' });
      return;
    }

    // TODO: 调用API提交申请
    wx.showToast({ title: '申请已发送', icon: 'success' });
    this.setData({ showApplyModal: false });
  },

  // 发送邀请
  onSubmitInvite: function () {
    if (!this.data.contactValue) {
      wx.showToast({ title: '请填写联系方式', icon: 'none' });
      return;
    }

    // TODO: 调用API发送邀请
    wx.showToast({ title: '邀请已发送', icon: 'success' });
    this.setData({ showInviteModal: false });
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: `一起去${this.data.place.name}吧！`,
      path: `/pages/place-detail/place-detail?id=${this.data.place._id}`
    };
  }
});
