// pages/user-profile/user-profile.js
const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    loading: true,
    userId: '',
    isCurrentUser: false,
    userInfo: {
      nickname: '',
      avatar: '',
      background: '',
      bio: '',
      userId: '',
      gender: 0,
      age: ''
    },
    defaultBackground: 'https://7072-prod-d2gkmbquec074b1df-1427058553.tcb.qcloud.la/attractions/1778050814136-42heznfom6q.JPG',
    stats: {
      trips: 0,
      following: 0,
      followers: 0
    },
    photos: [],
    trips: []
  },

  onLoad: function (options) {
    this.skipNextShowRefresh = true;

    // 如果传入了 id 参数，查看该用户主页
    // 否则显示当前登录用户的主页
    const userId = options.id || options.userId || options.fromUserId || '';

    if (userId) {
      this.setData({ userId, isCurrentUser: false });
      this.loadUserProfile(userId);
    } else {
      // 没有传 id，显示当前登录用户
      this.loadCurrentUser();
    }
  },

  onShow: function () {
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false;
      return;
    }

    this.refreshProfile();
  },

  refreshProfile: function () {
    if (this.data.isCurrentUser || !this.data.userId) {
      this.loadCurrentUser();
      return;
    }

    this.loadUserProfile(this.data.userId);
  },

  getTodayRange: function () {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
    return { todayStart, todayEnd };
  },

  getTripTimestamp: function (dateValue) {
    const tripTime = new Date(dateValue).getTime();
    return Number.isNaN(tripTime) ? 0 : tripTime;
  },

  // 加载当前登录用户信息
  loadCurrentUser: async function () {
    this.setData({ loading: true, isCurrentUser: true });

    try {
      // 从本地存储获取用户信息
      const storedUserInfo = wx.getStorageSync('userInfo');
      const openid = app.globalData.openid || wx.getStorageSync('openid');

      if (!storedUserInfo || !openid) {
        this.setData({ loading: false });
        wx.showToast({ title: '请先登录', icon: 'none' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }

      this.setData({ userId: openid });

      // 从云函数获取最新用户数据
      await this.loadUserProfile(openid);

    } catch (err) {
      console.error('加载当前用户信息失败', err);
      this.setData({ loading: false });
    }
  },

  // 加载用户信息
  loadUserProfile: async function (userId) {
    this.setData({ loading: true });

    try {
      const res = await api.userGet(userId);

      if (res.success && res.user) {
        const localUserInfo = this.data.isCurrentUser
          ? (app.globalData.userInfo || wx.getStorageSync('userInfo') || {})
          : {};
        const userData = this.data.isCurrentUser
          ? { ...res.user, ...localUserInfo }
          : res.user;

        // 处理头像URL
        let avatar = userData.avatar || '';
        if (avatar && avatar.startsWith('cloud://') && wx.cloud) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({ fileList: [avatar] });
            if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
              avatar = urlRes.fileList[0].tempFileURL;
            }
          } catch (err) {
            console.warn('获取头像链接失败', err);
          }
        }

        // 处理背景图URL
        let background = userData.background || '';
        if (background && background.startsWith('cloud://') && wx.cloud) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({ fileList: [background] });
            if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
              background = urlRes.fileList[0].tempFileURL;
            }
          } catch (err) {
            console.warn('获取背景图链接失败', err);
          }
        }

        this.setData({
          userInfo: {
            nickname: userData.nickname || '旅行者',
            avatar: avatar,
            background: background,
            bio: userData.bio || '',
            userId: userData.userId || '',
            gender: userData.gender || 0,
            age: userData.age === undefined || userData.age === null ? '' : userData.age
          },
          stats: {
            trips: userData.trips || 0,
            following: userData.following || 0,
            followers: userData.followers || 0
          }
        });

        // 加载行程
        await this.loadUserTrips(userData.openid || userId);

        // 加载照片
        await this.loadUserPhotos(userData);
      } else {
        console.log('未找到用户数据');
      }

      this.setData({ loading: false });

    } catch (err) {
      console.error('加载用户信息失败', err);
      this.setData({ loading: false });
    }
  },

  // 加载用户照片
  loadUserPhotos: async function (userData) {
    if (userData && userData.photos && userData.photos.length > 0) {
      let photos = userData.photos;
      // 处理云存储链接
      const cloudPhotos = photos.filter(p => p.startsWith('cloud://'));
      if (cloudPhotos.length > 0 && wx.cloud) {
        try {
          const urlRes = await wx.cloud.getTempFileURL({ fileList: cloudPhotos });
          if (urlRes.fileList) {
            const urlMap = {};
            urlRes.fileList.forEach(item => {
              if (item.tempFileURL) {
                urlMap[item.fileID] = item.tempFileURL;
              }
            });
            photos = photos.map(p => urlMap[p] || p);
          }
        } catch (e) {
          console.warn('获取照片链接失败', e);
        }
      }
      this.setData({ photos });
    } else {
      this.setData({ photos: [] });
    }
  },

  // 加载用户发布的行程
  loadUserTrips: async function (userId) {
    try {
      await app.getAttractions();
      const res = await api.tripListByUser(userId, 1, 50);

      if (res.success && res.trips && res.trips.length > 0) {
        const trips = res.trips.map(item => this.formatTrip(item));
        this.setData({ trips });
      } else {
        this.setData({ trips: [] });
      }
    } catch (err) {
      console.error('加载行程失败', err);
      this.setData({ trips: [] });
    }
  },

  formatTrip: function (trip) {
    const { todayStart, todayEnd } = this.getTodayRange();
    const tripTime = this.getTripTimestamp(trip.date);

    let dateText = trip.date || '';
    if (trip.date) {
      const date = new Date(trip.date);
      if (!Number.isNaN(date.getTime())) {
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        dateText = `${date.getMonth() + 1}月${date.getDate()}日 周${weekDays[date.getDay()]}`;
      }
    }

    let publishTime = '刚刚';
    if (trip.createdAt) {
      const diff = Date.now() - trip.createdAt;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      if (days > 0) {
        publishTime = `${days}天前`;
      } else if (hours > 0) {
        publishTime = `${hours}小时前`;
      }
    }

    const needCount = trip.needCount || 0;
    let statusClass = 'recruiting';
    let statusText = '招募中';

    if (tripTime && tripTime < todayStart) {
      statusClass = 'ended';
      statusText = '已结束';
    } else if (tripTime >= todayStart && tripTime <= todayEnd) {
      statusClass = 'ongoing';
      statusText = '进行中';
    } else if (trip.status === 'stopped') {
      statusClass = 'stopped';
      statusText = '停止招募';
    } else if (trip.status === 'cancelled') {
      statusClass = 'cancelled';
      statusText = '已取消';
    } else if (needCount === 0) {
      statusClass = 'full';
      statusText = '已满员';
    } else if (needCount === 1) {
      statusClass = 'almost-full';
      statusText = '即将满员';
    }

    let carText = '';
    const carSeats = trip.carSeats || '';
    const carModel = trip.carModel || '';
    if (carSeats && carModel) {
      carText = `🚗 ${carSeats}座·${carModel}`;
    } else if (carSeats) {
      carText = `🚗 ${carSeats}座`;
    } else if (carModel) {
      carText = `🚗 ${carModel}`;
    } else {
      carText = trip.hasCar ? '🚗 有车' : '🚗 无车';
    }

    let priceText = '';
    if (trip.price) {
      priceText = `${trip.price}元/人`;
    }

    let placeCoverImage = '';
    if (trip.placeId) {
      const attractions = app.globalData.attractions || [];
      const attraction = attractions.find(item => item._id === trip.placeId || item.id === trip.placeId);
      placeCoverImage = attraction ? (attraction.coverImage || '') : '';
    }

    return {
      _id: trip._id,
      placeName: trip.placeName,
      displayTitle: trip.tripTitle || trip.title || trip.placeName,
      dateText,
      departure: trip.departure || '',
      carText,
      priceText,
      publishTime,
      participants: trip.participants || [],
      placeCoverImage,
      imgBg: this.getImgBg(trip.placeName),
      emoji: this.getEmoji(trip.category),
      needCount,
      statusClass,
      statusText
    };
  },

  getImgBg: function (placeName) {
    const bgMap = {
      '东灵山': 'linear-gradient(135deg, #667eea, #764ba2)',
      '海坨山': 'linear-gradient(135deg, #11998e, #38ef7d)',
      '百花山': 'linear-gradient(135deg, #56AB2F, #A8E6CF)',
      '香山': 'linear-gradient(135deg, #FA8C16, #FFC53D)',
      '八达岭长城': 'linear-gradient(135deg, #667eea, #764ba2)',
      '慕田峪长城': 'linear-gradient(135deg, #4facfe, #00f2fe)',
      '十渡': 'linear-gradient(135deg, #4facfe, #00f2fe)',
      '青龙峡': 'linear-gradient(135deg, #11998e, #38ef7d)',
      '古北水镇': 'linear-gradient(135deg, #FF6B6B, #FF8E53)',
      '爨底下村': 'linear-gradient(135deg, #f093fb, #f5576c)'
    };
    return bgMap[placeName] || 'linear-gradient(135deg, #667eea, #764ba2)';
  },

  getEmoji: function (category) {
    const emojiMap = {
      '爬山': '🏔️',
      '水上': '💧',
      '古镇': '🏯',
      '露营': '🏕️'
    };
    return emojiMap[category] || '🏔️';
  },

  // 更多操作
  onMoreTap: function () {
    const itemList = this.data.isCurrentUser
      ? ['分享主页', '编辑资料']
      : ['分享主页', '举报用户'];

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        if (res.tapIndex === 0) {
          // 分享主页
          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage']
          });
        } else if (res.tapIndex === 1) {
          if (this.data.isCurrentUser) {
            // 编辑资料
            wx.navigateTo({
              url: '/pages/edit-profile/edit-profile'
            });
          } else {
            // 举报用户
            wx.showToast({ title: '举报成功', icon: 'success' });
          }
        }
      }
    });
  },

  onEditProfile: function () {
    if (!this.data.isCurrentUser) {
      return;
    }

    wx.navigateTo({
      url: '/pages/edit-profile/edit-profile'
    });
  },

  // 点击行程
  onTripTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    if (tripId) {
      wx.navigateTo({
        url: `/pages/trip-detail/trip-detail?id=${tripId}`
      });
    }
  },

  // 点击照片预览
  onPhotoTap: function (e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.photos;
    wx.previewImage({
      current: photos[index],
      urls: photos
    });
  },

  // 分享
  onShareAppMessage: function () {
    const userInfo = this.data.userInfo;
    return {
      title: `${userInfo.nickname} 的旅行主页`,
      path: `/pages/user-profile/user-profile?id=${this.data.userId}`
    };
  }
});
