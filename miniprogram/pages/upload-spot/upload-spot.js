// pages/upload-spot/upload-spot.js
const api = require('../../utils/api.js');

Page({
  data: {
    placeName: '',
    location: '',
    coverImage: '',
    loading: false,
    canSubmit: false
  },

  // 地点名称输入
  onPlaceNameInput(e) {
    this.setData({ placeName: e.detail.value });
    this.checkCanSubmit();
  },

  // 所在地方输入
  onLocationInput(e) {
    this.setData({ location: e.detail.value });
    this.checkCanSubmit();
  },

  // 选择图片
  onChooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFilePaths[0];
        this.setData({ coverImage: tempPath });
        this.checkCanSubmit();
      }
    });
  },

  // 检查是否可以提交
  checkCanSubmit() {
    const { placeName, location, coverImage } = this.data;
    this.setData({
      canSubmit: placeName.trim().length > 0 && location.trim().length > 0 && coverImage.length > 0
    });
  },

  // 提交上传
  async onSubmit() {
    const { placeName, location, coverImage, canSubmit, loading } = this.data;
    if (!canSubmit || loading) return;

    this.setData({ loading: true });
    wx.showLoading({ title: '上传中...' });

    try {
      let coverFileId = '';

      // 上传图片到云存储
      if (coverImage) {
        const suffix = /\.(\w+)$/.exec(coverImage)[1];
        const cloudPath = `spots/${Date.now()}_${Math.random().toString(36).slice(2)}.${suffix}`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: coverImage
        });
        coverFileId = uploadRes.fileID;
      }

      // 调用云函数保存到数据库
      const res = await api.userSpotsCreate({
        placeName: placeName,
        location: location,
        coverImage: coverFileId
      });

      wx.hideLoading();

      if (res.success) {
        wx.showToast({ title: '上传成功', icon: 'success' });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.error || '上传失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('上传景点失败', err);
      wx.showToast({ title: '上传失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
