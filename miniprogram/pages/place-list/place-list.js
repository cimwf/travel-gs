// pages/place-list/place-list.js

Page({
  data: {
    places: [],
    loading: true,
    showCustomModal: false,
    customPlaceName: ''
  },

  onLoad: function (options) {
    this.loadPlaces();
  },

  // 加载地点列表
  loadPlaces: async function () {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const res = await db.collection('quick_attractions')
        .orderBy('wantCount', 'desc')
        .limit(50)
        .get();

      this.setData({
        places: res.data || [],
        loading: false
      });
    } catch (err) {
      console.error('加载地点失败', err);
      this.setData({ loading: false });
    }
  },

  // 选择地点
  onSelectPlace: function (e) {
    const item = e.currentTarget.dataset.item;

    // 返回上一页并传递选中的地点
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];

    if (prevPage) {
      prevPage.setData({
        placeId: item._id,
        placeName: item.name
      });
    }

    wx.navigateBack();
  },

  // 点击自定义景点
  onCustomPlace: function () {
    this.setData({
      showCustomModal: true,
      customPlaceName: ''
    });
  },

  // 阻止事件冒泡
  preventBubble: function () {},

  // 关闭自定义弹窗
  onCloseCustomModal: function () {
    this.setData({ showCustomModal: false });
  },

  // 输入自定义景点名称
  onCustomInput: function (e) {
    this.setData({ customPlaceName: e.detail.value });
  },

  // 确认自定义景点
  onConfirmCustom: function () {
    const name = this.data.customPlaceName.trim();
    if (!name) {
      wx.showToast({ title: '请输入景点名称', icon: 'none' });
      return;
    }

    // 返回上一页并传递自定义景点
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];

    if (prevPage) {
      prevPage.setData({
        placeId: '',
        placeName: name
      });
    }

    wx.navigateBack();
  }
});
