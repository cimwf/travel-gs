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
    nickName: '',
    avatarUrl: ''
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });

    this.trackPageVisit();
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

  async trackPageVisit() {
    await api.trackEvent('loginPageVisit');
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
        step: 'profile',
        loading: false
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

    this.setData({ loading: true });

    try {
      const apiRes = await wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'user/loginByPhone',
          data: { phone, nickname: nickName, avatar: avatarUrl }
        }
      });

      if (apiRes.result.success) {
        await this.handleLoginSuccess(apiRes.result.user);
      } else {
        throw new Error(apiRes.result.error || '登录失败');
      }
    } catch (err) {
      console.error('手机号登录失败:', err);
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
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
