// pages/trip-publish/trip-publish.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    // 必填信息
    tripTitle: '',        // 行程标题（可选）
    placeId: '',
    placeName: '',
    departure: '',
    date: '',
    minDate: '',
    hasCar: true,
    recruitCount: 3,
    contactPhone: '',     // 联系方式

    // 可选信息
    optionalExpanded: false,
    meetingPlace: '',     // 集合地点
    meetingTime: '',      // 集合时间
    carSeats: '',         // 车辆座位
    carModel: '',         // 车辆型号
    travelDesc: '',       // 出行描述（无车时）
    price: '',            // 人均价格
    remark: '',           // 行程说明

    // 出发地选择
    showDepartureModal: false,
    tempDeparture: '',
    districts: [
      '海淀区', '朝阳区', '丰台区', '东城区',
      '西城区', '石景山区', '门头沟区', '房山区',
      '通州区', '顺义区', '昌平区', '大兴区',
      '怀柔区', '平谷区', '密云区', '延庆区'
    ]
  },

  onLoad: function (options) {
    if (!auth.checkNeedLogin()) {
      this.initPage(options);
    } else {
      auth.goToLogin('/pages/trip-publish/trip-publish');
    }
  },

  // 初始化页面
  initPage: function (options) {
    const placeId = options.placeId || '';
    const placeName = decodeURIComponent(options.placeName || '');

    const today = new Date();
    const minDate = this.formatDate(today);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const defaultDate = this.formatDate(tomorrow);

    // 从用户信息中获取默认联系方式
    const userInfo = wx.getStorageSync('userInfo') || app.globalData.userInfo || {};
    const contactPhone = userInfo.contactPhone || '';

    this.setData({
      placeId,
      placeName,
      minDate,
      date: defaultDate,
      departure: '海淀区',
      contactPhone
    });
  },

  // 格式化日期
  formatDate: function (date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 行程标题输入
  onTitleInput: function (e) {
    this.setData({ tripTitle: e.detail.value });
  },

  // 选择地点
  onSelectPlace: function () {
    wx.navigateTo({
      url: '/pages/place-list/place-list?mode=select'
    });
  },

  // 打开出发地选择弹窗
  onSelectDeparture: function () {
    this.setData({
      showDepartureModal: true,
      tempDeparture: this.data.departure
    });
  },

  // 关闭出发地选择弹窗
  onCloseDepartureModal: function () {
    this.setData({ showDepartureModal: false });
  },

  // 选择区域
  onSelectDistrict: function (e) {
    const district = e.currentTarget.dataset.district;
    this.setData({ tempDeparture: district });
  },

  // 确认选择出发地
  onConfirmDeparture: function () {
    this.setData({
      departure: this.data.tempDeparture,
      showDepartureModal: false
    });
  },

  // 选择日期
  onDateChange: function (e) {
    this.setData({ date: e.detail.value });
  },

  // 选择出行方式
  onCarChange: function (e) {
    const hasCar = e.currentTarget.dataset.value;
    this.setData({ hasCar });
  },

  // 招募人数调整
  onCountChange: function (e) {
    const type = e.currentTarget.dataset.type;
    let value = this.data.recruitCount;
    const min = 1;
    const max = 10;

    if (type === 'minus' && value > min) {
      value--;
    } else if (type === 'plus' && value < max) {
      value++;
    }

    this.setData({ recruitCount: value });
  },

  // 联系方式输入
  onPhoneInput: function (e) {
    this.setData({ contactPhone: e.detail.value });
  },

  // 展开/收起可选信息
  toggleOptional: function () {
    this.setData({ optionalExpanded: !this.data.optionalExpanded });
  },

  // 集合地点输入
  onMeetingPlaceInput: function (e) {
    this.setData({ meetingPlace: e.detail.value });
  },

  // 集合时间选择
  onMeetingTimeChange: function (e) {
    this.setData({ meetingTime: e.detail.value });
  },

  // 车辆座位输入
  onCarSeatsInput: function (e) {
    this.setData({ carSeats: e.detail.value });
  },

  // 车辆型号输入
  onCarModelInput: function (e) {
    this.setData({ carModel: e.detail.value });
  },

  // 出行描述输入
  onTravelDescInput: function (e) {
    this.setData({ travelDesc: e.detail.value });
  },

  // 人均价格输入
  onPriceInput: function (e) {
    this.setData({ price: e.detail.value });
  },

  // 备注输入
  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },

  // 提交发布
  onSubmit: async function () {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (!this.data.placeId) {
      wx.showToast({ title: '请选择目的地', icon: 'none' });
      return;
    }

    if (!this.data.date) {
      wx.showToast({ title: '请选择出行日期', icon: 'none' });
      return;
    }

    if (!this.data.departure) {
      wx.showToast({ title: '请选择出发地', icon: 'none' });
      return;
    }

    if (!this.data.contactPhone) {
      wx.showToast({ title: '请输入联系方式', icon: 'none' });
      return;
    }

    // 验证手机号格式
    const phoneReg = /^1[3-9]\d{9}$/;
    if (!phoneReg.test(this.data.contactPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发布中...' });

    // 确保获取到 openid
    let openid = app.globalData.openid;
    if (!openid) {
      try {
        openid = await app.getOpenid();
      } catch (err) {
        console.error('获取openid失败', err);
        wx.hideLoading();
        wx.showToast({ title: '请先登录', icon: 'none' });
        return;
      }
    }

    // 获取最新的用户信息
    const userInfo = wx.getStorageSync('userInfo') || app.globalData.userInfo || {};

    // 构造行程数据
    const currentCount = 1;
    const needCount = this.data.recruitCount;
    const totalParticipants = currentCount + needCount;

    const tripData = {
      tripTitle: this.data.tripTitle,
      placeId: this.data.placeId,
      placeName: this.data.placeName,
      departure: this.data.departure,
      date: this.data.date,
      hasCar: this.data.hasCar,
      currentCount: currentCount,
      needCount: needCount,
      totalParticipants: totalParticipants,
      contactPhone: this.data.contactPhone,
      // 可选信息
      meetingPlace: this.data.meetingPlace,
      meetingTime: this.data.meetingTime,
      carSeats: this.data.hasCar ? this.data.carSeats : '',
      carModel: this.data.hasCar ? this.data.carModel : '',
      travelDesc: this.data.hasCar ? '' : this.data.travelDesc,
      price: this.data.price,
      remark: this.data.remark,
      status: 'open',
      // 发起人信息
      creatorId: openid,
      creatorName: userInfo.nickname || '旅行者',
      creatorAvatar: userInfo.avatar || '',
      // 参与者列表（发起人默认参与）
      participants: [{
        userId: openid,
        nickname: userInfo.nickname || '旅行者',
        avatar: userInfo.avatar || ''
      }],
      createdAt: Date.now()
    };

    try {
      const db = wx.cloud.database();
      const res = await db.collection('trips').add({ data: tripData });

      wx.hideLoading();

      // 格式化日期显示
      const dateObj = new Date(this.data.date);
      const dateText = dateObj.getFullYear() + '年' + (dateObj.getMonth() + 1) + '月' + dateObj.getDate() + '日';

      // 跳转到发布成功页
      const params = [
        'tripId=' + res._id,
        'placeId=' + this.data.placeId,
        'placeName=' + encodeURIComponent(this.data.placeName),
        'placeAddress=' + encodeURIComponent('北京市'),
        'dateText=' + encodeURIComponent(dateText),
        'currentCount=' + currentCount,
        'needCount=' + needCount
      ].join('&');

      wx.redirectTo({
        url: '/pages/trip-publish-success/trip-publish-success?' + params
      });
    } catch (err) {
      wx.hideLoading();
      console.error('发布失败', err);
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
    }
  }
});
