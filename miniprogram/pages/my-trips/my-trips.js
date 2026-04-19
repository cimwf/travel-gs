// pages/my-trips/my-trips.js
const app = getApp();

Page({
  data: {
    activeTab: 'all',
    trips: [],
    filteredTrips: [], // 过滤后的行程
    allTrips: [], // 所有行程
    loading: true,
    emptyIcon: '🗺️',
    emptyTitle: '还没有行程',
    emptyDesc: '快去发现有趣的地方吧！'
  },

  onLoad: function (options) {
    // 设置默认标签
    const tab = options.tab || 'all';
    this.setData({ activeTab: tab });

    // 加载行程数据
    this.loadTrips();
  },

  onShow: function () {
    // 每次显示页面时刷新数据
    this.loadTrips();
  },

  // 加载行程数据
  loadTrips: async function () {
    this.setData({ loading: true });

    // 确保获取到 openid
    let openid = app.globalData.openid;
    if (!openid) {
      try {
        openid = await app.getOpenid();
      } catch (err) {
        console.error('获取openid失败', err);
        this.setData({ loading: false, trips: [], allTrips: [] });
        this.updateEmptyState();
        return;
      }
    }

    if (!openid) {
      this.setData({ loading: false, trips: [], allTrips: [] });
      this.updateEmptyState();
      return;
    }

    // 从数据库加载真实数据
    if (wx.cloud) {
      try {
        const db = wx.cloud.database();

        // 查询我参与的所有行程
        const res = await db.collection('trips')
          .where({
            'participants.userId': openid
          })
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get();


        // 获取云存储头像的临时链接
        const fileIDs = [];
        res.data.forEach(item => {
          if (item.participants) {
            item.participants.forEach(p => {
              if (p.avatar && p.avatar.startsWith('cloud://')) {
                fileIDs.push(p.avatar);
              }
            });
          }
        });

        // 批量获取临时链接
        let avatarMap = {};
        if (fileIDs.length > 0 && wx.cloud) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({
              fileList: fileIDs
            });
            if (urlRes.fileList) {
              urlRes.fileList.forEach(item => {
                if (item.tempFileURL) {
                  avatarMap[item.fileID] = item.tempFileURL;
                }
              });
            }
          } catch (err) {
            console.warn('获取头像链接失败', err);
          }
        }

        // 处理行程数据
        const trips = [];
        for (const item of res.data || []) {
          const isCreator = item.creatorId === openid;
          const now = Date.now();
          const tripDate = new Date(item.date).getTime();

          // 判断行程状态
          let status = item.status;
          let statusText = '招募中';
          let statusClass = 'open';

          if (status === 'cancelled') {
            statusText = '已取消';
            statusClass = 'cancelled';
          } else if (tripDate < now) {
            // 出行日期已过，标记为已结束
            statusText = '已结束';
            statusClass = 'ended';
          } else if ((item.needCount || 0) <= 0) {
            // 还需人数为0，已满员
            statusText = '已满员';
            statusClass = 'full';
          }

          // 格式化日期
          const date = new Date(item.date);
          const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
          const dateText = `${date.getMonth() + 1}月${date.getDate()}日 ${weekDays[date.getDay()]}`;

          // 获取头像背景色和emoji（备用）
          const imgBg = this.getImgBg(item.placeName);
          const emoji = this.getEmoji(item.category);

          // 获取地点封面图
          let placeCoverImage = '';
          if (item.placeId) {
            try {
              const placeRes = await db.collection('places').doc(item.placeId).get();
              if (placeRes.data && placeRes.data.coverImage) {
                placeCoverImage = placeRes.data.coverImage;
              }
            } catch (err) {
              console.warn('获取地点封面图失败', err);
            }
          }

          // 处理参与者头像
          const participants = (item.participants || []).map(p => {
            let avatar = p.avatar || '';
            // 如果是云存储链接，转换为临时链接
            if (avatar && avatar.startsWith('cloud://') && avatarMap[avatar]) {
              avatar = avatarMap[avatar];
            }
            // 如果头像为空或无效，设为空字符串，让 wxml 显示默认头像
            if (!avatar || avatar.startsWith('cloud://')) {
              avatar = '';
            }
            return {
              ...p,
              avatar
            };
          });

          trips.push({
            _id: item._id,
            placeName: item.placeName,
            dateText: dateText,
            date: item.date,
            currentCount: item.currentCount,
            needCount: item.needCount,
            totalCount: item.currentCount + item.needCount,
            statusText,
            statusClass,
            imgBg,
            emoji,
            placeCoverImage,
            isCreator,
            hasCar: item.hasCar,
            departure: item.departure,
            remark: item.remark,
            participants: participants,
            creatorName: item.creatorName,
            rawStatus: status
          });
        }

        this.setData({
          allTrips: trips,
          trips: trips,
          loading: false
        });
        this.filterTrips();
        this.updateEmptyState();
        return;
      } catch (err) {
        console.warn('加载行程失败', err);
      }
    }

    // 模拟数据（备用）
    // const mockTrips = this.getMockTrips();

    this.setData({
      trips: [],
      allTrips: [],
      loading: false
    });
    this.updateEmptyState();
  },

  // 获取行程图片背景
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

  // 获取表情符号
  getEmoji: function (category) {
    const emojiMap = {
      '爬山': '🏔️',
      '水上': '💧',
      '古镇': '🏯',
      '露营': '🏕️'
    };
    return emojiMap[category] || '🏔️';
  },

  // 模拟数据（备用）
  // getMockTrips: function () {
  //   const allTrips = {
  //     created: [
  //       {
  //         _id: 'trip_001',
  //         placeName: '东灵山日出',
  //         dateText: '3月26日 周二',
  //         currentCount: 3,
  //         needCount: 5,
  //         statusText: '招募中',
  //         statusClass: 'open',
  //         imgBg: 'linear-gradient(135deg, #667eea, #764ba2)',
  //         emoji: '🏔️',
  //         isCreator: true,
  //         participants: [
  //           { name: '我' },
  //           { name: '小' },
  //           { name: '红' }
  //         ]
  //       }
  //     ],
  //     joined: [],
  //     ended: []
  //   };
  //   return allTrips[this.data.activeTab] || [];
  // },

  // 更新空状态文案
  updateEmptyState: function () {
    const emptyConfig = {
      all: {
        icon: '🗺️',
        title: '还没有行程',
        desc: '快去发现有趣的地方吧！'
      },
      created: {
        icon: '🗺️',
        title: '还没有发起过行程',
        desc: '快去发现有趣的地方吧！'
      },
      joined: {
        icon: '🚶',
        title: '还没有参与过行程',
        desc: '去看看有什么有趣的活动吧！'
      },
      ended: {
        icon: '📋',
        title: '暂无已结束的行程',
        desc: '你的行程记录将在这里显示'
      }
    };

    const config = emptyConfig[this.data.activeTab];
    this.setData({
      emptyIcon: config.icon,
      emptyTitle: config.title,
      emptyDesc: config.desc
    });
  },

  // 切换标签
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.filterTrips();
    this.updateEmptyState();
  },

  // 根据标签过滤行程
  filterTrips: function () {
    const { allTrips, activeTab } = this.data;
    let filteredTrips = [];

    if (activeTab === 'all') {
      filteredTrips = allTrips;
    } else if (activeTab === 'created') {
      filteredTrips = allTrips.filter(trip => trip.isCreator);
    } else if (activeTab === 'joined') {
      filteredTrips = allTrips.filter(trip => !trip.isCreator && trip.statusClass !== 'ended' && trip.statusClass !== 'cancelled');
    } else if (activeTab === 'ended') {
      filteredTrips = allTrips.filter(trip => trip.statusClass === 'ended' || trip.statusClass === 'cancelled');
    }

    this.setData({ trips: filteredTrips });
  },

  // 点击行程卡片
  onTripTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 查看详情
  onDetailTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 管理行程
  onManageTap: async function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['编辑行程', '取消行程', '分享行程'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            wx.showToast({ title: '功能开发中', icon: 'none' });
            break;
          case 1:
            this.cancelTrip(tripId);
            break;
          case 2:
            wx.showShareMenu({
              withShareTicket: true,
              menus: ['shareAppMessage']
            });
            break;
        }
      }
    });
  },

  // 取消行程
  cancelTrip: async function (tripId) {
    wx.showModal({
      title: '确认取消',
      content: '取消后其他用户将无法加入，确定要取消吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '取消中...' });

          if (wx.cloud) {
            try {
              const db = wx.cloud.database();
              await db.collection('trips').doc(tripId).update({
                data: { status: 'cancelled' }
              });
              wx.hideLoading();
              wx.showToast({ title: '已取消', icon: 'success' });
              this.loadTrips();
              return;
            } catch (err) {
              console.warn('取消行程失败', err);
            }
          }

          wx.hideLoading();
          wx.showToast({ title: '取消失败', icon: 'none' });
        }
      }
    });
  },

  // 退出行程
  onQuitTap: async function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认退出',
      content: '确定要退出此行程吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '退出中...' });

          if (wx.cloud) {
            try {
              const db = wx.cloud.database();
              const openid = app.globalData.openid;

              // 获取行程信息
              const tripRes = await db.collection('trips').doc(tripId).get();
              const trip = tripRes.data;

              // 从参与者列表中移除自己
              const newParticipants = trip.participants.filter(p => p.userId !== openid);

              await db.collection('trips').doc(tripId).update({
                data: {
                  participants: newParticipants,
                  currentCount: db.command.inc(-1),
                  needCount: db.command.inc(1)
                }
              });

              wx.hideLoading();
              wx.showToast({ title: '已退出', icon: 'success' });
              this.loadTrips();
              return;
            } catch (err) {
              console.warn('退出行程失败', err);
            }
          }

          wx.hideLoading();
          wx.showToast({ title: '退出失败', icon: 'none' });
        }
      }
    });
  },

  // 发现周边好去处
  onExploreTap: function () {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 发布新行程
  onPublishTap: function () {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '我的行程 - 北上周边行',
      path: '/pages/my-trips/my-trips'
    };
  }
});
