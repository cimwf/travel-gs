// pages/edit-profile/edit-profile.js
const app = getApp();
const api = require('../../utils/api.js');
const userAvatarUpload = require('../../utils/user-avatar-upload.js');

Page({
  data: {
    saving: false,
    showRegionModal: false,
    originalUserInfo: {},
    userInfo: {
      _id: '',
      avatar: '',
      avatarFileID: '',
      avatarUploadSessionId: '',
      avatarMedia: null,
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
    this.applyUserInfo(existing);
    await this.convertAvatarUrl();

    const userId = existing.openid || app.globalData.openid || existing._id || wx.getStorageSync('userId');
    if (!userId) return;
    try {
      const result = await api.userGet(userId);
      if (result.user) {
        const latest = { ...existing, ...result.user };
        this.applyUserInfo(latest);
        await this.convertAvatarUrl();
      }
    } catch (err) {
      console.warn('获取最新用户资料失败，继续使用本地资料', err);
    }
  },

  normalizeGender: function (value) {
    if (value === 1 || value === '1') return 'male';
    if (value === 2 || value === '2') return 'female';
    if (value === 'male' || value === 'female') return value;
    return 'secret';
  },

  applyUserInfo: function (existing) {
    existing = existing || {};
    const avatar = existing.avatar || existing.avatarUrl || '';
    this.setData({
      originalUserInfo: existing,
      userInfo: {
        _id: existing._id || wx.getStorageSync('userId') || '',
        avatar,
        avatarFileID: existing.avatarFileID || (avatar.startsWith('cloud://') ? avatar : ''),
        avatarUploadSessionId: '',
        avatarMedia: null,
        nickname: existing.nickname || existing.nickName || '',
        gender: this.normalizeGender(existing.gender),
        age: existing.age === undefined || existing.age === null ? '' : String(existing.age),
        region: existing.region || '',
        contactPhone: existing.contactPhone || '',
        bio: existing.bio || ''
      }
    });
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

  uploadAvatar: async function (tempFilePath) {
    return userAvatarUpload.uploadAvatar(tempFilePath);
  },

  onChooseAvatar: function (event) {
    const avatarUrl = event.detail && event.detail.avatarUrl;
    return this.selectAndUploadAvatar(avatarUrl);
  },

  selectAndUploadAvatar: async function (avatarUrl) {
    if (!avatarUrl) return;
    this.setData({ 'userInfo.avatar': avatarUrl });
    if (!this.isLocalAvatarPath(avatarUrl)) {
      this.setData({
        'userInfo.avatarFileID': '',
        'userInfo.avatarUploadSessionId': '',
        'userInfo.avatarMedia': null
      });
      return;
    }

    wx.showLoading({ title: '上传中...' });
    try {
      const uploaded = await this.uploadAvatar(avatarUrl);
      if (!uploaded) throw new Error('头像上传失败');
      this.setData({
        'userInfo.avatar': uploaded.url,
        'userInfo.avatarFileID': '',
        'userInfo.avatarUploadSessionId': uploaded.sessionId,
        'userInfo.avatarMedia': uploaded.media
      });
    } catch (err) {
      console.warn('头像上传失败', err);
      wx.showToast({ title: '头像上传失败', icon: 'none' });
      this.setData({
        'userInfo.avatar': this.data.originalUserInfo.avatar || '',
        'userInfo.avatarFileID': this.data.originalUserInfo.avatarFileID || '',
        'userInfo.avatarUploadSessionId': '',
        'userInfo.avatarMedia': null
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
      avatarUploadSessionId: info.avatarUploadSessionId,
      avatarMedia: info.avatarMedia,
      gender: info.gender,
      age: info.age,
      region: info.region,
      contactPhone: info.contactPhone,
      bio: String(info.bio || '').trim()
    };

    try {
      const result = await api.userUpdate(payload);
      const savedUser = result.user || payload;
      const persistedAvatar = savedUser.avatar || avatarForDb || '';
      const localUserInfo = {
        ...this.data.originalUserInfo,
        ...savedUser,
        avatar: persistedAvatar,
        avatarObject: savedUser.avatarObject || info.avatarMedia || this.data.originalUserInfo.avatarObject || null,
        avatarFileID: persistedAvatar.startsWith('cloud://') ? persistedAvatar : '',
        updatedAt: savedUser.updatedAt || Date.now()
      };
      wx.setStorageSync('userInfo', localUserInfo);
      app.globalData.userInfo = localUserInfo;
      const profileUpdate = {
        nickname: localUserInfo.nickname || '',
        avatar: info.avatar || localUserInfo.avatar || '',
        bio: localUserInfo.bio || '',
        region: localUserInfo.region || '',
        age: localUserInfo.age === undefined || localUserInfo.age === null ? '' : localUserInfo.age
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
