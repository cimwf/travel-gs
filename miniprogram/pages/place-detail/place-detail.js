// pages/place-detail/place-detail.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');

Page({
  data: {
    place: null,
    trips: [],
    loading: true,
    loadError: false,
    placeId: '',
    isCollected: false,
    userInfo: null,
    statusBarHeight: 0,

    applyingTripId: ''
  },

  onLoad: function (options) {
    // 获取状态栏高度
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });

    const placeId = options.id || '';
    this.setData({ placeId });
    if (!placeId) {
      this.setData({ loading: false, loadError: true });
      return;
    }
    this.loadPlaceDetail(placeId);
    this.loadTrips(placeId);
    this.recordView(placeId);
    this.setData({ userInfo: app.globalData.userInfo });
  },

  // 记录浏览量
  recordView: async function (placeId) {
    if (wx.cloud) {
      try {
        await api.placeView(placeId);
      } catch (err) {
        console.warn('记录浏览量失败', err);
      }
    }
  },

  onShow: function () {
    this.setData({ userInfo: app.globalData.userInfo });
  },

  // 加载地点详情
  loadPlaceDetail: async function (placeId) {
    this.setData({ loading: true, loadError: false, place: null });

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
        console.warn('地点详情加载失败', err);
      }
    }

    this.setData({ place: null, loading: false, loadError: true });
  },

  onRetryPlaceDetail: function () {
    if (!this.data.placeId) return;
    this.loadPlaceDetail(this.data.placeId);
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
          const openid = app.globalData.openid;

          // 收集需要转换的云存储头像
          const avatarFileIDs = [];
          res.data.forEach(trip => {
            if (trip.creatorAvatar && trip.creatorAvatar.startsWith('cloud://')) {
              avatarFileIDs.push(trip.creatorAvatar);
            }
          });

          // 批量获取临时链接
          let avatarMap = {};
          if (avatarFileIDs.length > 0) {
            try {
              const urlRes = await wx.cloud.getTempFileURL({ fileList: avatarFileIDs });
              if (urlRes.fileList) {
                urlRes.fileList.forEach(item => {
                  if (item.tempFileURL) {
                    avatarMap[item.fileID] = item.tempFileURL;
                  }
                });
              }
            } catch (err) {
              console.warn('获取头像临时链接失败', err);
            }
          }

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

            // 判断是否是自己发布的行程
            const isMyTrip = trip.creatorId === openid;

            // 生成头像背景色
            const avatarBg = this.getAvatarBg(trip.creatorName);

            // 处理头像链接
            let creatorAvatar = trip.creatorAvatar || '';
            if (creatorAvatar && creatorAvatar.startsWith('cloud://') && avatarMap[creatorAvatar]) {
              creatorAvatar = avatarMap[creatorAvatar];
            }

            return {
              ...trip,
              date: dateText,
              viewCount: trip.viewCount || 0,
              publishTime: publishTime,
              isMyTrip: isMyTrip,
              avatarBg: avatarBg,
              creatorAvatar: creatorAvatar
            };
          });

          this.setData({ trips: trips });
          return;
        }
      } catch (err) {
        console.warn('加载行程失败', err);
      }
    }

    // 无数据时显示空状态
    this.setData({ trips: [] });
  },

  // 点击行程卡片跳转详情
  onTripTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 点击更多行程
  onMoreTripsTap: function () {
    const place = this.data.place;
    if (!place) {
      wx.showToast({ title: '加载中，请稍后', icon: 'none' });
      return;
    }
    const placeId = place._id;
    const placeName = encodeURIComponent(place.name);
    wx.navigateTo({
      url: `/pages/trip-list/trip-list?placeId=${placeId}&placeName=${placeName}`
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
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const place = this.data.place;
    if (!place) {
      wx.showToast({ title: '加载中，请稍后', icon: 'none' });
      return;
    }

    const isCollected = !this.data.isCollected;
    const placeId = place._id;

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
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const place = this.data.place;
    if (!place) {
      wx.showToast({ title: '加载中，请稍后', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/trip-publish/trip-publish?placeId=${place._id}&placeName=${encodeURIComponent(place.name)}`
    });
  },

  // 点击申请加入
  onApplyTap: async function (e) {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const tripId = e.currentTarget.dataset.id;
    const trip = this.data.trips.find(t => t._id === tripId);

    if (!trip || trip.applicationSent || this.data.applyingTripId) return;

    this.setData({ applyingTripId: tripId });
    wx.showLoading({ title: '发送中...', mask: true });
    try {
      await api.applyCreate({ tripId });
      const trips = this.data.trips.map(function (item) {
        return item._id === tripId ? Object.assign({}, item, { applicationSent: true }) : item;
      });
      this.setData({ applyingTripId: '', trips: trips });
      wx.hideLoading();
      wx.showToast({ title: '申请已发送', icon: 'success' });
    } catch (err) {
      this.setData({ applyingTripId: '' });
      wx.hideLoading();
      wx.showToast({ title: err.message || '发送失败，请重试', icon: 'none' });
    }
  },

  // 查看行程（自己的行程）
  onViewTrip: function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 分享
  onShareAppMessage: function () {
    const place = this.data.place;
    if (!place) {
      return {
        title: '北京周边游',
        path: '/pages/index/index'
      };
    }
    return {
      title: `一起去${place.name}吧！`,
      path: `/pages/place-detail/place-detail?id=${place._id}`
    };
  },

  // 根据名字生成头像背景色
  getAvatarBg: function (name) {
    const colors = [
      'linear-gradient(135deg, #FF6B6B, #FF8E53)',
      'linear-gradient(135deg, #4A90E2, #6BA3E8)',
      'linear-gradient(135deg, #56AB2F, #A8E6CF)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #11998e, #38ef7d)'
    ];
    if (!name) return colors[0];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  }
});
