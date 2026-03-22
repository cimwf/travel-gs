// pages/index/index.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    places: [],
    categories: ['全部', '爬山', '古镇', '露营', '水上'],
    currentCategory: 0,
    loading: true,
    userInfo: null,
    isLoggedIn: false
  },

  onLoad: function () {
    this.checkLogin();
    this.loadPlaces();
  },

  onShow: function () {
    this.checkLogin();
  },

  // 检查登录状态
  checkLogin: function () {
    const isLoggedIn = app.globalData.isLoggedIn;
    const userInfo = app.globalData.userInfo;
    this.setData({ isLoggedIn, userInfo });
  },

  // 加载地点列表
  loadPlaces: function () {
    this.setData({ loading: true });
    
    // 开发模式：直接使用模拟数据
    this.loadMockPlaces();
  },

  // 加载模拟数据（开发阶段）
  loadMockPlaces: function () {
    const mockPlaces = [
      {
        _id: 'place_001',
        name: '东灵山',
        image: 'https://picsum.photos/400/300?random=1',
        category: '爬山',
        distance: 150,
        difficulty: '中等',
        wantCount: 32,
        tags: ['爬山', '看日出', '露营']
      },
      {
        _id: 'place_002',
        name: '八达岭长城',
        image: 'https://picsum.photos/400/300?random=2',
        category: '爬山',
        distance: 70,
        difficulty: '简单',
        wantCount: 56,
        tags: ['长城', '历史', '徒步']
      },
      {
        _id: 'place_003',
        name: '香山',
        image: 'https://picsum.photos/400/300?random=3',
        category: '爬山',
        distance: 25,
        difficulty: '简单',
        wantCount: 28,
        tags: ['红叶', '徒步', '赏秋']
      },
      {
        _id: 'place_004',
        name: '十渡',
        image: 'https://picsum.photos/400/300?random=4',
        category: '水上',
        distance: 100,
        difficulty: '简单',
        wantCount: 41,
        tags: ['漂流', '烧烤', '团建']
      },
      {
        _id: 'place_005',
        name: '古北水镇',
        image: 'https://picsum.photos/400/300?random=5',
        category: '古镇',
        distance: 140,
        difficulty: '简单',
        wantCount: 67,
        tags: ['古镇', '夜景', '拍照']
      },
      {
        _id: 'place_006',
        name: '海坨山',
        image: 'https://picsum.photos/400/300?random=6',
        category: '爬山',
        distance: 180,
        difficulty: '中等',
        wantCount: 25,
        tags: ['爬山', '露营', '看日出']
      }
    ];
    
    this.setData({
      places: mockPlaces,
      loading: false
    });
  },

  // 切换分类
  onCategoryChange: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentCategory: index });
    
    // 筛选地点
    const category = this.data.categories[index];
    if (category === '全部') {
      this.loadPlaces();
    } else {
      this.filterByCategory(category);
    }
  },

  // 按分类筛选
  filterByCategory: function (category) {
    db.collection('places')
      .where({
        status: 1,
        category: category
      })
      .orderBy('wantCount', 'desc')
      .get()
      .then(res => {
        this.setData({ places: res.data });
      });
  },

  // 点击地点卡片
  onPlaceTap: function (e) {
    const placeId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${placeId}`
    });
  },

  // 搜索
  onSearch: function (e) {
    const keyword = e.detail.value;
    if (keyword) {
      db.collection('places')
        .where({
          status: 1,
          name: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        })
        .get()
        .then(res => {
          this.setData({ places: res.data });
        });
    } else {
      this.loadPlaces();
    }
  },

  // 登录
  onLogin: function () {
    app.wxLogin().then(userInfo => {
      this.setData({
        userInfo: userInfo,
        isLoggedIn: true
      });
    }).catch(err => {
      console.error('登录失败', err);
    });
  },

  // 发布行程
  onPublishTap: function () {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      this.onLogin();
      return;
    }
    wx.navigateTo({
      url: '/pages/trip-publish/trip-publish'
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadPlaces();
    wx.stopPullDownRefresh();
  }
});
