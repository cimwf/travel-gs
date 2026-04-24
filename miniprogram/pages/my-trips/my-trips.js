// pages/my-trips/my-trips.js
const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    activeTab: 'all',
    trips: [],
    filteredTrips: [], // 过滤后的行程
    allTrips: [], // 所有行程
    loading: true,
    emptyIcon: '🗺️',
    emptyTitle: '还没有行程',
    emptyDesc: '快去发现有趣的地方吧！',

    // 管理弹窗
    showManageModal: false,
    manageTrip: null,

    // 分享弹窗
    showShareModal: false,
    shareTrip: null
  },

  onLoad: function (options) {
    // 设置默认标签
    const tab = options.tab || 'all';
    this.setData({ activeTab: tab });

    // 加载行程数据
    this.loadTrips();
    this.loadAttractions();
  },

  onShow: function () {
    // 每次显示页面时刷新数据
    this.loadTrips();
  },

  // 加载景点数据到全局缓存
  loadAttractions: async function () {
    await app.getAttractions();
  },

  // 加载行程数据
  loadTrips: async function () {
    this.setData({ loading: true });

    const openid = app.globalData.openid;
    if (!openid) {
      this.setData({ loading: false, trips: [], allTrips: [] });
      this.updateEmptyState();
      return;
    }

    try {
      const res = await api.tripMy();

      if (res.success && res.trips) {
        const trips = [];
        for (const item of res.trips) {
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
          } else if (status === 'stopped') {
            statusText = '停止招募';
            statusClass = 'stopped';
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

          // 从全局缓存获取景点封面图
          let placeCoverImage = '';
          if (item.placeId) {
            const attractions = app.globalData.attractions || [];
            const attraction = attractions.find(a => a._id === item.placeId || a.id === item.placeId);
            if (attraction && attraction.coverImage) {
              placeCoverImage = attraction.coverImage;
            }
          }

          // 参与者信息已由云函数处理
          const participants = item.participants || [];

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
      }
    } catch (err) {
      console.warn('加载行程失败', err);
      this.setData({
        trips: [],
        allTrips: [],
        loading: false
      });
      this.updateEmptyState();
    }
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

  // 检查行程状态并跳转
  checkAndNavigateToDetail: async function (tripId) {
    wx.showLoading({ title: '加载中...' });

    try {
      const res = await api.tripGet(tripId);
      wx.hideLoading();

      if (!res.success || !res.trip) {
        wx.showModal({
          title: '行程不存在',
          content: '该行程已被删除',
          showCancel: false,
          success: () => {
            this.loadTrips();
          }
        });
        return;
      }

      const trip = res.trip;
      if (trip.status === 'cancelled') {
        wx.showModal({
          title: '行程已取消',
          content: '该行程已被发起人取消',
          showCancel: false,
          success: () => {
            this.loadTrips();
          }
        });
        return;
      }

      if (trip.status === 'stopped') {
        wx.showModal({
          title: '已停止招募',
          content: '该行程已停止招募新成员',
          showCancel: false,
          success: () => {
            this.loadTrips();
          }
        });
        return;
      }

      // 状态正常，跳转到详情页
      wx.navigateTo({
        url: `/pages/trip-detail/trip-detail?id=${tripId}`
      });
    } catch (err) {
      wx.hideLoading();
      console.error('查询行程失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 点击行程卡片
  onTripTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    this.checkAndNavigateToDetail(tripId);
  },

  // 查看详情
  onDetailTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    this.checkAndNavigateToDetail(tripId);
  },

  // 管理行程
  onManageTap: async function (e) {
    const tripId = e.currentTarget.dataset.id;
    const trip = this.data.trips.find(t => t._id === tripId);
    this.setData({
      showManageModal: true,
      manageTrip: trip
    });
  },

  // 关闭管理弹窗
  onCloseManageModal: function () {
    this.setData({
      showManageModal: false,
      manageTrip: null
    });
  },

  // 编辑行程
  onEditTrip: function () {
    const trip = this.data.manageTrip;
    this.onCloseManageModal();
    wx.navigateTo({
      url: `/pages/trip-publish/trip-publish?id=${trip._id}`
    });
  },

  // 停止招募
  onStopRecruit: function () {
    const trip = this.data.manageTrip;
    this.onCloseManageModal();
    this.stopRecruit(trip._id);
  },

  // 开始招募
  onStartRecruit: async function () {
    const trip = this.data.manageTrip;
    this.onCloseManageModal();

    wx.showModal({
      title: '确认开始招募',
      content: '开始招募后其他用户将可以加入，确定要开始吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });

          try {
            await api.tripUpdateStatus(trip._id, 'open');

            wx.hideLoading();
            wx.showToast({ title: '已开始招募', icon: 'success' });
            this.loadTrips();
          } catch (err) {
            wx.hideLoading();
            console.error('开始招募失败', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 分享行程
  onShareTrip: function () {
    const trip = this.data.manageTrip;
    this.onCloseManageModal();
    this.setData({
      showShareModal: true,
      shareTrip: trip
    });
  },

  // 取消行程
  onCancelTrip: function () {
    const trip = this.data.manageTrip;
    this.onCloseManageModal();
    this.cancelTrip(trip._id);
  },

  // 删除行程
  onDeleteTrip: function () {
    const trip = this.data.manageTrip;
    this.onCloseManageModal();

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除此行程吗？',
      confirmText: '删除',
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });

          try {
            await api.tripDelete(trip._id);

            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadTrips();
          } catch (err) {
            wx.hideLoading();
            console.error('删除行程失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 关闭分享弹窗
  onCloseShareModal: function () {
    this.setData({
      showShareModal: false,
      shareTrip: null
    });
  },

  // 停止招募
  stopRecruit: async function (tripId) {
    wx.showModal({
      title: '确认停止招募',
      content: '停止招募后其他用户将无法加入，确定要停止吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });

          try {
            await api.tripUpdateStatus(tripId, 'stopped');

            wx.hideLoading();
            wx.showToast({ title: '已停止招募', icon: 'success' });

            // 刷新列表
            this.loadTrips();
          } catch (err) {
            wx.hideLoading();
            console.error('停止招募失败', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
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

          try {
            await api.tripUpdateStatus(tripId, 'cancelled');

            wx.hideLoading();
            wx.showToast({ title: '已取消', icon: 'success' });
            this.loadTrips();
          } catch (err) {
            wx.hideLoading();
            console.warn('取消行程失败', err);
            wx.showToast({ title: '取消失败', icon: 'none' });
          }
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

          try {
            await api.tripQuit(tripId);

            wx.hideLoading();
            wx.showToast({ title: '已退出', icon: 'success' });
            this.loadTrips();
          } catch (err) {
            wx.hideLoading();
            console.warn('退出行程失败', err);
            wx.showToast({ title: '退出失败', icon: 'none' });
          }
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
  onShareAppMessage: function (e) {

    // 优先从按钮的 data-trip 获取行程信息
    if (e.target && e.target.dataset && e.target.dataset.trip) {
      const trip = e.target.dataset.trip;
      return {
        title: `一起去${trip.placeName}吧！`,
        path: `/pages/trip-detail/trip-detail?id=${trip._id}`
      };
    }

    if (trip) {
      return {
        title: `一起去${trip.placeName}吧！`,
        path: `/pages/trip-detail/trip-detail?id=${trip._id}`
      };
    }
    return {
      title: '我的行程 - 北上周边行',
      path: '/pages/my-trips/my-trips'
    };
  }
});
