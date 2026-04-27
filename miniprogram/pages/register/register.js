// pages/register/register.js
const app = getApp();
const auth = require('../../utils/auth.js');
const api = require('../../utils/api.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    phone: '',
    password: '',
    confirmPassword: '',
    showPassword: false,
    showConfirmPassword: false,
    agreed: false,
    loading: false,
    canRegister: false,
    strengthLevel: 0,
    strengthText: '未设置',
    strengthColors: ['weak', 'medium', 'strong'],
    statusBarHeight: 0
  },

  onLoad() {
    // 获取状态栏高度
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });

    // 记录访问注册页
    this.trackPageVisit();
  },

  // 记录访问注册页
  async trackPageVisit() {
    await api.trackEvent('registerPageVisit');
  },

  // 手机号输入
  onPhoneInput(e) {
    const phone = e.detail.value;
    this.setData({ phone });
    this.checkCanRegister();
  },

  // 密码输入
  onPasswordInput(e) {
    const password = e.detail.value;
    this.setData({ password });
    this.checkPasswordStrength(password);
    this.checkCanRegister();
  },

  // 确认密码输入
  onConfirmPasswordInput(e) {
    const confirmPassword = e.detail.value;
    this.setData({ confirmPassword });
    this.checkCanRegister();
  },

  // 切换密码显示
  onTogglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  // 切换确认密码显示
  onToggleConfirmPassword() {
    this.setData({ showConfirmPassword: !this.data.showConfirmPassword });
  },

  // 切换协议同意
  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
    this.checkCanRegister();
  },

  // 检查密码强度
  checkPasswordStrength(password) {
    let level = 0;
    let text = '弱';

    if (password.length >= 8) {
      level++;
    }
    if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) {
      level++;
    }
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      level++;
    }

    if (level === 0 || level === 1) {
      text = '弱';
    } else if (level === 2) {
      text = '中等';
    } else {
      text = '强';
    }

    this.setData({ strengthLevel: level, strengthText: text });
  },

  // 检查是否可以注册
  checkCanRegister() {
    const { phone, password, confirmPassword, agreed } = this.data;
    const canRegister =
      phone.length === 11 &&
      password.length >= 8 &&
      confirmPassword.length >= 8 &&
      agreed;
    this.setData({ canRegister });
  },

  // 注册
  async onRegister() {
    const { phone, password, confirmPassword, canRegister, loading } = this.data;

    if (!canRegister || loading) return;

    // 验证手机号
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    // 验证密码格式
    if (!/^(?=.*[a-zA-Z])(?=.*\d).{8,20}$/.test(password)) {
      wx.showToast({ title: '密码需8-20位，含字母和数字', icon: 'none' });
      return;
    }

    // 确认密码
    if (password !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      // 调用云函数注册
      const res = await wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'user/register',
          data: { phone, password }
        }
      });

      if (res.result && res.result.success) {
        const { user } = res.result;
        await this.handleRegisterSuccess(user);
      } else {
        wx.showToast({ title: res.result?.error || '注册失败', icon: 'none' });
      }
    } catch (err) {
      console.error('注册失败:', err);
      wx.showToast({ title: '注册失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 处理注册成功
  async handleRegisterSuccess(user) {
    // 记录注册成功
    await api.trackEvent('registerSuccess');

    auth.handleLoginSuccess(user);
    app.globalData.openid = user.openid;
    wx.setStorageSync('openid', user.openid);

    wx.showToast({ title: '注册成功', icon: 'success' });

    setTimeout(() => {
      const deepLink = auth.getDeepLink();
      if (deepLink) {
        wx.redirectTo({ url: deepLink });
      } else {
        nav.goHome();
      }
    }, 1000);
  },

  // 去登录
  onGoLogin() {
    wx.navigateTo({ url: '/pages/auth/auth' });
  },

  // 返回
  onBack() {
    nav.goBack();
  },

  // 打开协议
  onOpenAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/agreement/agreement?type=${type}`
    });
  }
});
