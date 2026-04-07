// pages/about/about.js
Page({
  data: {
    statusBarHeight: 0
  },

  onLoad: function () {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight });
  },

  // 返回
  onBackTap: function () {
    wx.navigateBack();
  },

  // 用户协议
  onTapAgreement: function () {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=user'
    });
  },

  // 隐私政策
  onTapPrivacy: function () {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=privacy'
    });
  }
});
