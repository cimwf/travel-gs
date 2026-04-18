// pages/settings/settings.js
const app = getApp();

Page({
  data: {
    settings: {
      newMessage: true,
      tripChange: true,
      applyMessage: true,
      tripVisibility: 'all',
      messagePermission: 'all'
    },
    visibilityOptions: {
      'all': '所有人',
      'friends': '仅好友',
      'none': '不允许'
    },
    cacheSize: '12.5 MB',
    version: '1.0.0'
  },

  onLoad: function () {
    this.loadSettings();
    this.calculateCacheSize();
  },

  // 加载设置
  loadSettings: function () {
    const settings = wx.getStorageSync('userSettings') || this.data.settings;
    this.setData({ settings });
  },

  // 保存设置
  saveSettings: function () {
    wx.setStorageSync('userSettings', this.data.settings);
  },

  // 开关切换
  onSwitchChange: function (e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    this.setData({
      [`settings.${key}`]: value
    });
    this.saveSettings();
  },

  // 隐私设置 - 谁可以看到我的行程
  goToVisibilitySetting: function () {
    wx.showActionSheet({
      itemList: ['所有人', '仅好友', '不允许'],
      success: (res) => {
        const values = ['all', 'friends', 'none'];
        this.setData({
          'settings.tripVisibility': values[res.tapIndex]
        });
        this.saveSettings();
      }
    });
  },

  // 隐私设置 - 谁可以向我发消息
  goToMessageSetting: function () {
    wx.showActionSheet({
      itemList: ['所有人', '仅好友', '不允许'],
      success: (res) => {
        const values = ['all', 'friends', 'none'];
        this.setData({
          'settings.messagePermission': values[res.tapIndex]
        });
        this.saveSettings();
      }
    });
  },

  // 计算缓存大小
  calculateCacheSize: function () {
    wx.getStorageInfo({
      success: (res) => {
        const size = (res.currentSize / 1024).toFixed(1);
        this.setData({
          cacheSize: `${size} MB`
        });
      }
    });
  },

  // 清除缓存
  clearCache: function () {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除缓存吗？',
      success: (res) => {
        if (res.confirm) {
          // 保留用户设置和登录信息
          const settings = wx.getStorageSync('userSettings');
          const userInfo = wx.getStorageSync('userInfo');
          const isLoggedIn = wx.getStorageSync('isLoggedIn');

          wx.clearStorageSync();

          // 恢复保留的数据
          if (settings) wx.setStorageSync('userSettings', settings);
          if (userInfo) wx.setStorageSync('userInfo', userInfo);
          if (isLoggedIn) wx.setStorageSync('isLoggedIn', isLoggedIn);

          this.setData({ cacheSize: '0 MB' });
          wx.showToast({
            title: '清除成功',
            icon: 'success'
          });
        }
      }
    });
  },

  // 用户协议
  goToUserAgreement: function () {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=user'
    });
  },

  // 隐私政策
  goToPrivacyPolicy: function () {
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=privacy'
    });
  },

  // 关于我们
  goToAbout: function () {
    wx.showModal({
      title: '关于我们',
      content: '北上周边行\n版本：v' + this.data.version + '\n\n发现北京周边好去处，找旅行伙伴，一起出发！',
      showCancel: false
    });
  },

  // 退出登录
  handleLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmText: '退出',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          // 清除登录状态
          wx.removeStorageSync('isLoggedIn');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('collections');

          // 更新全局状态
          app.globalData.isLoggedIn = false;
          app.globalData.userInfo = null;

          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          });

          // 返回上一页或跳转到首页
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/index/index'
            });
          }, 1500);
        }
      }
    });
  }
});
