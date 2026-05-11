const api = require('../../utils/api.js');
const { styleOptions } = require('../../utils/ai-image-templates.js');
const { formatAiImageErrorMessage } = require('../../utils/ai-image-error.js');

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

Page({
  data: {
    mode: 'text',
    prompt: '',
    referenceImage: '',
    referenceFileID: '',
    referenceImageType: '',
    taskId: '',
    generationStatus: '',
    ratio: '1:1',
    style: '',
    ratios: ['1:1', '3:4', '4:3', '16:9', '9:16'],
    styles: styleOptions,
    quickTemplates: [],
    currentTemplates: [],
    templateLoading: false,
    channels: [],
    selectedChannelId: '',
    selectedChannel: null,
    channelLoading: false,
    showChannelPicker: false,
    packages: [],
    packageLoading: false,
    purchasingPackageId: '',
    showPackageModal: false,
    canGenerate: false,
    loading: false,
    summaryReady: false,
    summaryLoading: false,
    summary: {
      total: 3,
      used: 0,
      remaining: 3,
      generatedCount: 0
    }
  },

  onShow: function () {
    const selectedTemplate = wx.getStorageSync('aiImageSelectedTemplate');
    if (selectedTemplate) {
      wx.removeStorageSync('aiImageSelectedTemplate');
      this.applyTemplate(selectedTemplate);
    }

    const now = Date.now();
    const staleMs = 30 * 1000;
    if (!this._lastAiImagePageLoadedAt || now - this._lastAiImagePageLoadedAt > staleMs) {
      this._lastAiImagePageLoadedAt = now;
      this.loadChannels();
      this.loadSummary();
      this.loadPackages();
      return;
    }

    if (!this.data.summaryReady) {
      this.loadSummary();
    }
  },

  onLoad: function (options) {
    const initialMode = options && options.mode === 'image' ? 'image' : 'text';
    if (initialMode !== this.data.mode) {
      this.setData({
        mode: initialMode
      }, () => {
        this.updateCanGenerate();
        this.loadTemplates(initialMode);
      });
      return;
    }
    this.loadTemplates(initialMode);
  },

  onPullDownRefresh: function () {
    Promise.all([
      this.loadSummary(),
      this.loadChannels(),
      this.loadTemplates(this.data.mode),
      this.loadPackages()
    ]).finally(() => wx.stopPullDownRefresh());
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
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file && file.tempFilePath) {
          this.setData({
            referenceImage: file.tempFilePath,
            referenceFileID: '',
            referenceImageType: file.fileType || file.type || ''
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

  noop: function () {},

  loadTemplates: async function (mode = this.data.mode) {
    const requestId = (this._loadTemplatesRequestId || 0) + 1;
    this._loadTemplatesRequestId = requestId;
    this.setData({ templateLoading: true });
    try {
      const res = await api.aiImageTemplates(mode);
      if (this._loadTemplatesRequestId !== requestId || mode !== this.data.mode) return;
      const templates = Array.isArray(res.templates) ? res.templates : [];
      this.setData({
        quickTemplates: templates.slice(0, 4),
        currentTemplates: templates
      });
    } catch (err) {
      if (this._loadTemplatesRequestId !== requestId) return;
      console.warn('加载 AI 模板失败', err);
      this.setData({
        quickTemplates: [],
        currentTemplates: []
      });
    } finally {
      if (this._loadTemplatesRequestId !== requestId) return;
      this.setData({ templateLoading: false });
    }
  },

  loadChannels: async function () {
    this.setData({ channelLoading: true });
    try {
      const res = await api.aiImageChannels();
      const channels = Array.isArray(res.channels) ? res.channels : [];
      const savedChannelId = wx.getStorageSync('aiImageSelectedChannelId');
      const defaultChannelId = String(res.defaultChannelId || '').trim();
      const currentChannelId = String(this.data.selectedChannelId || '').trim();
      const preferredChannelId = savedChannelId || currentChannelId || defaultChannelId;
      const selectedChannel = channels.find(item => item.channelId === preferredChannelId) || channels[0] || null;
      const selectedChannelId = selectedChannel ? selectedChannel.channelId : '';

      this.setData({
        channels,
        selectedChannelId,
        selectedChannel
      });

      if (selectedChannelId) {
        wx.setStorageSync('aiImageSelectedChannelId', selectedChannelId);
      } else {
        wx.removeStorageSync('aiImageSelectedChannelId');
      }
    } catch (err) {
      console.warn('加载 AI 渠道失败', err);
      if (!this.data.selectedChannelId) {
        this.setData({
          channels: [],
          selectedChannelId: '',
          selectedChannel: null
        });
      }
    } finally {
      this.setData({ channelLoading: false });
    }
  },

  onOpenChannelPicker: function () {
    if (this.data.channelLoading) return;
    if (!this.data.channels.length) {
      wx.showToast({
        title: '暂无可用渠道',
        icon: 'none'
      });
      return;
    }

    this.setData({ showChannelPicker: true });
  },

  closeChannelPicker: function () {
    this.setData({ showChannelPicker: false });
  },

  onSelectChannel: function (event) {
    const channelId = String(event.currentTarget.dataset.id || '').trim();
    if (!channelId) return;
    const channel = this.data.channels.find(item => item.channelId === channelId) || null;
    this.setData({
      selectedChannelId: channelId,
      selectedChannel: channel,
      showChannelPicker: false
    });
    wx.setStorageSync('aiImageSelectedChannelId', channelId);
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
    this.setData({ summaryLoading: true });
    try {
      const res = await api.aiImageSummary();
      if (res.summary) {
        const summary = this.normalizeSummary(res.summary);
        this.setData({ summary, summaryReady: true });
        return summary;
      }
      this.setData({ summaryReady: false });
      return null;
    } catch (err) {
      console.warn('加载 AI 生图统计失败', err);
      return null;
    } finally {
      this.setData({ summaryLoading: false });
    }
  },

  loadPackages: async function () {
    this.setData({ packageLoading: true });
    try {
      const res = await api.aiImagePackages();
      const packages = Array.isArray(res.packages) ? res.packages : [];
      this.setData({ packages });
    } catch (err) {
      console.warn('加载 AI 套餐失败', err);
      this.setData({ packages: [] });
    } finally {
      this.setData({ packageLoading: false });
    }
  },

  openPackageModal: function () {
    this.setData({ showPackageModal: true });
    if (!this.data.packages.length) {
      this.loadPackages();
    }
  },

  closePackageModal: function () {
    if (this.data.purchasingPackageId) return;
    this.setData({ showPackageModal: false });
  },

  onPurchasePackage: async function (event) {
    const packageId = event.currentTarget.dataset.id;
    if (!packageId || this.data.purchasingPackageId) return;

    this.setData({ purchasingPackageId: packageId });
    try {
      const res = await api.aiImagePurchasePackage(packageId);
      if (res.summary) {
        this.setData({ summary: this.normalizeSummary(res.summary), summaryReady: true });
      }
      wx.showToast({
        title: '充值成功',
        icon: 'success'
      });
      this.setData({ showPackageModal: false });
    } catch (err) {
      console.error('模拟购买 AI 套餐失败', err);
      wx.showToast({
        title: this.formatErrorMessage(err, '充值失败'),
        icon: 'none'
      });
    } finally {
      this.setData({ purchasingPackageId: '' });
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

  normalizeImageSuffix: function (value) {
    const suffix = String(value || '').trim().toLowerCase().replace(/^\./, '');
    if (suffix === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'webp'].includes(suffix)) return suffix;
    return '';
  },

  getImageSuffixFromPath: function (filePath) {
    const cleanPath = String(filePath || '').split('?')[0];
    const suffixMatch = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
    return this.normalizeImageSuffix(suffixMatch ? suffixMatch[1] : '');
  },

  getReferenceImageSuffix: function (tempFilePath) {
    return new Promise((resolve) => {
      const fallback = this.normalizeImageSuffix(this.data.referenceImageType) ||
        this.getImageSuffixFromPath(tempFilePath) ||
        'jpg';

      if (!wx.getImageInfo || !tempFilePath) {
        resolve(fallback);
        return;
      }

      wx.getImageInfo({
        src: tempFilePath,
        success: (res) => {
          resolve(this.normalizeImageSuffix(res.type) || fallback);
        },
        fail: () => resolve(fallback)
      });
    });
  },

  uploadReferenceImage: async function () {
    if (this.data.referenceFileID) {
      return this.data.referenceFileID;
    }

    const tempFilePath = this.data.referenceImage;
    const suffix = await this.getReferenceImageSuffix(tempFilePath);
    const rawOpenid = wx.getStorageSync('openid') || 'anonymous';
    const openid = String(rawOpenid).replace(/[^a-zA-Z0-9_-]/g, '') || 'anonymous';
    const rand = `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    const cloudPath = `ai-references/${openid}/${Date.now()}_${rand}.${suffix}`;
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

    let summary = this.data.summary;
    if (!this.data.summaryReady) {
      wx.showLoading({ title: '读取额度...' });
      summary = await this.loadSummary();
      wx.hideLoading();

      if (!summary) {
        wx.showToast({
          title: '额度读取失败，请稍后重试',
          icon: 'none'
        });
        return;
      }
    }

    if (summary.remaining <= 0) {
      this.openPackageModal();
      return;
    }

    this.setData({
      loading: true,
      taskId: '',
      generationStatus: '正在提交任务...'
    });

    try {
      const referenceFileID = this.data.mode === 'image' ? await this.uploadReferenceImage() : '';
      const payload = {
        mode: this.data.mode,
        prompt: this.data.prompt,
        referenceFileID,
        ratio: this.data.ratio,
        style: this.data.style || '',
        channelId: this.data.selectedChannelId || '',
        channelName: this.data.selectedChannel ? (this.data.selectedChannel.name || '') : ''
      };
      const res = await api.aiImageGenerate(payload);

      const nextData = { taskId: res.taskId, generationStatus: '' };
      if (res.quota) {
        nextData.summary = this.normalizeSummary(res.quota);
        nextData.summaryReady = true;
      }
      this.setData(nextData);

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
      const message = this.formatErrorMessage(err, '生成失败');
      if (message.includes('次数已用完')) {
        this.openPackageModal();
        return;
      }
      wx.showToast({
        title: message,
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false, generationStatus: '' });
    }
  },

  formatErrorMessage: function (err, fallback) {
    return formatAiImageErrorMessage(err, fallback, { includeChannel: true });
  },

  normalizeSummary: function (summary = {}) {
    const total = toSafeNumber(summary.total, 3);
    const used = toSafeNumber(summary.used, toSafeNumber(summary.generatedCount));

    return {
      total,
      used,
      remaining: typeof summary.remaining === 'number' ? toSafeNumber(summary.remaining) : Math.max(0, total - used),
      generatedCount: toSafeNumber(summary.generatedCount, used)
    };
  }
});
