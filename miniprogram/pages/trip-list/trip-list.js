// pages/trip-list/trip-list.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    trips: [],
    allTrips: [], // 原始数据
    loading: true,
    refreshing: false,
    hasMore: true,
    page: 0,
    pageSize: 20,

    // 筛选相关
    activeFilter: '',
    showDestinationFilter: false,
    showDepartureFilter: false,
    showDateFilter: false,
    filterDestination: '',
    filterDeparture: '',
    filterDate: '',
    destinationText: '',
    departureText: '',
    dateText: '',
    destinationOptions: [],
    departureOptions: [],

    // 自定义时间选择
    showCustomDatePicker: false,
    customStartDate: '',
    customEndDate: ''
  },

  onLoad: function () {
    this.loadTrips();
  },

  onShow: function () {
    // 每次显示时刷新数据
    if (this.data.trips.length > 0) {
      this.onRefresh();
    }
  },

  // 加载行程列表
  loadTrips: async function (reset = true) {
    if (reset) {
      this.setData({ loading: true, page: 0 });
    }

    try {
      const db = wx.cloud.database();
      const { page, pageSize } = this.data;

      // 查询列表
      const tripRes = await db.collection('trips')
        .where({
          status: db.command.neq('cancelled')
        })
        .orderBy('createdAt', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get();

      if (tripRes.data && tripRes.data.length > 0) {
        // 收集需要处理的云存储头像
        const avatarFileIDs = [];
        tripRes.data.forEach(trip => {
          if (trip.participants) {
            trip.participants.forEach(p => {
              if (p.avatar && p.avatar.startsWith('cloud://')) {
                avatarFileIDs.push(p.avatar);
              }
            });
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

        const trips = [];
        for (const trip of tripRes.data) {
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
          let publishTime = '刚刚';
          if (trip.createdAt) {
            const now = Date.now();
            const diff = now - trip.createdAt;
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const days = Math.floor(hours / 24);
            if (days > 0) {
              publishTime = `${days}天前`;
            } else if (hours > 0) {
              publishTime = `${hours}小时前`;
            }
          }

          // 获取地点封面图
          let placeCoverImage = '';
          if (trip.placeId) {
            try {
              const placeRes = await db.collection('places').doc(trip.placeId).get();
              if (placeRes.data && placeRes.data.coverImage) {
                placeCoverImage = placeRes.data.coverImage;
              }
            } catch (err) {
              console.warn('获取地点封面图失败', err);
            }
          }

          // 处理参与者头像
          const participants = (trip.participants || []).map(p => {
            let avatar = p.avatar || '';
            if (avatar && avatar.startsWith('cloud://') && avatarMap[avatar]) {
              avatar = avatarMap[avatar];
            }
            return { ...p, avatar };
          });

          // 获取图片背景和emoji
          const imgBg = this.getImgBg(trip.placeName);
          const emoji = this.getEmoji(trip.category);

          // 计算状态
          const needCount = trip.needCount || 0;

          let statusClass = 'recruiting';
          let statusText = '招募中';

          if (trip.status === 'stopped') {
            statusClass = 'stopped';
            statusText = '停止招募';
          } else if (needCount === 0) {
            statusClass = 'full';
            statusText = '已满员';
          } else if (needCount === 1) {
            statusClass = 'almost-full';
            statusText = '即将满员';
          }

          trips.push({
            _id: trip._id,
            placeName: trip.placeName,
            dateText,
            date: trip.date,
            departure: trip.departure || '',
            hasCar: trip.hasCar,
            publishTime,
            participants,
            placeCoverImage,
            imgBg,
            emoji,
            needCount,
            statusClass,
            statusText
          });
        }

        const allTrips = reset ? trips : [...this.data.allTrips, ...trips];

        // 提取筛选选项
        const destinations = [...new Set(allTrips.map(t => t.placeName).filter(Boolean))];
        const departures = [...new Set(allTrips.map(t => t.departure).filter(Boolean))];

        this.setData({
          allTrips,
          trips: this.filterTrips(allTrips),
          destinationOptions: destinations,
          departureOptions: departures,
          hasMore: tripRes.data.length >= pageSize,
          loading: false,
          page: page + 1
        });
      } else {
        this.setData({
          loading: false,
          hasMore: false,
          trips: reset ? [] : this.data.trips
        });
      }
    } catch (err) {
      console.error('加载行程失败', err);
      this.setData({ loading: false });
    }
  },

  // 筛选行程
  filterTrips: function (trips) {
    const { filterDestination, filterDeparture, filterDate } = this.data;
    let result = trips;

    if (filterDestination) {
      result = result.filter(t => t.placeName === filterDestination);
    }

    if (filterDeparture) {
      result = result.filter(t => t.departure === filterDeparture);
    }

    if (filterDate) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      const startOfNextWeek = new Date(endOfWeek);
      startOfNextWeek.setDate(endOfWeek.getDate() + 1);
      const endOfNextWeek = new Date(startOfNextWeek);
      endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      result = result.filter(t => {
        if (!t.date) return false;
        const tripDate = new Date(t.date);
        const tripDateOnly = new Date(tripDate.getFullYear(), tripDate.getMonth(), tripDate.getDate());

        switch (filterDate) {
          case 'today':
            return tripDateOnly.getTime() === today.getTime();
          case 'tomorrow':
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            return tripDateOnly.getTime() === tomorrow.getTime();
          case 'thisWeek':
            return tripDateOnly >= startOfWeek && tripDateOnly <= endOfWeek;
          case 'nextWeek':
            return tripDateOnly >= startOfNextWeek && tripDateOnly <= endOfNextWeek;
          case 'thisMonth':
            return tripDate.getMonth() === now.getMonth() && tripDate.getFullYear() === now.getFullYear();
          case 'custom':
            const startDate = new Date(this.data.customStartDate);
            const endDate = new Date(this.data.customEndDate);
            const startOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const endOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            return tripDateOnly >= startOnly && tripDateOnly <= endOnly;
          default:
            return true;
        }
      });
    }

    return result;
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

  // 点击筛选
  onFilterTap: function (e) {
    const filter = e.currentTarget.dataset.filter;

    if (filter === 'destination') {
      this.setData({
        showDestinationFilter: true,
        showDepartureFilter: false,
        showDateFilter: false,
        activeFilter: 'destination'
      });
    } else if (filter === 'departure') {
      this.setData({
        showDepartureFilter: true,
        showDestinationFilter: false,
        showDateFilter: false,
        activeFilter: 'departure'
      });
    } else if (filter === 'date') {
      this.setData({
        showDateFilter: true,
        showDestinationFilter: false,
        showDepartureFilter: false,
        activeFilter: 'date'
      });
    }
  },

  // 关闭筛选弹窗
  onCloseFilter: function () {
    this.setData({
      showDestinationFilter: false,
      showDepartureFilter: false,
      showDateFilter: false,
      activeFilter: ''
    });
  },

  // 选择目的地
  onSelectDestination: function (e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      filterDestination: value,
      destinationText: value,
      showDestinationFilter: false,
      activeFilter: ''
    });
    this.setData({
      trips: this.filterTrips(this.data.allTrips)
    });
  },

  // 选择出发地
  onSelectDeparture: function (e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      filterDeparture: value,
      departureText: value,
      showDepartureFilter: false,
      activeFilter: ''
    });
    this.setData({
      trips: this.filterTrips(this.data.allTrips)
    });
  },

  // 重置目的地
  onResetDestination: function () {
    this.setData({
      filterDestination: '',
      destinationText: '',
      showDestinationFilter: false,
      activeFilter: ''
    });
    this.setData({
      trips: this.filterTrips(this.data.allTrips)
    });
  },

  // 重置出发地
  onResetDeparture: function () {
    this.setData({
      filterDeparture: '',
      departureText: '',
      showDepartureFilter: false,
      activeFilter: ''
    });
    this.setData({
      trips: this.filterTrips(this.data.allTrips)
    });
  },

  // 选择出行时间
  onSelectDate: function (e) {
    const value = e.currentTarget.dataset.value;
    const textMap = {
      'today': '今天',
      'tomorrow': '明天',
      'thisWeek': '本周',
      'nextWeek': '下周',
      'thisMonth': '本月'
    };
    this.setData({
      filterDate: value,
      dateText: value ? textMap[value] : '',
      showDateFilter: false,
      activeFilter: ''
    });
    this.setData({
      trips: this.filterTrips(this.data.allTrips)
    });
  },

  // 重置出行时间
  onResetDate: function () {
    this.setData({
      filterDate: '',
      dateText: '',
      showDateFilter: false,
      activeFilter: ''
    });
    this.setData({
      trips: this.filterTrips(this.data.allTrips)
    });
  },

  // 点击自定义时间
  onCustomDateTap: function () {
    this.setData({
      showDateFilter: false,
      showCustomDatePicker: true,
      customStartDate: '',
      customEndDate: ''
    });
  },

  // 关闭自定义时间选择器
  onCloseCustomDatePicker: function () {
    this.setData({
      showCustomDatePicker: false,
      activeFilter: ''
    });
  },

  // 阻止事件冒泡
  preventBubble: function () {},

  // 选择开始日期
  onStartDateChange: function (e) {
    this.setData({
      customStartDate: e.detail.value
    });
  },

  // 选择结束日期
  onEndDateChange: function (e) {
    this.setData({
      customEndDate: e.detail.value
    });
  },

  // 确认自定义日期
  onConfirmCustomDate: function () {
    const { customStartDate, customEndDate } = this.data;

    if (!customStartDate || !customEndDate) {
      wx.showToast({ title: '请选择完整日期', icon: 'none' });
      return;
    }

    if (new Date(customEndDate) < new Date(customStartDate)) {
      wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' });
      return;
    }

    // 格式化显示文本
    const startDate = new Date(customStartDate);
    const endDate = new Date(customEndDate);
    const startMonth = startDate.getMonth() + 1;
    const startDay = startDate.getDate();
    const endMonth = endDate.getMonth() + 1;
    const endDay = endDate.getDate();

    let dateText = '';
    if (customStartDate === customEndDate) {
      dateText = `${startMonth}/${startDay}`;
    } else {
      dateText = `${startMonth}/${startDay}-${endMonth}/${endDay}`;
    }

    this.setData({
      filterDate: 'custom',
      dateText,
      showCustomDatePicker: false,
      activeFilter: '',
      customStartDate,
      customEndDate
    });
    this.setData({
      trips: this.filterTrips(this.data.allTrips)
    });
  },

  // 点击行程卡片
  onTripTap: function (e) {
    const tripId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 发布行程
  onPublishTrip: function () {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/trip-publish/trip-publish'
    });
  },

  // 下拉刷新
  onRefresh: async function () {
    this.setData({ refreshing: true });
    await this.loadTrips(true);
    this.setData({ refreshing: false });
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '近期行程 - 北上周边行',
      path: '/pages/trip-list/trip-list'
    };
  }
});
