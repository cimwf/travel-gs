// pages/edit-profile/edit-profile.js
const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    saving: false,
    showRegionModal: false,
    originalUserInfo: {},
    userInfo: {
      _id: '',
      avatar: '',
      avatarFileID: '',
      nickname: '',
      gender: '',
      age: '',
      region: '',
      contactPhone: '',
      bio: ''
    },
    districts: [
      '海淀区', '朝阳区', '丰台区', '东城区',
      '西城区', '石景山区', '门头沟区', '房山区',
      '通州区', '顺义区', '昌平区', '大兴区',
      '怀柔区', '平谷区', '密云区', '延庆区'
    ]
  },

  onLoad: async function () {
    this.openerEventChannel = typeof this.getOpenerEventChannel === 'function'
      ? this.getOpenerEventChannel()
      : null;
    const existing = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    this.setData({
      originalUserInfo: existing,
      userInfo: {
        _id: existing._id || wx.getStorageSync('userId') || '',
        avatar: existing.avatar || existing.avatarUrl || '',
        avatarFileID: existing.avatarFileID || '',
        nickname: existing.nickname || existing.nickName || '',
        gender: existing.gender || '',
        age: existing.age === undefined || existing.age === null ? '' : String(existing.age),
        region: existing.region || '',
        contactPhone: existing.contactPhone || '',
        bio: existing.bio || ''
      }
    });
    await this.convertAvatarUrl();
  },

  convertAvatarUrl: async function () {
    const avatar = this.data.userInfo.avatar;
    if (!avatar || !avatar.startsWith('cloud://') || !wx.cloud) return;
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [avatar] });
      const displayUrl = res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
      if (displayUrl) {
        this.setData({
          'userInfo.avatar': displayUrl,
          'userInfo.avatarFileID': avatar
        });
      }
    } catch (err) {
      console.warn('获取头像临时链接失败', err);
    }
  },

  isLocalAvatarPath: function (path) {
    return path && (
      path.startsWith('wxfile://') ||
      path.startsWith('http://tmp') ||
      path.startsWith('https://tmp') ||
      path.startsWith('tmp/')
    );
  },

  getImageSuffix: function (path) {
    const cleanPath = (path || '').split('?')[0];
    const match = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
    const suffix = match ? match[1].toLowerCase() : 'jpg';
    return ['jpg', 'jpeg', 'png', 'webp'].includes(suffix) ? suffix : 'jpg';
  },

  getCloudPathName: function (value) {
    return String(value || 'anonymous')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 64) || 'anonymous';
  },

  uploadAvatar: async function (tempFilePath) {
    if (!wx.cloud || !wx.cloud.uploadFile) return null;
    const openid = this.getCloudPathName(
      app.globalData.openid || wx.getStorageSync('openid') || this.data.userInfo._id
    );
    const cloudPath = `avatars/${openid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${this.getImageSuffix(tempFilePath)}`;
    const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
    if (!uploadRes.fileID) return null;

    let displayUrl = uploadRes.fileID;
    if (wx.cloud.getTempFileURL) {
      try {
        const res = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
        displayUrl = (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) || displayUrl;
      } catch (err) {
        console.warn('获取头像展示链接失败', err);
      }
    }
    return { fileID: uploadRes.fileID, displayUrl };
  },

  onChooseAvatar: function (event) {
    const avatarUrl = event.detail && event.detail.avatarUrl;
    return this.selectAndUploadAvatar(avatarUrl);
  },

  selectAndUploadAvatar: async function (avatarUrl) {
    if (!avatarUrl) return;
    this.setData({ 'userInfo.avatar': avatarUrl });
    if (!this.isLocalAvatarPath(avatarUrl)) {
      this.setData({ 'userInfo.avatarFileID': '' });
      return;
    }

    wx.showLoading({ title: '上传中...' });
    try {
      const uploaded = await this.uploadAvatar(avatarUrl);
      if (!uploaded) throw new Error('头像上传失败');
      this.setData({
        'userInfo.avatar': uploaded.displayUrl,
        'userInfo.avatarFileID': uploaded.fileID
      });
    } catch (err) {
      console.warn('头像上传失败', err);
      wx.showToast({ title: '头像上传失败', icon: 'none' });
      this.setData({
        'userInfo.avatar': this.data.originalUserInfo.avatar || '',
        'userInfo.avatarFileID': this.data.originalUserInfo.avatarFileID || ''
      });
    } finally {
      wx.hideLoading();
    }
  },

  onNicknameInput: function (event) {
    this.setData({ 'userInfo.nickname': event.detail.value });
  },

  onGenderChange: function (event) {
    this.setData({ 'userInfo.gender': event.currentTarget.dataset.value });
  },

  onAgeInput: function (event) {
    const value = String(event.detail.value || '').replace(/\D/g, '').slice(0, 3);
    this.setData({ 'userInfo.age': value });
  },

  onAgeBlur: function () {
    const raw = this.data.userInfo.age;
    if (raw === '') return;
    const age = Math.min(120, Math.max(1, Number(raw) || 1));
    this.setData({ 'userInfo.age': String(age) });
  },

  onPhoneInput: function (event) {
    const value = String(event.detail.value || '').replace(/\D/g, '').slice(0, 11);
    this.setData({ 'userInfo.contactPhone': value });
  },

  onBioInput: function (event) {
    this.setData({ 'userInfo.bio': event.detail.value });
  },

  onOpenRegionModal: function () {
    this.setData({ showRegionModal: true });
  },

  onCloseRegionModal: function () {
    this.setData({ showRegionModal: false });
  },

  onSelectDistrict: function (event) {
    const region = event.currentTarget.dataset.district;
    this.setData({
      'userInfo.region': region,
      showRegionModal: false
    });
  },

  preventBubble: function () {},

  validateForm: function () {
    const info = this.data.userInfo;
    if (!String(info.nickname || '').trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return false;
    }
    if (info.contactPhone && !/^1\d{10}$/.test(info.contactPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return false;
    }
    return true;
  },

  onSave: async function () {
    if (this.data.saving || !this.validateForm()) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...', mask: true });

    const info = this.data.userInfo;
    const avatarForDb = info.avatarFileID || info.avatar;
    const payload = {
      _id: info._id || undefined,
      nickname: String(info.nickname || '').trim(),
      avatar: avatarForDb,
      gender: info.gender,
      age: info.age,
      region: info.region,
      contactPhone: info.contactPhone,
      bio: String(info.bio || '').trim()
    };

    try {
      await api.userUpdate(payload);
      const localUserInfo = {
        ...this.data.originalUserInfo,
        ...payload,
        avatar: info.avatar,
        avatarFileID: info.avatarFileID,
        updatedAt: Date.now()
      };
      delete localUserInfo._id;
      if (info._id) localUserInfo._id = info._id;
      wx.setStorageSync('userInfo', localUserInfo);
      app.globalData.userInfo = localUserInfo;
      const profileUpdate = {
        nickname: localUserInfo.nickname || '',
        avatar: localUserInfo.avatar || '',
        bio: localUserInfo.bio || '',
        region: localUserInfo.region || ''
      };
      app.globalData._profileUpdated = profileUpdate;
      if (this.openerEventChannel && typeof this.openerEventChannel.emit === 'function') {
        this.openerEventChannel.emit('profileUpdated', profileUpdate);
      }
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(function () { wx.navigateBack(); }, 500);
    } catch (err) {
      wx.hideLoading();
      console.error('保存用户资料失败', err);
      wx.showToast({ title: err.message || '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});
