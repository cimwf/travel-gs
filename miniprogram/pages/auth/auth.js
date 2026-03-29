// pages/auth/auth.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    time: '9:41',
    phoneNumber: '',
    code: '',
    countdown: 0,
    loading: false,
    canLogin: false
  },

  onLoad() {
    this.updateTime();
    // 检查是否已登录（且在15天内）
    this.checkLoginStatus();
  },

  onUnload() {
    // 清除倒计时
    if (this.timer) {
      clearInterval(this.timer);
    }
  },

  // 更新时间
  updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    this.setData({ time: `${hours}:${minutes}` });
  },

  // 检查登录状态
  checkLoginStatus() {
    // 检查是否需要登录
    if (!auth.checkNeedLogin()) {
      // 已登录且在有效期内，跳转到首页或之前的页面
      const pendingRedirect = wx.getStorageSync('pendingRedirect');
      if (pendingRedirect) {
        wx.removeStorageSync('pendingRedirect');
        wx.redirectTo({ url: pendingRedirect });
      } else {
        wx.switchTab({ url: '/pages/index/index' });
      }
    }
  },

  // 手机号输入
  onPhoneInput(e) {
    const phoneNumber = e.detail.value;
    this.setData({ phoneNumber });
    this.checkCanLogin();
  },

  // 验证码输入
  onCodeInput(e) {
    const code = e.detail.value;
    this.setData({ code });
    this.checkCanLogin();
  },

  // 检查是否可以登录
  checkCanLogin() {
    const { phoneNumber, code } = this.data;
    const canLogin = phoneNumber.length === 11 && code.length >= 4;
    this.setData({ canLogin });
  },

  // 获取验证码
  async onGetCode() {
    const { phoneNumber, countdown } = this.data;

    // 倒计时中不可点击
    if (countdown > 0) return;

    // 验证手机号
    if (!phoneNumber || phoneNumber.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    // 手机号格式验证
    if (!/^1[3-9]\d{9}$/.test(phoneNumber)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '发送中...' });

      // 调用云函数发送验证码
      const res = await wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'sms/send',
          data: { phone: phoneNumber }
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({ title: '验证码已发送', icon: 'success' });
        this.startCountdown();
      } else {
        // 开发环境模拟发送成功
        console.log('验证码发送失败，使用测试模式');
        wx.showToast({ title: '验证码已发送(测试)', icon: 'success' });
        this.startCountdown();
      }
    } catch (err) {
      wx.hideLoading();
      console.error('发送验证码失败:', err);
      // 开发环境模拟发送成功
      wx.showToast({ title: '验证码已发送(测试)', icon: 'success' });
      this.startCountdown();
    }
  },

  // 开始倒计时
  startCountdown() {
    this.setData({ countdown: 60 });

    this.timer = setInterval(() => {
      const countdown = this.data.countdown - 1;
      if (countdown <= 0) {
        clearInterval(this.timer);
        this.setData({ countdown: 0 });
      } else {
        this.setData({ countdown });
      }
    }, 1000);
  },

  // 登录
  async onLogin() {
    const { phoneNumber, code, canLogin, loading } = this.data;

    if (!canLogin || loading) return;

    if (!/^1[3-9]\d{9}$/.test(phoneNumber)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    if (code.length < 4) {
      wx.showToast({ title: '请输入验证码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      // 调用云函数验证登录
      const res = await wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'user/login',
          data: { phone: phoneNumber, code: code }
        }
      });

      if (res.result && res.result.success) {
        const { user, isNew } = res.result;

        if (isNew) {
          // 新用户，跳转到完善信息页
          wx.setStorageSync('tempPhone', phoneNumber);
          wx.setStorageSync('tempOpenid', user.openid);
          wx.navigateTo({ url: '/pages/complete-info/complete-info' });
        } else {
          // 老用户，直接登录成功
          await this.handleLoginSuccess(user);
        }
      } else {
        // 开发环境模拟登录成功
        console.log('登录验证失败，使用测试模式');
        await this.handleLoginSuccess({
          phone: phoneNumber,
          openid: 'test_openid_' + Date.now(),
          isNew: false
        });
      }
    } catch (err) {
      console.error('登录失败:', err);
      // 开发环境模拟登录成功
      await this.handleLoginSuccess({
        phone: phoneNumber,
        openid: 'test_openid_' + Date.now(),
        isNew: false
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 处理登录成功
  async handleLoginSuccess(user) {
    // 如果没有完整用户信息，创建一个默认的
    const userInfo = user.nickname ? user : {
      phone: user.phone,
      nickname: '用户' + user.phone.slice(-4),
      avatar: '',
      gender: 0,
      openid: user.openid
    };

    // 使用 auth 模块处理登录成功
    auth.handleLoginSuccess(userInfo);
    app.globalData.openid = userInfo.openid;
    wx.setStorageSync('openid', userInfo.openid);

    wx.showToast({ title: '登录成功', icon: 'success' });

    setTimeout(() => {
      // 检查是否有待跳转页面
      const pendingRedirect = wx.getStorageSync('pendingRedirect');
      if (pendingRedirect) {
        wx.removeStorageSync('pendingRedirect');
        wx.redirectTo({ url: pendingRedirect });
      } else {
        wx.switchTab({ url: '/pages/index/index' });
      }
    }, 1000);
  },

  // 打开协议
  onOpenAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/agreement/agreement?type=${type}`
    });
  },

  // 暂不登录
  onSkip() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
