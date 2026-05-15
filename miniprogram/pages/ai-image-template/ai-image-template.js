const api = require('../../utils/api.js');

Page({
  data: {
    activeMode: 'text',
    activeScene: '',
    scenes: [{ label: '全部', value: '', count: 0 }],
    templates: [],
    allTemplates: [],
    loading: false
  },

  onLoad: function (options) {
    this.templateCacheByMode = {};
    const activeMode = options && options.mode === 'image' ? 'image' : 'text';
    this.setData({ activeMode, templates: [] });
    this.loadTemplates(activeMode);
  },

  onSwitchMode: function (event) {
    const activeMode = event.currentTarget.dataset.mode;
    if (!activeMode || activeMode === this.data.activeMode) return;

    const cachedTemplates = this.templateCacheByMode && this.templateCacheByMode[activeMode];
    if (cachedTemplates) {
      this.setData({
        activeMode,
        activeScene: '',
        allTemplates: cachedTemplates,
        templates: cachedTemplates,
        scenes: this.buildScenes(cachedTemplates)
      });
      return;
    }

    this.setData({
      activeMode,
      activeScene: '',
      templates: [],
      allTemplates: [],
      scenes: [{ label: '全部', value: '', count: 0 }]
    });
    this.loadTemplates(activeMode);
  },

  onSwitchScene: function (event) {
    const activeScene = event.currentTarget.dataset.scene || '';
    this.setData({
      activeScene,
      templates: this.filterTemplates(this.data.allTemplates, activeScene)
    });
  },

  loadTemplates: async function (mode) {
    const requestId = (this._loadTemplatesRequestId || 0) + 1;
    this._loadTemplatesRequestId = requestId;
    this.setData({ loading: true });
    try {
      const res = await api.aiImageTemplates(mode);
      if (this._loadTemplatesRequestId !== requestId || mode !== this.data.activeMode) return;
      const templates = Array.isArray(res.templates) ? res.templates : [];
      if (!this.templateCacheByMode) {
        this.templateCacheByMode = {};
      }
      this.templateCacheByMode[mode] = templates;
      const scenes = this.buildScenes(templates);
      this.setData({
        allTemplates: templates,
        templates: this.filterTemplates(templates, this.data.activeScene),
        scenes
      });
    } catch (err) {
      if (this._loadTemplatesRequestId !== requestId) return;
      console.warn('加载 AI 模板库失败', err);
      this.setData({
        templates: [],
        allTemplates: [],
        scenes: [{ label: '全部', value: '', count: 0 }]
      });
      wx.showToast({
        title: '模板加载失败',
        icon: 'none'
      });
    } finally {
      if (this._loadTemplatesRequestId !== requestId) return;
      this.setData({ loading: false });
    }
  },

  buildScenes: function (templates) {
    const countMap = {};
    templates.forEach((item) => {
      const scene = String(item.scene || '').trim();
      if (!scene) return;
      countMap[scene] = (countMap[scene] || 0) + 1;
    });

    const sceneOptions = Object.keys(countMap).map((value) => ({
      label: value,
      value,
      count: countMap[value]
    }));

    return [
      { label: '全部', value: '', count: templates.length },
      ...sceneOptions
    ];
  },

  filterTemplates: function (templates, scene) {
    if (!scene) return templates;
    return templates.filter((item) => item.scene === scene);
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
      const allTemplates = this.data.allTemplates.map((item) => {
        if (item.id !== id && item._id !== id) return item;
        return {
          ...item,
          likeCount: res.likeCount || 0,
          dislikeCount: res.dislikeCount || 0,
          userVote: res.userVote || ''
        };
      });
      this.setData({ templates, allTemplates });
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
