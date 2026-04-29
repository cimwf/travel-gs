// pages/auth/auth.js
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
    // 获取状态栏高度
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });

    // 记录访问登录页
    this.trackPageVisit();
    // 检查是否已登录（且在15天内）
    this.checkLoginStatus();
  },

  // 记录访问登录页
  async trackPageVisit() {
    await api.trackEvent('loginPageVisit');
  },

  // 检查登录状态
  checkLoginStatus() {
    if (!auth.checkNeedLogin()) {
      wx.removeStorageSync('deepLinkUrl');
      nav.goHome();
    }
  },

  // 账号输入
  onUsernameInput(e) {
    const username = e.detail.value;
    this.setData({ username });
    this.checkCanLogin();
  },

  // 密码输入
  onPasswordInput(e) {
    const password = e.detail.value;
    this.setData({ password });
    this.checkCanLogin();
  },

  // 切换密码显示
  onTogglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  // 检查是否可以登录
  checkCanLogin() {
    const { username, password } = this.data;
    const canLogin = username.trim().length >= 11 && password.length >= 8;
    this.setData({ canLogin });
  },

  // 登录
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
      // 调用云函数验证登录
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

  // 处理登录成功
  async handleLoginSuccess(user) {
    // 记录登录成功
    await api.trackEvent('loginSuccess');

    // 直接使用云函数返回的用户数据（包含最新的 nickname, avatar, gender, bio 等）
    const userInfo = user;

    // 保存完整的用户信息（包含 _id 作为唯一标识）
    auth.handleLoginSuccess(userInfo);
    app.globalData.openid = userInfo.openid;
    app.globalData.userInfo = userInfo;
    app.globalData.userId = userInfo._id;  // 保存唯一标识
    wx.setStorageSync('openid', userInfo.openid);
    wx.setStorageSync('userId', userInfo._id);  // 保存到本地

    wx.showToast({ title: '登录成功', icon: 'success' });

    setTimeout(() => {
      wx.removeStorageSync('deepLinkUrl');
      nav.goHome();
    }, 1000);
  },

  // 忘记密码
  onForgetPassword() {
    wx.showToast({ title: '请联系管理员重置密码', icon: 'none' });
  },

  // 去注册
  onGoRegister() {
    wx.navigateTo({ url: '/pages/register/register' });
  },

  // 打开协议
  onOpenAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/agreement/agreement?type=${type}`
    });
  },

  // 返回
  onBack() {
    // 如果存在 deepLink，说明是从分享卡片等场景跳转过来的，
    // 上一个页面还未加载数据，返回会导致白屏，直接回首页
    const deepLink = wx.getStorageSync('deepLinkUrl');
    if (deepLink) {
      nav.goHome();
      return;
    }
    nav.goBack();
  }
});
