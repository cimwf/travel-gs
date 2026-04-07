// pages/feedback/feedback.js
Page({
  data: {
    statusBarHeight: 0,
    title: '',
    content: '',
    contact: ''
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

  // 输入标题
  onTitleInput: function (e) {
    this.setData({ title: e.detail.value });
  },

  // 输入内容
  onContentInput: function (e) {
    this.setData({ content: e.detail.value });
  },

  // 输入联系方式
  onContactInput: function (e) {
    this.setData({ contact: e.detail.value });
  },

  // 提交
  onSubmit: function () {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请填写详细描述', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    // 模拟提交
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({ title: '提交成功', icon: 'success' });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }, 500);
  }
});
