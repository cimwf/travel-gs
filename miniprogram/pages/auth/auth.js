// pages/auth/auth.js
const app = getApp();
const auth = require('../../utils/auth.js');
const api = require('../../utils/api.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    loading: false,
    agreed: false,
    statusBarHeight: 0,
    step: 'phone',
    phone: '',
    openid: '',
    pendingUser: null,
    nickName: '',
    avatarUrl: ''
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });

    this.checkLoginStatus();
  },

  onBack() {
    if (this.data.step === 'profile') {
      this.setData({ step: 'phone' });
      return;
    }
    const deepLink = wx.getStorageSync('deepLinkUrl');
    if (deepLink) {
      nav.goHome();
      return;
    }
    nav.goBack();
  },

  checkLoginStatus() {
    if (!auth.checkNeedLogin()) {
      wx.removeStorageSync('deepLinkUrl');
      nav.goHome();
    }
  },

  onAgreeChange() {
    this.setData({ agreed: !this.data.agreed });
  },

  onOpenAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/agreement/agreement?type=${type}`
    });
  },

  // 第一步：获取手机号
  async onGetPhoneNumber(e) {
    const { code } = e.detail;

    if (!code) {
      wx.showToast({ title: '未获取到授权码', icon: 'none' });
      return;
    }

    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const loginRes = await wx.cloud.callFunction({
        name: 'login',
        data: { action: 'getPhoneNumber', code }
      });

      if (!loginRes.result.success) {
        throw new Error(loginRes.result.error || '获取手机号失败');
      }

      this.setData({
        phone: loginRes.result.phoneNumber,
        openid: loginRes.result.openid || '',
        loading: false
      });

      await this.loginByPhone({
        phone: loginRes.result.phoneNumber,
        nickname: '',
        avatar: ''
      });
    } catch (err) {
      console.error('获取手机号失败:', err);
      wx.showToast({ title: err.message || '获取手机号失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 第二步：选择头像
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    this.setData({ avatarUrl });
  },

  // 第二步：输入昵称
  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onNicknameBlur(e) {
    this.setData({ nickName: e.detail.value });
  },

  // 第二步：完成登录
  async onCompleteLogin() {
    const { phone, nickName, avatarUrl } = this.data;
    const nickname = (nickName || '').trim();

    if (!avatarUrl) {
      wx.showToast({ title: '请先设置头像', icon: 'none' });
      return;
    }

    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const avatar = await this.uploadAvatarIfNeeded(avatarUrl);
      await this.loginByPhone({ phone, nickname, avatar }, { forceComplete: true });
    } catch (err) {
      console.error('手机号登录失败:', err);
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onSkipProfile() {
    const { pendingUser, phone } = this.data;

    if (pendingUser) {
      await this.handleLoginSuccess(pendingUser);
      return;
    }

    this.setData({ loading: true });
    try {
      await this.loginByPhone({ phone, nickname: '', avatar: '' }, { forceComplete: true });
    } catch (err) {
      console.error('跳过资料失败:', err);
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loginByPhone(data, options = {}) {
    const apiRes = await wx.cloud.callFunction({
      name: 'api',
      data: {
        action: 'user/loginByPhone',
        data
      }
    });

    if (!apiRes.result.success) {
      throw new Error(apiRes.result.error || '登录失败');
    }

    if (apiRes.result.isNew && !options.forceComplete) {
      this.setData({
        pendingUser: apiRes.result.user,
        step: 'profile',
        loading: false
      });
      return apiRes.result.user;
    }

    await this.handleLoginSuccess(apiRes.result.user);
    return apiRes.result.user;
  },

  isLocalAvatarPath(path) {
    return path && (
      path.startsWith('wxfile://') ||
      path.startsWith('http://tmp') ||
      path.startsWith('https://tmp') ||
      path.startsWith('tmp/')
    );
  },

  getAvatarSuffix(path) {
    const cleanPath = (path || '').split('?')[0];
    const match = cleanPath.match(/\.([a-zA-Z0-9]+)$/);
    const suffix = match ? match[1].toLowerCase() : 'jpg';
    return ['jpg', 'jpeg', 'png', 'webp'].includes(suffix) ? suffix : 'jpg';
  },

  async uploadAvatarIfNeeded(avatarUrl) {
    if (!avatarUrl || !this.isLocalAvatarPath(avatarUrl)) {
      return avatarUrl || '';
    }

    if (!wx.cloud || !wx.cloud.uploadFile) {
      return '';
    }

    const openid = this.data.openid || app.globalData.openid || wx.getStorageSync('openid') || 'anonymous';
    const suffix = this.getAvatarSuffix(avatarUrl);
    const cloudPath = `avatars/${openid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${suffix}`;

    try {
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: avatarUrl
      });
      return uploadRes.fileID || '';
    } catch (err) {
      console.warn('头像上传失败，将不保存临时头像', err);
      return '';
    }
  },

  async handleLoginSuccess(user) {
    await api.trackEvent('loginSuccess');

    const userInfo = user;
    auth.handleLoginSuccess(userInfo);
    app.globalData.openid = userInfo.openid;
    app.globalData.userInfo = userInfo;
    app.globalData.userId = userInfo._id;
    wx.setStorageSync('openid', userInfo.openid);
    wx.setStorageSync('userId', userInfo._id);

    wx.showToast({ title: '登录成功', icon: 'success' });

    setTimeout(() => {
      wx.removeStorageSync('deepLinkUrl');
      nav.goHome();
    }, 1000);
  }
});
