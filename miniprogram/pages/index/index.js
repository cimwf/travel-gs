// pages/index/index.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    places: [],
    loading: true,
    refreshing: false,
    isLoggedIn: false,
    userInfo: null,

    // Banner数据
    banners: [
      {
        id: 'banner_1',
        title: '春季踏青推荐',
        icon: '🏔️',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        type: 'category',
        target: '爬山'
      },
      {
        id: 'banner_2',
        title: '露营好时节',
        icon: '🏕️',
        bgColor: 'linear-gradient(135deg, #56AB2F 0%, #A8E6CF 100%)',
        type: 'category',
        target: '露营'
      },
      {
        id: 'banner_3',
        title: '古镇漫游',
        icon: '🏮',
        bgColor: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
        type: 'category',
        target: '古镇'
      }
    ]
  },

  onLoad: function () {
    this.loadPlaces();
  },

  onShow: function () {
    this.checkLogin();
  },

  // 检查登录状态（首页不需要强制登录）
  checkLogin: function () {
    const isLoggedIn = app.globalData.isLoggedIn;
    const userInfo = app.globalData.userInfo;
    this.setData({ isLoggedIn, userInfo });
  },

  // 加载地点列表
  loadPlaces: async function () {
    // 首次加载显示loading，下拉刷新不显示
    if (this.data.places.length === 0) {
      this.setData({ loading: true });
    }

    // 尝试使用云开发
    if (wx.cloud) {
      try {
        const result = await api.placeList({});
        if (result.places && result.places.length > 0) {
          // 按 sortOrder 排序
          const places = result.places.sort((a, b) => {
            const orderA = a.sortOrder || 999;
            const orderB = b.sortOrder || 999;
            return orderA - orderB;
          });
          this.setData({
            places: places,
            loading: false
          });
          return;
        }
      } catch (err) {
        console.warn('云开发加载失败，使用本地数据', err);
      }
    }

    // 使用mock数据
    this.loadMockPlaces();
  },

  // 加载模拟数据（开发阶段）
  loadMockPlaces: function () {
    const mockPlaces = [
      {
        _id: 'place_001',
        name: '东灵山',
        icon: '🏔️',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        category: '爬山',
        location: { distance: 120 },
        difficulty: '困难',
        wantCount: 256,
        tags: ['日出', '云海', '露营']
      },
      {
        _id: 'place_002',
        name: '海坨山',
        icon: '🏕️',
        bgColor: 'linear-gradient(135deg, #56AB2F 0%, #A8E6CF 100%)',
        category: '爬山',
        location: { distance: 95 },
        difficulty: '中等',
        wantCount: 189,
        tags: ['露营', '日出', '高山草甸']
      },
      {
        _id: 'place_003',
        name: '十渡',
        icon: '💧',
        bgColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        category: '水上',
        location: { distance: 80 },
        difficulty: '简单',
        wantCount: 378,
        tags: ['漂流', '蹦极', '峡谷']
      },
      {
        _id: 'place_004',
        name: '香山',
        icon: '🍂',
        bgColor: 'linear-gradient(135deg, #FA8C16 0%, #FFC53D 100%)',
        category: '爬山',
        location: { distance: 20 },
        difficulty: '简单',
        wantCount: 423,
        tags: ['红叶', '皇家园林', '秋季']
      },
      {
        _id: 'place_005',
        name: '古北水镇',
        icon: '🏮',
        bgColor: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
        category: '古镇',
        location: { distance: 120 },
        difficulty: '简单',
        wantCount: 756,
        tags: ['夜景', '温泉', '长城脚下']
      }
    ];

    this.setData({
      places: mockPlaces,
      loading: false
    });
  },

  // 加载模拟数据（开发阶段）
  loadMockPlaces: function () {
    const mockPlaces = [
      {
        _id: 'place_001',
        name: '东灵山',
        icon: '🏔️',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        category: '爬山',
        location: { distance: 120 },
        difficulty: '困难',
        wantCount: 256,
        tags: ['日出', '云海', '露营']
      },
      {
        _id: 'place_002',
        name: '海坨山',
        icon: '🏕️',
        bgColor: 'linear-gradient(135deg, #56AB2F 0%, #A8E6CF 100%)',
        category: '爬山',
        location: { distance: 95 },
        difficulty: '中等',
        wantCount: 189,
        tags: ['露营', '日出', '高山草甸']
      },
      {
        _id: 'place_003',
        name: '十渡',
        icon: '💧',
        bgColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        category: '水上',
        location: { distance: 80 },
        difficulty: '简单',
        wantCount: 378,
        tags: ['漂流', '蹦极', '峡谷']
      },
      {
        _id: 'place_004',
        name: '香山',
        icon: '🍂',
        bgColor: 'linear-gradient(135deg, #FA8C16 0%, #FFC53D 100%)',
        category: '爬山',
        location: { distance: 20 },
        difficulty: '简单',
        wantCount: 423,
        tags: ['红叶', '皇家园林', '秋季']
      },
      {
        _id: 'place_005',
        name: '古北水镇',
        icon: '🏮',
        bgColor: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
        category: '古镇',
        location: { distance: 120 },
        difficulty: '简单',
        wantCount: 756,
        tags: ['夜景', '温泉', '长城脚下']
      }
    ];

    this.setData({
      places: mockPlaces,
      loading: false,
      refreshing: false
    });
  },

  // 点击Banner
  onBannerTap: function (e) {
    const { type, target } = e.currentTarget.dataset;
    if (type === 'category') {
      // 跳转到分类页面
      wx.navigateTo({
        url: `/pages/place-list/place-list?category=${target}`
      });
    }
  },

  // 点击搜索框
  onSearchTap: function () {
    // 检查是否需要登录
    if (auth.checkNeedLogin()) {
      auth.goToLogin('/pages/search/search');
      return;
    }
    wx.navigateTo({
      url: '/pages/search/search'
    });
  },

  // 点击地点卡片
  onPlaceTap: function (e) {
    const placeId = e.currentTarget.dataset.id;

    // 检查是否需要登录
    if (auth.checkNeedLogin()) {
      auth.goToLogin('/pages/place-detail/place-detail?id=' + placeId);
      return;
    }

    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${placeId}`
    });
  },

  // 下拉刷新
  onPullDownRefresh: async function () {
    this.setData({ refreshing: true });
    try {
      await this.loadPlaces();
    } finally {
      this.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    }
  }
});
