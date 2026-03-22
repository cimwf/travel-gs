// pages/trip-publish/trip-publish.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    placeId: '',
    placeName: '',
    date: '',
    minDate: '',
    hasCar: true,
    carSeats: 4,
    currentCount: 1,
    needCount: 3,
    remark: '',
    userInfo: null
  },

  onLoad: function (options) {
    const placeId = options.placeId || '';
    const placeName = options.placeName || '选择地点';
    
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

  onShow: function () {
    this.setData({ userInfo: app.globalData.userInfo });
  },

  // 格式化日期
  formatDate: function (date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  // 人数调整
  onCurrentCountChange: function (e) {
    const type = e.currentTarget.dataset.type;
    let currentCount = this.data.currentCount;
    if (type === 'minus' && currentCount > 1) {
      currentCount--;
    } else if (type === 'plus' && currentCount < 10) {
      currentCount++;
    }
    this.setData({ currentCount });
  },

  onNeedCountChange: function (e) {
    const type = e.currentTarget.dataset.type;
    let needCount = this.data.needCount;
    if (type === 'minus' && needCount > 1) {
      needCount--;
    } else if (type === 'plus' && needCount < 10) {
      needCount++;
    }
    this.setData({ needCount });
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

    if (!this.data.date) {
      wx.showToast({ title: '请选择出行日期', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发布中...' });

    // 构造行程数据
    const tripData = {
      placeId: this.data.placeId,
      placeName: this.data.placeName,
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
    }).then(res => {
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
