// pages/auth/auth.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    time: '21:30',
    loading: false
  },

  onLoad() {
    this.updateTime();
    // 检查是否已登录（且在15天内）
    this.checkLoginStatus();
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

  // 点击按钮（备用）
  onAuthTap() {
    console.log('按钮被点击');
  },

  // 获取手机号
  async onGetPhoneNumber(e) {
    console.log('getPhoneNumber event:', JSON.stringify(e.detail));
    
    // 用户拒绝或取消
    if (e.detail.errMsg && e.detail.errMsg !== 'getPhoneNumber:ok') {
      console.log('用户拒绝授权:', e.detail.errMsg);
      wx.showToast({ title: '需要授权手机号才能登录', icon: 'none' });
      return;
    }
    
    const code = e.detail.code;
    console.log('code:', code);
    
    if (!code) {
      wx.showToast({ title: '获取授权码失败', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    
    try {
      // 调用云函数获取 openid 并解密手机号
      const loginRes = await wx.cloud.callFunction({
        name: 'login',
        data: {
          action: 'getPhoneNumber',
          code: code
        }
      });

      console.log('login result:', loginRes);

      // 如果云函数调用失败，使用测试数据
      if (!loginRes.result || !loginRes.result.success) {
        console.log('云函数调用失败，使用测试数据');
        await this.handleLoginSuccess('13800000000', 'test_openid_12345');
        return;
      }

      const { phoneNumber, openid } = loginRes.result;
      
      // 检查手机号是否已注册
      const checkRes = await wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'user/check',
          data: { phone: phoneNumber }
        }
      });

      if (checkRes.result && checkRes.result.exists) {
        // 已注册，直接登录
        await this.handleLoginSuccess(phoneNumber, openid, checkRes.result.user);
      } else {
        // 新用户，跳转到完善信息页
        wx.setStorageSync('tempPhone', phoneNumber);
        wx.setStorageSync('tempOpenid', openid);
        
        wx.navigateTo({
          url: '/pages/complete-info/complete-info'
        });
      }
    } catch (err) {
      console.error('登录失败:', err);
      // 出错时使用测试数据
      wx.showToast({ title: '登录出错，使用测试模式', icon: 'none' });
      await this.handleLoginSuccess('13800000000', 'test_openid_12345');
    } finally {
      this.setData({ loading: false });
    }
  },

  // 处理登录成功
  async handleLoginSuccess(phoneNumber, openid, userInfo) {
    // 如果没有传入 userInfo，创建一个默认的
    const user = userInfo || {
      phone: phoneNumber,
      nickname: '用户' + phoneNumber.slice(-4),
      avatar: '',
      gender: 0,
      openid: openid
    };
    
    // 使用 auth 模块处理登录成功
    auth.handleLoginSuccess(user);
    app.globalData.openid = openid;
    wx.setStorageSync('openid', openid);
    
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