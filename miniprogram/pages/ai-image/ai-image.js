const api = require('../../utils/api.js');

Page({
  data: {
    mode: 'text',
    prompt: '',
    referenceImage: '',
    referenceFileID: '',
    resultImage: '',
    resultFileID: '',
    ratio: '1:1',
    style: '旅行海报',
    ratios: ['1:1', '3:4', '4:3', '9:16'],
    styles: ['旅行海报', '写实摄影', '水彩插画', '电影感'],
    canGenerate: false,
    loading: false
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

  updateCanGenerate: function () {
    const promptReady = this.data.prompt.trim().length > 0;
    const imageReady = this.data.mode === 'text' || Boolean(this.data.referenceImage);
    this.setData({ canGenerate: promptReady && imageReady });
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
        title: this.data.mode === 'image' ? '请填写描述并上传参考图' : '请先填写创作描述',
        icon: 'none'
      });
      return;
    }

    if (this.data.loading) return;

    this.setData({ loading: true, resultImage: '', resultFileID: '' });

    try {
      const referenceFileID = this.data.mode === 'image' ? await this.uploadReferenceImage() : '';
      const res = await api.aiImageGenerate({
        mode: this.data.mode,
        prompt: this.data.prompt,
        referenceFileID,
        ratio: this.data.ratio,
        style: this.data.style
      });

      this.setData({
        resultImage: res.image && res.image.tempFileURL ? res.image.tempFileURL : '',
        resultFileID: res.image && res.image.fileID ? res.image.fileID : ''
      });

      wx.showToast({ title: '生成成功', icon: 'success' });
    } catch (err) {
      wx.showToast({
        title: err.message || '生成失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  }
});
