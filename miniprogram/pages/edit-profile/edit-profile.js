// pages/edit-profile/edit-profile.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    userInfo: {
      avatar: '',
      nickname: '',
      gender: '',
      hasCar: false,
      bio: ''
    },
    defaultAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    saving: false,
    isFirstLogin: false
  },

  onLoad: function (options) {
    // 检查是否是首次登录
    const tempPhone = wx.getStorageSync('tempPhone');
    const tempOpenid = wx.getStorageSync('tempOpenid');

    if (tempPhone && tempOpenid) {
      this.setData({
        isFirstLogin: true,
        'userInfo.phone': tempPhone,
        'userInfo.openid': tempOpenid
      });
    }

    // 加载已有用户信息
    const existingUserInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (existingUserInfo) {
      this.setData({
        userInfo: {
          ...this.data.userInfo,
          ...existingUserInfo
        }
      });
    }
  },

  // 选择头像
  onChooseAvatar: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          'userInfo.avatar': tempFilePath
        });
      }
    });
  },

  // 昵称输入
  onNicknameInput: function (e) {
    this.setData({
      'userInfo.nickname': e.detail.value
    });
  },

  // 性别选择
  onGenderChange: function (e) {
    const value = e.currentTarget.dataset.value;
    this.setData({
      'userInfo.gender': value
    });
  },

  // 是否有车选择
  onCarChange: function (e) {
    const value = e.currentTarget.dataset.value === 'true';
    this.setData({
      'userInfo.hasCar': value
    });
  },

  // 简介输入
  onBioInput: function (e) {
    this.setData({
      'userInfo.bio': e.detail.value
    });
  },

  // 保存
  onSave: async function () {
    const { userInfo } = this.data;

    // 验证必填项
    if (!userInfo.nickname || userInfo.nickname.length < 2) {
      wx.showToast({ title: '请输入2-12个字符的昵称', icon: 'none' });
      return;
    }

    if (!userInfo.gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' });
      return;
    }

    if (userInfo.hasCar === undefined || userInfo.hasCar === null) {
      wx.showToast({ title: '请选择是否有车', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    try {
      // 构建用户数据
      const userData = {
        ...userInfo,
        updatedAt: new Date().toISOString()
      };

      // 保存到本地存储
      wx.setStorageSync('userInfo', userData);

      // 更新全局数据
      app.globalData.userInfo = userData;
      app.globalData.isLoggedIn = true;

      // 清除临时数据
      wx.removeStorageSync('tempPhone');
      wx.removeStorageSync('tempOpenid');

      // 使用 auth 模块处理登录成功
      auth.handleLoginSuccess(userData);

      wx.showToast({ title: '保存成功', icon: 'success' });

      setTimeout(() => {
        // 返回首页
        wx.switchTab({
          url: '/pages/index/index'
        });
      }, 1000);

    } catch (err) {
      console.error('保存用户信息失败', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // 返回
  onBack: function () {
    if (this.data.isFirstLogin) {
      // 首次登录，直接返回首页
      wx.switchTab({
        url: '/pages/index/index'
      });
    } else {
      wx.navigateBack();
    }
  }
});
