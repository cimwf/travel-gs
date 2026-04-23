// pages/place-list/place-list.js
const app = getApp();

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
      // 调云函数接口获取景点数据
      const res = await wx.cloud.callFunction({
        name: 'api',
        data: { action: 'attractions/list', data: {} }
      });

      if (res.result && res.result.success) {
        const attractions = res.result.attractions || [];
        this.setData({
          places: attractions,
          loading: false
        });

        // 同步更新全局缓存
        if (attractions.length > 0) {
          app.globalData.attractions = attractions;
          app.globalData.attractionsLoaded = true;
        }
      } else {
        this.setData({ loading: false });
      }
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

  // 上传景点
  onUploadSpot: function () {
    wx.navigateTo({
      url: '/pages/upload-spot/upload-spot'
    });
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
