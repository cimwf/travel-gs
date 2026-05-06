const api = require('../../utils/api.js');

Page({
  data: {
    activeView: 'create',
    mode: 'text',
    prompt: '',
    referenceImage: '',
    referenceFileID: '',
    taskId: '',
    generationStatus: '',
    ratio: '1:1',
    style: '旅行海报',
    ratios: ['1:1', '3:4', '4:3', '9:16'],
    styles: [
      '旅行海报',
      '写实摄影',
      '漫画风',
      '韩系写真',
      '日系清新',
      '甜酷风',
      '梦幻公主',
      '复古胶片',
      '水彩插画',
      '油画质感',
      '电影感',
      '杂志封面',
      '头像写真',
      '婚纱大片',
      '萌宠拟人',
      '古风国潮',
      '治愈手账',
      '轻奢穿搭'
    ],
    canGenerate: false,
    loading: false,
    galleryLoading: false,
    summary: {
      total: 100,
      used: 0,
      remaining: 100,
      generatedCount: 0
    },
    works: [],
    isGalleryEmpty: true
  },

  onShow: function () {
    this.loadSummary();
    if (this.data.activeView === 'gallery') {
      this.loadWorks();
    }
  },

  onPullDownRefresh: function () {
    const task = this.data.activeView === 'gallery' ? this.loadWorks() : this.loadSummary();
    Promise.resolve(task).finally(() => wx.stopPullDownRefresh());
  },

  onSwitchMode: function (event) {
    const mode = event.currentTarget.dataset.mode;
    this.setData({ mode }, this.updateCanGenerate);
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

  loadWorks: async function () {
    this.setData({ galleryLoading: true });
    try {
      const res = await api.aiImageList();
      const works = (res.images || []).map(item => this.formatWork(item));
      this.setData({
        summary: res.summary || this.data.summary,
        works,
        isGalleryEmpty: works.length === 0
      });
    } catch (err) {
      console.error('加载 AI 作品失败', err);
      wx.showToast({
        title: this.formatErrorMessage(err, '加载失败'),
        icon: 'none'
      });
    } finally {
      this.setData({ galleryLoading: false });
    }
  },

  formatWork: function (item) {
    const images = (item.images || []).map((image, index) => {
      const imageUrl = image.signedUrl || image.url || image.publicUrl || '';
      const status = image.status || item.status || (imageUrl ? 'completed' : 'queued');
      return {
        ...image,
        id: image.id || `${item.taskId || item._id || 'image'}_${index}`,
        status,
        imageUrl,
        copyUrl: image.publicUrl || image.url || imageUrl || '',
        metaText: this.formatImageMeta(image),
        errorText: image.error || item.error || '请重新生成'
      };
    });
    const firstImage = images[0] || {};
    const status = item.status || firstImage.status || 'queued';
    return {
      ...item,
      status,
      statusText: this.getStatusText(status),
      statusDesc: this.getStatusDesc(status),
      imageUrl: firstImage.imageUrl || item.imageUrl || '',
      copyUrl: firstImage.copyUrl || item.publicUrl || item.imageUrl || '',
      images,
      createdText: this.formatTime(item.createdAt),
      metaText: firstImage.metaText || '',
      errorText: item.error || firstImage.errorText || '请重新生成'
    };
  },

  formatImageMeta: function (image) {
    const parts = [];
    if (image.width && image.height) {
      parts.push(`${image.width} x ${image.height}`);
    }
    if (image.format) {
      parts.push(String(image.format).toUpperCase());
    }
    if (image.bytes) {
      const mb = image.bytes / 1024 / 1024;
      parts.push(`${mb >= 1 ? mb.toFixed(1) : (image.bytes / 1024).toFixed(0)}${mb >= 1 ? 'MB' : 'KB'}`);
    }
    return parts.join(' · ');
  },

  getStatusText: function (status) {
    if (status === 'completed') return '生成完成';
    if (status === 'failed' || status === 'cancelled') return '生成失败';
    return '生成中';
  },

  getStatusDesc: function (status) {
    if (status === 'completed') return '点击图片可放大查看';
    if (status === 'failed' || status === 'cancelled') return '这次没有生成成功，可以换个描述再试';
    return '高清图片正在生成，请稍后刷新作品集';
  },

  formatTime: function (timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  onOpenGallery: function () {
    this.setData({ activeView: 'gallery' });
    this.loadWorks();
  },

  onBackToCreate: function () {
    this.setData({ activeView: 'create' });
    this.loadSummary();
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
        style: this.data.style
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

  onPreviewImage: function (event) {
    const url = event.currentTarget.dataset.url;
    const urls = this.data.works
      .filter(item => item.status === 'completed' && item.imageUrl)
      .map(item => item.imageUrl);

    if (!url) return;
    wx.previewImage({ current: url, urls });
  },

  onSaveImage: function (event) {
    const url = event.currentTarget.dataset.url;
    if (!url) return;

    wx.getSetting({
      success: (settingRes) => {
        if (settingRes.authSetting['scope.writePhotosAlbum'] === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '请允许保存图片到相册。',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) wx.openSetting();
            }
          });
          return;
        }

        this.downloadAndSaveImage(url);
      },
      fail: () => this.downloadAndSaveImage(url)
    });
  },

  downloadAndSaveImage: function (url) {
    wx.showLoading({ title: '保存中' });
    wx.downloadFile({
      url,
      success: (downloadRes) => {
        if (downloadRes.statusCode !== 200) {
          wx.showToast({ title: '图片下载失败', icon: 'none' });
          return;
        }

        wx.saveImageToPhotosAlbum({
          filePath: downloadRes.tempFilePath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: (err) => {
            console.error('保存图片到相册失败', err);
            wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' });
          }
        });
      },
      fail: (err) => {
        console.error('下载图片失败', err);
        wx.showToast({ title: '图片下载失败', icon: 'none' });
      },
      complete: () => wx.hideLoading()
    });
  },

  onCopyLink: function (event) {
    const url = event.currentTarget.dataset.url;
    if (!url) return;

    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    });
  },

  formatErrorMessage: function (err, fallback) {
    const message = err && (err.message || err.errMsg || err.error || String(err));
    if (!message) return fallback;
    return message.length > 60 ? message.slice(0, 60) : message;
  }
});
