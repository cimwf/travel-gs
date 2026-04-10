// pages/place-detail/place-detail.js
const app = getApp();
const api = require('../../utils/api.js');

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
  loadPlaceDetail: async function (placeId) {
    this.setData({ loading: true });

    // 尝试使用云开发
    if (wx.cloud) {
      try {
        const result = await api.placeGet(placeId);
        if (result.place) {
          const place = result.place;
          // 检查是否已收藏
          const collections = wx.getStorageSync('collections') || [];
          const isCollected = collections.includes(place._id);
          this.setData({ place, isCollected, loading: false });
          return;
        }
      } catch (err) {
        console.warn('云开发加载失败，使用本地数据', err);
      }
    }

    // 使用mock数据
    this.loadMockPlaceDetail(placeId);
  },

  // 加载模拟数据
  loadMockPlaceDetail: function (placeId) {
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
        category: '爬山',
        location: { distance: 120, address: '北京市门头沟区' },
        difficulty: '困难',
        bestSeason: '春夏秋',
        duration: '1天',
        altitude: '2303m',
        openTime: '全天开放',
        tags: ['日出', '云海', '露营', '高山草甸'],
        wantCount: 256,
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
  loadTrips: async function (placeId) {
    // 尝试使用云开发
    if (wx.cloud) {
      try {
        const db = wx.cloud.database();
        const res = await db.collection('trips')
          .where({
            placeId: placeId,
            status: 'open'
          })
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get();

        if (res.data && res.data.length > 0) {
          // 处理行程数据，添加展示所需字段
          const trips = res.data.map(trip => {
            // 格式化日期
            let dateText = trip.date || '';
            if (trip.date) {
              const date = new Date(trip.date);
              const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
              dateText = `${(date.getMonth() + 1).toString().padStart(2, '0')}月${date.getDate().toString().padStart(2, '0')}日 ${weekDays[date.getDay()]}`;
            }

            // 计算发布时间
            let publishTime = '刚刚发布';
            if (trip.createdAt) {
              const diff = Date.now() - new Date(trip.createdAt).getTime();
              const hours = Math.floor(diff / (1000 * 60 * 60));
              if (hours < 1) {
                publishTime = '刚刚发布';
              } else if (hours < 24) {
                publishTime = `发布于${hours}小时前`;
              } else {
                const days = Math.floor(hours / 24);
                publishTime = `发布于${days}天前`;
              }
            }

            return {
              ...trip,
              date: dateText,
              viewCount: trip.viewCount || Math.floor(Math.random() * 200) + 50,
              publishTime: publishTime
            };
          });

          this.setData({ trips: trips });
          return;
        }
      } catch (err) {
        console.warn('加载行程失败', err);
      }
    }

    // 使用mock数据
    const mockTrips = [
      {
        _id: 'trip_001',
        creatorName: '小王',
        creatorAvatar: '',
        avatarBg: 'linear-gradient(135deg, #FF6B6B, #FF8E53)',
        date: '04月12日 周六',
        hasCar: true,
        currentCount: 2,
        needCount: 2,
        remark: '有车求队友，AA制，早上6点出发，可以顺路接人',
        viewCount: 156,
        publishTime: '发布于3小时前'
      },
      {
        _id: 'trip_002',
        creatorName: '小李',
        creatorAvatar: '',
        avatarBg: 'linear-gradient(135deg, #4A90E2, #667eea)',
        date: '04月13日 周日',
        hasCar: false,
        currentCount: 1,
        needCount: 3,
        remark: '无车等拼车，可以分摊油费和高速费，希望有车的朋友带一程',
        viewCount: 89,
        publishTime: '发布于5小时前'
      }
    ];

    this.setData({ trips: mockTrips });
  },

  // 点击行程卡片跳转详情
  onTripTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 返回
  onBackTap: function () {
    wx.navigateBack();
  },

  // 分享按钮
  onShareTap: function () {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  // 收藏
  onCollectTap: async function () {
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

    // 尝试同步到云端
    if (wx.cloud) {
      try {
        await api.wantToggle(placeId);
      } catch (err) {
        console.warn('同步收藏状态失败', err);
      }
    }

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
    let value = e.detail.value;

    // 如果是手机号，只允许输入数字，最多11位
    if (this.data.contactType === 'phone') {
      value = value.replace(/\D/g, '').slice(0, 11);
    }

    this.setData({ contactValue: value });
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

  // 阻止事件冒泡（空函数）
  preventBubble: function () {},

  // 校验联系方式
  validateContact: function () {
    const { contactType, contactValue } = this.data;

    if (!contactValue) {
      wx.showToast({ title: '请填写联系方式', icon: 'none' });
      return false;
    }

    if (contactType === 'phone') {
      const phoneReg = /^1[3-9]\d{9}$/;
      if (!phoneReg.test(contactValue)) {
        wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return false;
      }
    } else {
      const wechatReg = /^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/;
      if (!wechatReg.test(contactValue)) {
        wx.showToast({ title: '请输入正确的微信号', icon: 'none' });
        return false;
      }
    }

    return true;
  },

  // 提交申请
  onSubmitApply: async function () {
    if (!this.validateContact()) {
      return;
    }

    const { currentTrip, introduction } = this.data;

    // 尝试调用云函数
    if (wx.cloud) {
      try {
        await api.applyCreate({
          tripId: currentTrip._id,
          message: introduction
        });
        wx.showToast({ title: '申请已发送', icon: 'success' });
        this.setData({ showApplyModal: false });
        return;
      } catch (err) {
        console.warn('提交申请失败', err);
      }
    }

    wx.showToast({ title: '申请已发送', icon: 'success' });
    this.setData({ showApplyModal: false });
  },

  // 发送邀请
  onSubmitInvite: async function () {
    if (!this.validateContact()) {
      return;
    }

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
