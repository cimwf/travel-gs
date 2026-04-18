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
  onSubmit: async function () {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请填写详细描述', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    try {
      const app = getApp();
      const db = wx.cloud.database();

      await db.collection('feedbacks').add({
        data: {
          title: this.data.title.trim() || '',
          content: this.data.content.trim(),
          contact: this.data.contact.trim() || '',
          userId: app.globalData.openid || '',
          userInfo: app.globalData.userInfo || null,
          status: 'pending',
          createdAt: Date.now()
        }
      });

      wx.hideLoading();
      wx.showToast({ title: '提交成功', icon: 'success' });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('提交反馈失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  }
});
