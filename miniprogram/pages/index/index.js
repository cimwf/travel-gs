// pages/index/index.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    places: [],
    categories: ['全部', '爬山', '露营', '古镇', '水上'],
    currentCategory: 0,
    loading: true,
    refreshing: false,
    isLoggedIn: false,
    userInfo: null,
    useCloud: true,

    // Banner数据
    banners: [
      {
        id: 'banner_1',
        title: '春季踏青推荐',
        desc: '北京周边最美徒步路线',
        icon: '🏔️',
        bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        type: 'category',
        target: '爬山'
      },
      {
        id: 'banner_2',
        title: '露营好时节',
        desc: '带上帐篷，一起看星星',
        icon: '🏕️',
        bgColor: 'linear-gradient(135deg, #56AB2F 0%, #A8E6CF 100%)',
        type: 'category',
        target: '露营'
      },
      {
        id: 'banner_3',
        title: '周末去哪玩',
        desc: '精选一日游目的地',
        icon: '🌸',
        bgColor: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
        type: 'place',
        target: 'place_001'
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
    this.setData({ loading: true });

    // 尝试使用云开发
    if (wx.cloud && this.data.useCloud) {
      try {
        const result = await api.placeList({});
        this.setData({
          places: result.places,
          loading: false
        });
        return;
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
        name: '灵山',
        image: 'https://picsum.photos/400/300?random=1',
        category: '爬山',
        distance: 150,
        difficulty: '中等',
        rating: '4.8',
        desc: '北京最高峰，海拔2303米',
        wantCount: 32,
        tags: ['爬山', '看日出', '露营']
      },
      {
        _id: 'place_002',
        name: '百花山',
        image: 'https://picsum.photos/400/300?random=2',
        category: '爬山',
        distance: 95,
        difficulty: '中等',
        rating: '4.6',
        desc: '夏季野花盛开，色彩斑斓',
        wantCount: 28,
        tags: ['爬山', '赏花', '徒步']
      },
      {
        _id: 'place_003',
        name: '龙庆峡',
        image: 'https://picsum.photos/400/300?random=3',
        category: '水上',
        distance: 85,
        difficulty: '易',
        rating: '4.5',
        desc: '峡谷风光，冰灯艺术节',
        wantCount: 41,
        tags: ['峡谷', '冰灯', '游船']
      },
      {
        _id: 'place_004',
        name: '香山',
        image: 'https://picsum.photos/400/300?random=4',
        category: '爬山',
        distance: 25,
        difficulty: '易',
        rating: '4.7',
        desc: '红叶胜地，秋季赏枫',
        wantCount: 56,
        tags: ['红叶', '徒步', '赏秋']
      },
      {
        _id: 'place_005',
        name: '古北水镇',
        image: 'https://picsum.photos/400/300?random=5',
        category: '古镇',
        distance: 140,
        difficulty: '易',
        rating: '4.8',
        desc: '长城脚下的水乡古镇',
        wantCount: 67,
        tags: ['古镇', '夜景', '拍照']
      },
      {
        _id: 'place_006',
        name: '海坨山',
        image: 'https://picsum.photos/400/300?random=6',
        category: '露营',
        distance: 180,
        difficulty: '中等',
        rating: '4.4',
        desc: '高山草甸，露营观星',
        wantCount: 25,
        tags: ['露营', '观星', '徒步']
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
    const { id, type, target } = e.currentTarget.dataset;

    if (type === 'category') {
      // 跳转到分类
      const index = this.data.categories.indexOf(target);
      if (index > -1) {
        this.setData({ currentCategory: index });
        this.onCategoryChange({ currentTarget: { dataset: { index } } });
      }
    } else if (type === 'place') {
      // 跳转到地点详情
      this.onPlaceTap({ currentTarget: { dataset: { id: target } } });
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

  // 切换分类
  onCategoryChange: async function (e) {
    const index = e.currentTarget.dataset.index;
    const category = this.data.categories[index];

    this.setData({ currentCategory: index, loading: true });

    // 使用云开发
    if (wx.cloud && this.data.useCloud) {
      try {
        const result = await api.placeList({ category: category === '全部' ? '' : category });
        this.setData({
          places: result.places,
          loading: false
        });
        return;
      } catch (err) {
        console.warn('云开发加载失败', err);
      }
    }

    // 使用mock数据筛选
    this.loadMockPlaces();
    if (category !== '全部') {
      const allPlaces = this.data.places;
      const filtered = allPlaces.filter(p => p.category === category);
      this.setData({
        places: filtered,
        loading: false
      });
    }
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

  // 发布行程
  onPublishTap: function () {
    // 检查是否需要登录
    if (auth.checkNeedLogin()) {
      auth.goToLogin('/pages/trip-publish/trip-publish');
      return;
    }
    wx.navigateTo({
      url: '/pages/trip-publish/trip-publish'
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.setData({ refreshing: true });
    this.loadPlaces();
  }
});
