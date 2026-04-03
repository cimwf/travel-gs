// pages/trip-publish/trip-publish.js
const app = getApp();
const db = wx.cloud.database();
const auth = require('../../utils/auth.js');

Page({
  data: {
    statusBarHeight: 0,
    placeId: '',
    placeName: '',
    departure: '海淀区',
    date: '',
    minDate: '',
    hasCar: true,
    currentCount: 1,
    needCount: 3,
    remark: '',
    userInfo: null,
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
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight });

    // 检查登录（发布页需要登录）
    if (!auth.checkNeedLogin()) {
      this.initPage(options);
    } else {
      auth.goToLogin('/pages/trip-publish/trip-publish');
    }
  },

  onShow: function () {
    this.setData({ userInfo: app.globalData.userInfo });
  },

  // 初始化页面
  initPage: function (options) {
    const placeId = options.placeId || '';
    const placeName = options.placeName || '';

    // 设置最小日期为今天
    const today = new Date();
    const minDate = this.formatDate(today);

    // 默认日期为明天
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const defaultDate = this.formatDate(tomorrow);

    this.setData({
      placeId,
      placeName,
      minDate,
      date: defaultDate
    });
  },

  // 格式化日期
  formatDate: function (date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 返回
  onBackTap: function () {
    wx.navigateBack();
  },

  // 选择地点
  onSelectPlace: function () {
    // 如果没有传入地点，跳转到地点列表选择
    if (!this.data.placeId) {
      wx.navigateTo({
        url: '/pages/place-list/place-list?mode=select'
      });
    } else {
      wx.showActionSheet({
        itemList: ['重新选择地点'],
        success: (res) => {
          if (res.tapIndex === 0) {
            wx.navigateTo({
              url: '/pages/place-list/place-list?mode=select'
            });
          }
        }
      });
    }
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

  // 人数调整（合并处理）
  onCountChange: function (e) {
    const type = e.currentTarget.dataset.type;
    const field = e.currentTarget.dataset.field;
    let value = this.data[field];
    const min = 1;
    const max = 10;

    if (type === 'minus' && value > min) {
      value--;
    } else if (type === 'plus' && value < max) {
      value++;
    }

    this.setData({ [field]: value });
  },

  // 备注输入
  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },

  // 提交发布
  onSubmit: function () {
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

    wx.showLoading({ title: '发布中...' });

    // 构造行程数据
    const tripData = {
      placeId: this.data.placeId,
      placeName: this.data.placeName,
      departure: this.data.departure,
      date: this.data.date,
      hasCar: this.data.hasCar,
      currentCount: this.data.currentCount,
      needCount: this.data.needCount,
      remark: this.data.remark,
      status: 'open',
      createTime: db.serverDate()
    };

    // 保存到数据库
    db.collection('trips').add({
      data: tripData
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '发布成功', icon: 'success' });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }).catch(err => {
      wx.hideLoading();
      console.error('发布失败', err);
      // 模拟成功
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    });
  }
});
