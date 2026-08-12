var api = require('../../utils/api.js');
var tripMediaUpload = require('../../utils/trip-media-upload.js');

Page({
  data: {
    reasons: ['违法违规', '色情低俗', '暴力血腥', '虚假诈骗', '广告营销', '侵犯隐私', '人身攻击', '其他'],
    reason: '',
    description: '',
    images: [],
    placeholderSlots: [0, 1],
    submitting: false
  },

  onLoad: function (options) {
    this._targetType = String(options && options.type || '');
    this._targetId = options && options.id ? decodeURIComponent(options.id) : '';
    if (['community_post', 'trip_log'].indexOf(this._targetType) < 0 || !this._targetId) {
      wx.showToast({ title: '举报对象无效', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 500);
    }
    this.updatePlaceholderSlots();
  },

  onReasonTap: function (event) {
    this.setData({ reason: event.currentTarget.dataset.reason || '' });
  },

  onDescriptionInput: function (event) {
    this.setData({ description: event.detail.value || '' });
  },

  onChooseImages: function () {
    var remaining = 3 - this.data.images.length;
    if (remaining <= 0 || this.data.submitting) return;
    var self = this;
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (result) {
        var selected = (result.tempFiles || []).map(function (file, index) {
          return {
            path: file.tempFilePath,
            filePath: file.tempFilePath,
            size: Number(file.size) || 0,
            type: file.fileType || '',
            key: Date.now() + '_' + index
          };
        });
        self.setData({ images: self.data.images.concat(selected).slice(0, 3) });
        self.updatePlaceholderSlots();
      }
    });
  },

  onDeleteImage: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    var images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images: images });
    this.updatePlaceholderSlots();
  },

  onPreviewImage: function (event) {
    var index = Number(event.currentTarget.dataset.index) || 0;
    var urls = this.data.images.map(function (item) { return item.path; });
    wx.previewImage({ urls: urls, current: urls[index] || urls[0] });
  },

  updatePlaceholderSlots: function () {
    var selectedCount = this.data.images.length;
    var visibleCount = selectedCount + (selectedCount < 3 ? 1 : 0);
    var placeholders = [];
    for (var i = visibleCount; i < 3; i++) placeholders.push(i);
    this.setData({ placeholderSlots: placeholders });
  },

  onSubmit: async function () {
    if (!this.data.reason || this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: this.data.images.length ? '上传并提交中...' : '提交中...', mask: true });
    try {
      var upload = { sessionId: '', media: [] };
      if (this.data.images.length > 0) {
        upload = await tripMediaUpload.uploadFiles({
          files: this.data.images,
          tripId: '',
          purpose: 'report'
        });
      }
      await api.reportCreate({
        targetType: this._targetType,
        targetId: this._targetId,
        reason: this.data.reason,
        description: this.data.description.trim(),
        sessionId: upload.sessionId,
        images: upload.media
      });
      wx.hideLoading();
      wx.showToast({ title: '举报已提交', icon: 'success' });
      setTimeout(function () { wx.navigateBack(); }, 700);
    } catch (error) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: error.message || '提交失败，请重试', icon: 'none' });
    }
  }
});
