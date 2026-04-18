// pages/about/about.js
Page({
  data: {},

  onLoad: function () {},

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
