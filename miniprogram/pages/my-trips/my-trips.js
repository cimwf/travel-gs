// pages/my-trips/my-trips.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    statusBarHeight: 0,
    activeTab: 'all',
    trips: [],
    loading: true,
    emptyIcon: '🗺️',
    emptyTitle: '还没有行程',
    emptyDesc: '快去发现有趣的地方吧！'
  },

  onLoad: function (options) {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight });

    // 设置默认标签
    const tab = options.tab || 'created';
    this.setData({ activeTab: tab });

    // 加载行程数据
    this.loadTrips();
  },

  onShow: function () {
    // 每次显示页面时刷新数据
    this.loadTrips();
  },

  // 加载行程数据
  loadTrips: function () {
    this.setData({ loading: true });

    // 模拟数据
    const mockTrips = this.getMockTrips();

    setTimeout(() => {
      this.setData({
        trips: mockTrips,
        loading: false
      });
      this.updateEmptyState();
    }, 500);
  },

  // 获取模拟数据
  getMockTrips: function () {
    const allTrips = {
      created: [
        {
          _id: 'trip_001',
          placeName: '东灵山日出',
          dateText: '3月26日 周二',
          currentCount: 3,
          needCount: 5,
          statusText: '招募中',
          statusClass: 'open',
          imgBg: 'linear-gradient(135deg, #667eea, #764ba2)',
          emoji: '🏔️',
          isCreator: true,
          participants: [
            { name: '我' },
            { name: '小' },
            { name: '红' }
          ]
        },
        {
          _id: 'trip_002',
          placeName: '密云水库',
          dateText: '3月30日 周六',
          currentCount: 5,
          needCount: 5,
          statusText: '已满员',
          statusClass: 'full',
          imgBg: 'linear-gradient(135deg, #4facfe, #00f2fe)',
          emoji: '🌊',
          isCreator: true,
          participants: [
            { name: '我' },
            { name: '王' },
            { name: '李' },
            { name: '张' },
            { name: '赵' }
          ]
        }
      ],
      joined: [
        {
          _id: 'trip_003',
          placeName: '故宫博物院',
          dateText: '4月2日 周二',
          currentCount: 4,
          needCount: 5,
          statusText: '招募中',
          statusClass: 'open',
          imgBg: 'linear-gradient(135deg, #FF6B6B, #FF8E53)',
          emoji: '🏯',
          isCreator: false,
          participants: [
            { name: '大' },
            { name: '山' },
            { name: '我' },
            { name: '李' }
          ]
        },
        {
          _id: 'trip_004',
          placeName: '玉渊潭樱花',
          dateText: '4月5日 清明节',
          currentCount: 8,
          needCount: 8,
          statusText: '已满员',
          statusClass: 'full',
          imgBg: 'linear-gradient(135deg, #f093fb, #f5576c)',
          emoji: '🌸',
          isCreator: false,
          participants: [
            { name: '林' },
            { name: '我' },
            { name: '+6' }
          ]
        }
      ],
      ended: [
        {
          _id: 'trip_005',
          placeName: '香山公园',
          dateText: '3月15日 周六',
          currentCount: 4,
          needCount: 4,
          statusText: '已结束',
          statusClass: 'ended',
          imgBg: 'linear-gradient(135deg, #11998e, #38ef7d)',
          emoji: '🍂',
          isCreator: true,
          participants: [
            { name: '我' },
            { name: '小' },
            { name: '明' },
            { name: '华' }
          ]
        }
      ]
    };

    // 如果是"全部"标签，合并所有行程
    if (this.data.activeTab === 'all') {
      return [...allTrips.created, ...allTrips.joined, ...allTrips.ended];
    }

    return allTrips[this.data.activeTab] || [];
  },

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
    this.setData({ activeTab: tab, loading: true });

    setTimeout(() => {
      this.setData({
        trips: this.getMockTrips(),
        loading: false
      });
      this.updateEmptyState();
    }, 300);
  },

  // 返回
  onBackTap: function () {
    wx.navigateBack();
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
  onManageTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['编辑行程', '取消行程', '分享行程'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            // 编辑行程
            wx.showToast({ title: '功能开发中', icon: 'none' });
            break;
          case 1:
            // 取消行程
            this.cancelTrip(tripId);
            break;
          case 2:
            // 分享行程
            wx.showToast({ title: '功能开发中', icon: 'none' });
            break;
        }
      }
    });
  },

  // 取消行程
  cancelTrip: function (tripId) {
    wx.showModal({
      title: '确认取消',
      content: '取消后其他用户将无法加入，确定要取消吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '取消中...' });
          setTimeout(() => {
            wx.hideLoading();
            wx.showToast({ title: '已取消', icon: 'success' });
            this.loadTrips();
          }, 500);
        }
      }
    });
  },

  // 退出行程
  onQuitTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认退出',
      content: '确定要退出此行程吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '退出中...' });
          setTimeout(() => {
            wx.hideLoading();
            wx.showToast({ title: '已退出', icon: 'success' });
            this.loadTrips();
          }, 500);
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
      title: '我的行程 - 北京去哪玩',
      path: '/pages/my-trips/my-trips'
    };
  }
});
