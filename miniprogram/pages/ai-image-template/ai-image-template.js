const api = require('../../utils/api.js');

Page({
  data: {
    activeMode: 'text',
    templates: [],
    loading: false
  },

  onLoad: function (options) {
    const activeMode = options && options.mode === 'image' ? 'image' : 'text';
    this.setData({ activeMode, templates: [] });
    this.loadTemplates(activeMode);
  },

  onSwitchMode: function (event) {
    const activeMode = event.currentTarget.dataset.mode;
    this.setData({ activeMode, templates: [] });
    this.loadTemplates(activeMode);
  },

  loadTemplates: async function (mode) {
    this.setData({ loading: true });
    try {
      const res = await api.aiImageTemplates(mode);
      const templates = Array.isArray(res.templates) ? res.templates : [];
      this.setData({ templates });
    } catch (err) {
      console.warn('加载 AI 模板库失败', err);
      this.setData({ templates: [] });
      wx.showToast({
        title: '模板加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  onVoteTemplate: async function (event) {
    const id = event.currentTarget.dataset.id;
    const vote = event.currentTarget.dataset.vote;
    if (!id || !['like', 'dislike'].includes(vote)) return;

    try {
      const res = await api.aiImageTemplateVote(id, vote);
      const templates = this.data.templates.map((item) => {
        if (item.id !== id && item._id !== id) return item;
        return {
          ...item,
          likeCount: res.likeCount || 0,
          dislikeCount: res.dislikeCount || 0,
          userVote: res.userVote || ''
        };
      });
      this.setData({ templates });
    } catch (err) {
      console.error('提交模板反馈失败', err);
      wx.showToast({
        title: '反馈失败，请稍后重试',
        icon: 'none'
      });
    }
  },

  onSelectTemplate: function (event) {
    const template = event.currentTarget.dataset.template;
    if (!template) return;

    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (eventChannel && eventChannel.emit) {
      eventChannel.emit('selectTemplate', template);
    } else {
      wx.setStorageSync('aiImageSelectedTemplate', template);
    }

    wx.navigateBack();
  }
});
