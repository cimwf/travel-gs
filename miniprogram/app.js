// app.js
const auth = require('./utils/auth.js');

App({
  globalData: {
    userInfo: null,
    openid: null,
    isLoggedIn: false,
    cloudEnv: 'cloud1-1gxcobd051830cce'
  },

  onLaunch: function () {
    // 初始化云开发
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: this.globalData.cloudEnv,
          traceUser: true
        });
        console.log('云开发初始化成功');
      } catch (err) {
        console.warn('云开发初始化失败', err);
      }
    }

    // 检查并恢复登录状态
    this.checkLoginStatus();
    
    // 获取openid
    this.getOpenid();
  },

  // 检查登录状态 - 从本地存储恢复
  checkLoginStatus: function () {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    const lastLoginTime = wx.getStorageSync('lastLoginTime') || 0;
    const now = Date.now();
    
    // 检查是否需要登录（15天机制）
    if (userInfo && openid && (now - lastLoginTime <= auth.LOGIN_EXPIRY)) {
      // 已登录且在有效期内，恢复用户信息
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      this.globalData.isLoggedIn = true;
      console.log('登录状态已恢复');
    } else {
      // 登录已过期或未登录，清除缓存
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('openid');
      wx.removeStorageSync('lastLoginTime');
      console.log('需要重新登录');
    }
  },

  // 获取openid
  getOpenid: function () {
    return new Promise((resolve, reject) => {
      // 如果已有openid，直接返回
      if (this.globalData.openid) {
        resolve(this.globalData.openid);
        return;
      }

      // 调用云函数获取openid
      wx.cloud.callFunction({
        name: 'login',
        success: res => {
          const openid = res.result.openid;
          this.globalData.openid = openid;
          wx.setStorageSync('openid', openid);
          resolve(openid);
        },
        fail: err => {
          console.warn('获取openid失败', err);
          reject(err);
        }
      });
    });
  },

  // 检查是否需要登录
  requireLogin: function () {
    return new Promise((resolve, reject) => {
      if (this.globalData.isLoggedIn) {
        resolve(this.globalData.userInfo);
      } else {
        reject(new Error('请先登录'));
      }
    });
  }
});