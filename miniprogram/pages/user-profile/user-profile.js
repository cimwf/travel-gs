// pages/user-profile/user-profile.js
const app = getApp();

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
      gender: 0
    },
    stats: {
      trips: 0,
      following: 0,
      followers: 0
    },
    photos: [],
    trips: []
  },

  onLoad: function (options) {
    // 如果传入了 id 参数，查看该用户主页
    // 否则显示当前登录用户的主页
    const userId = options.id || '';

    if (userId) {
      this.setData({ userId, isCurrentUser: false });
      this.loadUserProfile(userId);
    } else {
      // 没有传 id，显示当前登录用户
      this.loadCurrentUser();
    }
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

      // 从数据库获取最新用户数据
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
      const db = wx.cloud.database();
      let userData = null;

      // 方式1：通过 openid 查询
      let userRes = await db.collection('users').where({
        openid: userId
      }).get();

      if (userRes.data && userRes.data.length > 0) {
        userData = userRes.data[0];
      } else {
        // 方式2：通过 _id 查询
        try {
          const resById = await db.collection('users').doc(userId).get();
          if (resById.data) {
            userData = resById.data;
          }
        } catch (e) {
          console.log('通过_id查询失败', e);
        }
      }

      if (userData) {
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
            gender: userData.gender || 0
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
      const db = wx.cloud.database();

      const tripRes = await db.collection('trips')
        .where({
          creatorId: userId
        })
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      if (tripRes.data && tripRes.data.length > 0) {
        const trips = [];
        for (const trip of tripRes.data) {
          // 获取地点图片和标签
          let placeImage = trip.placeImage || '';
          let placeTags = [];
          if (trip.placeId) {
            try {
              const placeRes = await db.collection('places').doc(trip.placeId).get();
              if (placeRes.data) {
                if (placeRes.data.images && placeRes.data.images.length > 0) {
                  placeImage = placeRes.data.images[0];
                }
                if (placeRes.data.tags && placeRes.data.tags.length > 0) {
                  placeTags = placeRes.data.tags;
                }
              }
            } catch (e) {}
          }
          if (!placeImage) {
            placeImage = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop';
          }

          // 格式化日期
          let dateText = trip.date || '';
          if (trip.date) {
            const date = new Date(trip.date);
            const month = date.getMonth() + 1;
            const day = date.getDate();
            dateText = `${month}月${day}日`;
          }

          trips.push({
            _id: trip._id,
            title: trip.title || trip.placeName,
            placeName: trip.placeName,
            placeImage: placeImage,
            date: dateText,
            duration: trip.duration || '1天',
            viewCount: trip.viewCount || 0,
            likeCount: trip.likeCount || 0,
            commentCount: trip.commentCount || 0,
            tags: placeTags
          });
        }

        this.setData({ trips });
      } else {
        this.setData({ trips: [] });
      }
    } catch (err) {
      console.error('加载行程失败', err);
    }
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
