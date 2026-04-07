// pages/edit-profile/edit-profile.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    statusBarHeight: 0,
    userInfo: {
      avatar: '',
      background: '',
      nickname: '',
      gender: '',
      bio: '',
      birthday: '',
      userId: '',
      photos: [],
      travelPreferences: {
        adults: 2,
        children: 0,
        elderly: 0,
        pace: 'medium'
      }
    },
    defaultAvatar: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    saving: false,
    // 景点类型选项
    scenicTypes: [
      { id: 1, name: '山岳', icon: '🏔️', selected: false },
      { id: 2, name: '古迹', icon: '🏛️', selected: false },
      { id: 3, name: '美食', icon: '🍜', selected: false },
      { id: 4, name: '购物', icon: '🛍️', selected: false },
      { id: 5, name: '自然', icon: '🌿', selected: false },
      { id: 6, name: '乐园', icon: '🎢', selected: false }
    ]
  },

  onLoad: function (options) {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ statusBarHeight: systemInfo.statusBarHeight });

    // 加载已有用户信息
    const existingUserInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (existingUserInfo) {
      // 合并用户数据
      const mergedInfo = {
        ...this.data.userInfo,
        ...existingUserInfo,
        travelPreferences: {
          ...this.data.userInfo.travelPreferences,
          ...(existingUserInfo.travelPreferences || {})
        }
      };

      // 更新景点类型的选中状态
      if (existingUserInfo.scenicTypes) {
        const updatedScenicTypes = this.data.scenicTypes.map(item => ({
          ...item,
          selected: existingUserInfo.scenicTypes.includes(item.id)
        }));
        this.setData({ scenicTypes: updatedScenicTypes });
      }

      this.setData({ userInfo: mergedInfo });
    }

    // 生成用户ID
    if (!this.data.userInfo.userId) {
      const userId = 'BJ' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
      this.setData({ 'userInfo.userId': userId });
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

  // 选择背景图
  onChooseBackground: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.setData({
          'userInfo.background': tempFilePath
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

  // 简介输入
  onBioInput: function (e) {
    this.setData({
      'userInfo.bio': e.detail.value
    });
  },

  // 选择生日
  onSelectBirthday: function () {
    wx.showActionSheet({
      itemList: ['选择生日'],
      success: () => {
        wx.showModal({
          title: '选择生日',
          content: '请在输入框中输入您的生日',
          showCancel: false
        });
      }
    });
  },

  // 添加旅行照片
  onAddPhoto: function () {
    const currentCount = this.data.userInfo.photos.length;
    if (currentCount >= 9) {
      wx.showToast({ title: '最多上传9张照片', icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: 9 - currentCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPhotos = res.tempFiles.map(file => file.tempFilePath);
        this.setData({
          'userInfo.photos': [...this.data.userInfo.photos, ...newPhotos]
        });
      }
    });
  },

  // 预览照片
  onPreviewPhoto: function (e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.userInfo.photos[index],
      urls: this.data.userInfo.photos
    });
  },

  // 删除照片
  onDeletePhoto: function (e) {
    const index = e.currentTarget.dataset.index;
    const photos = [...this.data.userInfo.photos];
    photos.splice(index, 1);
    this.setData({
      'userInfo.photos': photos
    });
  },

  // 计数器变化
  onCounterChange: function (e) {
    const { type, action } = e.currentTarget.dataset;
    const currentValue = this.data.userInfo.travelPreferences[type];
    let newValue = currentValue;

    if (action === 'plus') {
      newValue = Math.min(currentValue + 1, 10);
    } else if (action === 'minus') {
      newValue = Math.max(currentValue - 1, 0);
    }

    this.setData({
      [`userInfo.travelPreferences.${type}`]: newValue
    });
  },

  // 切换景点类型
  onToggleScenicType: function (e) {
    const index = e.currentTarget.dataset.index;
    const scenicTypes = [...this.data.scenicTypes];
    scenicTypes[index].selected = !scenicTypes[index].selected;
    this.setData({ scenicTypes });
  },

  // 选择行程节奏
  onSelectPace: function (e) {
    const pace = e.currentTarget.dataset.pace;
    this.setData({
      'userInfo.travelPreferences.pace': pace
    });
  },

  // 保存
  onSave: async function () {
    const { userInfo, scenicTypes } = this.data;

    // 验证必填项
    if (!userInfo.nickname || userInfo.nickname.length < 2) {
      wx.showToast({ title: '请输入2-12个字符的昵称', icon: 'none' });
      return;
    }

    if (!userInfo.gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    try {
      // 获取选中的景点类型
      const selectedScenicTypes = scenicTypes.filter(item => item.selected).map(item => item.id);

      // 构建用户数据
      const userData = {
        ...userInfo,
        scenicTypes: selectedScenicTypes,
        updatedAt: new Date().toISOString()
      };

      // 保存到本地存储
      wx.setStorageSync('userInfo', userData);

      // 更新全局数据
      app.globalData.userInfo = userData;
      app.globalData.isLoggedIn = true;

      // 使用 auth 模块处理登录成功
      auth.handleLoginSuccess(userData);

      wx.showToast({ title: '保存成功', icon: 'success' });

      setTimeout(() => {
        wx.navigateBack();
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
    wx.navigateBack();
  }
});
