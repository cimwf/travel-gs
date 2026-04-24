// pages/feedback/feedback.js
const api = require('../../utils/api.js');

Page({
  data: {
    title: '',
    content: '',
    contact: ''
  },

  onLoad: function () {},

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
  onSubmit: async function () {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请填写详细描述', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    try {
      const res = await api.feedbackCreate({
        title: this.data.title,
        content: this.data.content,
        contact: this.data.contact
      });

      wx.hideLoading();

      if (res.success) {
        wx.showToast({ title: '提交成功', icon: 'success' });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.error || '提交失败，请重试', icon: 'none' });
      }
    } catch (err) {
      console.error('提交反馈失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  }
});
