// pages/trip-list/trip-list.js
const app = getApp();

Page({
  data: {
    placeId: '',
    placeName: '',
    trips: [],
    total: 0,
    loading: true,
    hasMore: true,
    page: 0,
    pageSize: 10
  },

  onLoad: function (options) {
    const placeId = options.placeId || '';
    const placeName = decodeURIComponent(options.placeName || '');
    this.setData({ placeId, placeName });

    if (placeId) {
      this.loadTrips();
    } else {
      this.setData({ loading: false });
    }
  },

  // 加载行程列表
  loadTrips: async function (reset = true) {
    if (reset) {
      this.setData({ loading: true, page: 0, trips: [] });
    }

    try {
      const db = wx.cloud.database();
      const { page, pageSize, placeId } = this.data;

      // 构建查询条件
      let query = { placeId: placeId };

      // 查询总数
      const countRes = await db.collection('trips').where(query).count();
      const total = countRes.total;

      // 查询列表
      const tripRes = await db.collection('trips')
        .where(query)
        .orderBy('createdAt', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get();

      if (tripRes.data && tripRes.data.length > 0) {
        const trips = tripRes.data.map(trip => {
          // 格式化日期
          let dateText = trip.date || '';
          if (trip.date) {
            const date = new Date(trip.date);
            const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const weekDay = weekDays[date.getDay()];
            dateText = `${month}月${day}日 周${weekDay}`;
          }

          // 格式化发布时间
          let publishTime = '刚刚发布';
          if (trip.createdAt) {
            const now = Date.now();
            const diff = now - trip.createdAt;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const days = Math.floor(hours / 24);
            if (days > 0) {
              publishTime = `发布于${days}天前`;
            } else if (hours > 0) {
              publishTime = `发布于${hours}小时前`;
            }
          }

          return {
            _id: trip._id,
            creatorId: trip.creatorId,
            creatorName: trip.creatorName || '旅行者',
            creatorAvatar: trip.creatorAvatar || '',
            date: trip.date,
            dateText: dateText,
            departure: trip.departure || '',
            currentCount: trip.currentCount || 1,
            totalCount: (trip.currentCount || 0) + (trip.needCount || 0),
            hasCar: trip.hasCar || false,
            remark: trip.remark || '',
            viewCount: trip.viewCount || Math.floor(Math.random() * 500),
            publishTime: publishTime
          };
        });

        this.setData({
          trips: reset ? trips : [...this.data.trips, ...trips],
          total: total,
          hasMore: (page + 1) * pageSize < total,
          loading: false,
          page: page + 1
        });
      } else {
        this.setData({
          loading: false,
          hasMore: false
        });
      }
    } catch (err) {
      console.error('加载行程失败', err);
      this.setData({ loading: false });
    }
  },

  // 点击行程卡片
  onTripTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 申请加入/邀请他
  onActionTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    const hasCar = e.currentTarget.dataset.hascar;

    if (hasCar) {
      // 申请加入
      wx.navigateTo({
        url: `/pages/trip-detail/trip-detail?id=${tripId}&action=apply`
      });
    } else {
      // 邀请他
      this.showInviteModal(tripId);
    }
  },

  // 显示邀请弹窗
  showInviteModal: function (tripId) {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '邀请确认',
      content: '确定要邀请对方一起出行吗？确认后将发送您的联系方式给对方。',
      success: (res) => {
        if (res.confirm) {
          this.sendInvite(tripId);
        }
      }
    });
  },

  // 发送邀请
  sendInvite: async function (tripId) {
    wx.showLoading({ title: '发送中...' });

    try {
      const db = wx.cloud.database();
      const userInfo = app.globalData.userInfo;
      const openid = app.globalData.openid;

      // 获取行程信息
      const tripRes = await db.collection('trips').doc(tripId).get();
      const trip = tripRes.data;

      if (!trip) {
        wx.hideLoading();
        wx.showToast({ title: '行程不存在', icon: 'none' });
        return;
      }

      // 保存邀请记录
      await db.collection('invites').add({
        data: {
          tripId: tripId,
          placeName: trip.placeName,
          toUserId: trip.creatorId,
          toUserName: trip.creatorName,
          fromUserId: openid,
          fromUserName: userInfo.nickname || '旅行者',
          fromUserAvatar: userInfo.avatar || '',
          status: 'pending',
          createdAt: Date.now()
        }
      });

      wx.hideLoading();
      wx.showToast({ title: '邀请已发送', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('发送邀请失败', err);
      wx.showToast({ title: '发送失败', icon: 'none' });
    }
  },

  // 发布行程
  onPublishTrip: function () {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const { placeId, placeName } = this.data;
    if (!placeId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/trip-publish/trip-publish?placeId=${placeId}&placeName=${encodeURIComponent(placeName)}`
    });
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: `${this.data.placeName} - 想去的人`,
      path: `/pages/trip-list/trip-list?placeId=${this.data.placeId}&placeName=${encodeURIComponent(this.data.placeName)}`
    };
  }
});
