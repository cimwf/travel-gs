// pages/auth-password/auth-password.js
const app = getApp();
const auth = require('../../utils/auth.js');
const api = require('../../utils/api.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    username: '',
    password: '',
    showPassword: false,
    loading: false,
    canLogin: false,
    statusBarHeight: 0
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });

    this.trackPageVisit();
    this.checkLoginStatus();
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

  onUsernameInput(e) {
    const username = e.detail.value;
    this.setData({ username });
    this.checkCanLogin();
  },

  onPasswordInput(e) {
    const password = e.detail.value;
    this.setData({ password });
    this.checkCanLogin();
  },

  onTogglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  checkCanLogin() {
    const { username, password } = this.data;
    const canLogin = username.trim().length >= 11 && password.length >= 8;
    this.setData({ canLogin });
  },

  async onLogin() {
    const { username, password, canLogin, loading } = this.data;

    if (!canLogin || loading) return;

    if (username.trim().length < 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    if (password.length < 8) {
      wx.showToast({ title: '密码至少8位', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'user/loginPassword',
          data: {
            username: username.trim(),
            password
          }
        }
      });

      if (res.result && res.result.success) {
        const { user } = res.result;
        await this.handleLoginSuccess(user);
      } else {
        const errorMsg = res.result?.error || '账号或密码错误';
        const remainAttempts = res.result?.data?.remainAttempts;

        if (remainAttempts !== undefined) {
          wx.showToast({ title: `${errorMsg}，剩余${remainAttempts}次机会`, icon: 'none', duration: 2000 });
        } else {
          wx.showToast({ title: errorMsg, icon: 'none' });
        }
      }
    } catch (err) {
      console.error('登录失败:', err);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
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
  },

  onForgetPassword() {
    wx.showToast({ title: '请联系管理员重置密码', icon: 'none' });
  },

  onOpenAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/agreement/agreement?type=${type}`
    });
  },

  onBack() {
    const deepLink = wx.getStorageSync('deepLinkUrl');
    if (deepLink) {
      nav.goHome();
      return;
    }
    nav.goBack();
  }
});
