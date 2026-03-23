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

  // 获取手机号
  async onGetPhoneNumber(e) {
    console.log('getPhoneNumber event:', e.detail);
    
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      this.setData({ loading: true });
      
      try {
        // 获取用户手机号 - 需要 code 参数
        const code = e.detail.code;
        
        if (!code) {
          wx.showToast({ title: '获取授权码失败', icon: 'none' });
          this.setData({ loading: false });
          return;
        }
        
        // 调用云函数获取 openid 并解密手机号
        const loginRes = await wx.cloud.callFunction({
          name: 'login',
          data: {
            action: 'getPhoneNumber',
            code: code
          }
        });

        console.log('login result:', loginRes);

        if (loginRes.result.success) {
          const { phoneNumber, openid } = loginRes.result;
          
          // 检查手机号是否已注册
          const checkRes = await wx.cloud.callFunction({
            name: 'api',
            data: {
              action: 'user/check',
              data: { phone: phoneNumber }
            }
          });

          if (checkRes.result.exists) {
            // 已注册，直接登录
            const user = checkRes.result.user;
            
            // 使用 auth 模块处理登录成功
            auth.handleLoginSuccess(user);
            
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
          } else {
            // 新用户，跳转到完善信息页
            wx.setStorageSync('tempPhone', phoneNumber);
            wx.setStorageSync('tempOpenid', openid);
            
            wx.navigateTo({
              url: '/pages/complete-info/complete-info'
            });
          }
        } else {
          throw new Error(loginRes.result.error || '登录失败');
        }
      } catch (err) {
        console.error('登录失败:', err);
        wx.showToast({ title: err.message || '登录失败', icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    } else {
      // 用户拒绝授权
      console.log('用户拒绝授权手机号', e.detail.errMsg);
    }
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