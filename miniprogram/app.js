// app.js
App({
  globalData: {
    userInfo: null,
    openid: null,
    isLoggedIn: false
  },

  onLaunch: function () {
    // 初始化云开发（如果可用）
    if (wx.cloud) {
      try {
        wx.cloud.init({
          // env 参数说明：
          //   env: 'cloud1-xxx'  云开发环境ID，开通云开发后可在控制台查看
          // 开通云开发后，请将 env 替换为你的环境ID
          traceUser: true,
        });
        console.log('云开发初始化成功');
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

  // 微信登录
  wxLogin: function () {
    return new Promise((resolve, reject) => {
      // 开发模式：模拟登录成功
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

  // 保存用户信息到数据库
  saveUserInfo: function (userInfo, openid) {
    // 开发模式：暂不保存
    console.log('保存用户信息', userInfo, openid);
  }
});
