// app.js
App({
  globalData: {
    userInfo: null,
    openid: null,
    isLoggedIn: false,
    cloudEnv: 'cloud1-1gxcobd051830cce'  // 云开发环境ID
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
        
        // 自动登录
        this.cloudLogin();
      } catch (err) {
        console.warn('云开发初始化失败，使用模拟数据模式', err);
      }
    } else {
      console.warn('请使用 2.2.3 或以上的基础库以使用云能力');
    }

    // 检查登录状态
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus: function () {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    
    if (userInfo && openid) {
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      this.globalData.isLoggedIn = true;
    }
  },

  // 云开发登录
  cloudLogin: function () {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        success: res => {
          const openid = res.result.openid;
          this.globalData.openid = openid;
          wx.setStorageSync('openid', openid);
          
          // 获取或创建用户信息
          this.getUserInfo(openid).then(userInfo => {
            resolve(userInfo);
          }).catch(err => {
            console.warn('获取用户信息失败', err);
            resolve({ openid });
          });
        },
        fail: err => {
          console.warn('云登录失败，使用模拟模式', err);
          this.mockLogin().then(resolve);
        }
      });
    });
  },

  // 获取用户信息
  getUserInfo: function (openid) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'user/get',
          data: { userId: openid }
        },
        success: res => {
          if (res.result.success && res.result.user) {
            const user = res.result.user;
            this.globalData.userInfo = user;
            this.globalData.isLoggedIn = true;
            wx.setStorageSync('userInfo', user);
            resolve(user);
          } else {
            resolve(null);
          }
        },
        fail: reject
      });
    });
  },

  // 模拟登录（开发模式）
  mockLogin: function () {
    return new Promise((resolve) => {
      const mockUserInfo = {
        nickName: '游客用户',
        avatarUrl: 'https://picsum.photos/100/100?random=avatar',
        gender: 0
      };
      
      this.globalData.userInfo = mockUserInfo;
      this.globalData.openid = 'mock_openid_' + Date.now();
      this.globalData.isLoggedIn = true;
      
      wx.setStorageSync('userInfo', mockUserInfo);
      wx.setStorageSync('openid', this.globalData.openid);
      
      resolve(mockUserInfo);
    });
  },

  // 兼容旧版登录方法
  wxLogin: function () {
    return this.cloudLogin();
  }
});
