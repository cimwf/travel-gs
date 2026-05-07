const api = require('../../utils/api.js');
const { styleOptions } = require('../../utils/ai-image-templates.js');

Page({
  data: {
    mode: 'text',
    prompt: '',
    referenceImage: '',
    referenceFileID: '',
    taskId: '',
    generationStatus: '',
    ratio: '1:1',
    style: '',
    ratios: ['1:1', '3:4', '4:3', '9:16'],
    styles: styleOptions,
    quickTemplates: [],
    currentTemplates: [],
    templateLoading: false,
    canGenerate: false,
    loading: false,
    summary: {
      total: 100,
      used: 0,
      remaining: 100,
      generatedCount: 0
    }
  },

  onShow: function () {
    const selectedTemplate = wx.getStorageSync('aiImageSelectedTemplate');
    if (selectedTemplate) {
      wx.removeStorageSync('aiImageSelectedTemplate');
      this.applyTemplate(selectedTemplate);
    }
    this.loadSummary();
  },

  onLoad: function (options) {
    if (options && options.mode === 'image') {
      this.setData({
        mode: 'image'
      }, this.updateCanGenerate);
    }
    this.loadTemplates();
  },

  onPullDownRefresh: function () {
    Promise.resolve(this.loadSummary()).finally(() => wx.stopPullDownRefresh());
  },

  onSwitchMode: function (event) {
    const mode = event.currentTarget.dataset.mode;
    this.setData({
      mode,
      quickTemplates: [],
      currentTemplates: [],
      style: this.data.style
    }, this.updateCanGenerate);
    this.loadTemplates(mode);
  },

  onPromptInput: function (event) {
    this.setData({ prompt: event.detail.value }, this.updateCanGenerate);
  },

  onChooseImage: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file && file.tempFilePath) {
          this.setData({
            referenceImage: file.tempFilePath,
            referenceFileID: ''
          }, this.updateCanGenerate);
        }
      }
    });
  },

  onSelectRatio: function (event) {
    this.setData({ ratio: event.currentTarget.dataset.value });
  },

  onSelectStyle: function (event) {
    this.setData({ style: event.currentTarget.dataset.value });
  },

  onUseTemplate: function (event) {
    const template = event.currentTarget.dataset.template;
    if (!template) return;
    this.applyTemplate(template);
  },

  loadTemplates: async function (mode = this.data.mode) {
    this.setData({ templateLoading: true });
    try {
      const res = await api.aiImageTemplates(mode);
      const templates = Array.isArray(res.templates) ? res.templates : [];
      this.setData({
        quickTemplates: templates.slice(0, 4),
        currentTemplates: templates
      });
    } catch (err) {
      console.warn('加载 AI 模板失败', err);
      this.setData({
        quickTemplates: [],
        currentTemplates: []
      });
    } finally {
      this.setData({ templateLoading: false });
    }
  },

  onOpenTemplateLibrary: function () {
    const mode = this.data.mode;
    wx.navigateTo({
      url: `/pages/ai-image-template/ai-image-template?mode=${mode}`,
      success: (res) => {
        if (!res.eventChannel) return;
        res.eventChannel.on('selectTemplate', (template) => {
          this.applyTemplate(template);
        });
      },
      fail: (err) => {
        console.error('打开模板库失败', err);
        wx.showToast({
          title: '打开模板库失败',
          icon: 'none'
        });
      }
    });
  },

  applyTemplate: function (template) {
    if (!template) return;
    const previousMode = this.data.mode;
    const nextData = {
      prompt: template.prompt || this.data.prompt,
      mode: template.mode || this.data.mode,
      style: Object.prototype.hasOwnProperty.call(template, 'style') ? (template.style || '') : this.data.style
    };

    if (template.ratio) {
      nextData.ratio = template.ratio;
    }

    this.setData({
      ...nextData,
      quickTemplates: nextData.mode === previousMode ? this.data.currentTemplates.slice(0, 4) : [],
      currentTemplates: nextData.mode === previousMode ? this.data.currentTemplates : []
    }, this.updateCanGenerate);

    if (nextData.mode !== previousMode) {
      this.loadTemplates(nextData.mode);
    }
  },

  loadSummary: async function () {
    try {
      const res = await api.aiImageSummary();
      if (res.summary) {
        this.setData({ summary: res.summary });
      }
    } catch (err) {
      console.warn('加载 AI 生图统计失败', err);
    }
  },

  onOpenGallery: function () {
    wx.navigateTo({
      url: '/pages/ai-gallery/ai-gallery',
      fail: (err) => {
        console.error('打开 AI 作品页失败', err);
        wx.showToast({
          title: '打开作品集失败',
          icon: 'none'
        });
      }
    });
  },

  updateCanGenerate: function () {
    const promptReady = this.data.prompt.trim().length > 0;
    const textModeReady = this.data.mode === 'text' && promptReady;
    const imageModeReady = this.data.mode === 'image' && Boolean(this.data.referenceImage);
    this.setData({ canGenerate: textModeReady || imageModeReady });
  },

  uploadReferenceImage: async function () {
    if (this.data.referenceFileID) {
      return this.data.referenceFileID;
    }

    const tempFilePath = this.data.referenceImage;
    const suffixMatch = tempFilePath.match(/\.([a-zA-Z0-9]+)$/);
    const suffix = suffixMatch ? suffixMatch[1] : 'jpg';
    const cloudPath = `ai-references/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${suffix}`;
    const uploadRes = await wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath
    });

    this.setData({ referenceFileID: uploadRes.fileID });
    return uploadRes.fileID;
  },

  onGenerate: async function () {
    if (!this.data.canGenerate) {
      wx.showToast({
        title: this.data.mode === 'image' ? '请先上传参考图' : '请先填写创作描述',
        icon: 'none'
      });
      return;
    }

    if (this.data.loading) return;

    this.setData({
      loading: true,
      taskId: '',
      generationStatus: '正在提交任务...'
    });

    try {
      const referenceFileID = this.data.mode === 'image' ? await this.uploadReferenceImage() : '';
      const res = await api.aiImageGenerate({
        mode: this.data.mode,
        prompt: this.data.prompt,
        referenceFileID,
        ratio: this.data.ratio,
        style: this.data.style || ''
      });

      this.setData({ taskId: res.taskId, generationStatus: '' });
      if (res.quota) {
        this.setData({ summary: res.quota });
      }

      wx.showModal({
        title: '已提交生成',
        content: '高清生成需要一些时间。任务已放入作品集，生成中会显示骨架占位，成功后展示图片并扣除 1 次。',
        cancelText: '继续创作',
        confirmText: '看作品',
        success: (modalRes) => {
          if (modalRes.confirm) {
            this.onOpenGallery();
          }
        }
      });
    } catch (err) {
      console.error('提交 AI 生图任务失败', err);
      wx.showToast({
        title: this.formatErrorMessage(err, '生成失败'),
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false, generationStatus: '' });
    }
  },

  formatErrorMessage: function (err, fallback) {
    const message = err && (err.message || err.errMsg || err.error || String(err));
    if (!message) return fallback;
    return message.length > 60 ? message.slice(0, 60) : message;
  }
});
