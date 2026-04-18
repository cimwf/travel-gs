// pages/edit-profile/edit-profile.js
const app = getApp();
const auth = require('../../utils/auth.js');
const api = require('../../utils/api.js');

Page({
  data: {
    statusBarHeight: 0,
    userInfo: {
      avatar: '',
      avatarFileID: '',
      background: '',
      backgroundFileID: '',
      nickname: '',
      gender: '',
      phone: '',
      bio: '',
      birthday: '',
      userId: '',
      photos: [],
      photoFileIDs: [],
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

  onLoad: async function (options) {
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

      // 处理云存储链接，转换为临时URL用于显示
      await this.convertCloudUrls();
    }

    // 生成用户ID
    if (!this.data.userInfo.userId) {
      const userId = 'BJ' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
      this.setData({ 'userInfo.userId': userId });
    }
  },

  // 转换云存储链接为临时URL
  convertCloudUrls: async function () {
    const { avatar, background, photos } = this.data.userInfo;
    const cloudUrls = [];

    if (avatar && avatar.startsWith('cloud://')) {
      cloudUrls.push(avatar);
    }
    if (background && background.startsWith('cloud://')) {
      cloudUrls.push(background);
    }

    // 处理照片中的云存储链接
    const cloudPhotos = (photos || []).filter(p => p.startsWith('cloud://'));
    cloudUrls.push(...cloudPhotos);

    if (cloudUrls.length > 0 && wx.cloud) {
      try {
        const urlRes = await wx.cloud.getTempFileURL({ fileList: cloudUrls });
        if (urlRes.fileList) {
          const updates = {};
          const newPhotos = [...(photos || [])];
          const photoFileIDs = [];

          urlRes.fileList.forEach(item => {
            if (item.tempFileURL) {
              if (item.fileID === avatar) {
                updates['userInfo.avatar'] = item.tempFileURL;
                updates['userInfo.avatarFileID'] = item.fileID;
              }
              if (item.fileID === background) {
                updates['userInfo.background'] = item.tempFileURL;
                updates['userInfo.backgroundFileID'] = item.fileID;
              }
              // 处理照片
              const photoIndex = newPhotos.indexOf(item.fileID);
              if (photoIndex !== -1) {
                newPhotos[photoIndex] = item.tempFileURL;
                photoFileIDs.push(item.fileID);
              }
            }
          });

          updates['userInfo.photos'] = newPhotos;
          updates['userInfo.photoFileIDs'] = photoFileIDs;

          this.setData(updates);
        }
      } catch (err) {
        console.warn('转换云存储链接失败', err);
      }
    }
  },

  // 选择头像
  onChooseAvatar: async function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;

        // 先显示临时图片
        this.setData({
          'userInfo.avatar': tempFilePath
        });

        // 上传到云存储
        if (wx.cloud) {
          try {
            const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2)}.jpg`;
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: tempFilePath
            });

            if (uploadRes.fileID) {
              // 获取临时链接用于显示
              const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
              if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
                this.setData({
                  'userInfo.avatar': urlRes.fileList[0].tempFileURL,
                  'userInfo.avatarFileID': uploadRes.fileID  // 保存 fileID 用于上传
                });
                console.log('头像上传成功:', uploadRes.fileID);
              }
            }
          } catch (err) {
            console.warn('头像上传失败，使用临时路径', err);
          }
        }
      }
    });
  },

  // 选择背景图
  onChooseBackground: async function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;

        // 先显示临时图片
        this.setData({
          'userInfo.background': tempFilePath
        });

        // 上传到云存储
        if (wx.cloud) {
          try {
            const cloudPath = `backgrounds/${Date.now()}-${Math.random().toString(36).substr(2)}.jpg`;
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: tempFilePath
            });

            if (uploadRes.fileID) {
              // 获取临时链接用于显示
              const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
              if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
                this.setData({
                  'userInfo.background': urlRes.fileList[0].tempFileURL,
                  'userInfo.backgroundFileID': uploadRes.fileID  // 保存 fileID 用于上传
                });
                console.log('背景图上传成功:', uploadRes.fileID);
              }
            }
          } catch (err) {
            console.warn('背景图上传失败，使用临时路径', err);
          }
        }
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

  // 手机号输入
  onPhoneInput: function (e) {
    let value = e.detail.value;
    // 只允许输入数字，最多11位
    value = value.replace(/\D/g, '').slice(0, 11);
    this.setData({
      'userInfo.phone': value
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
  onAddPhoto: async function () {
    const currentCount = this.data.userInfo.photos.length;
    if (currentCount >= 9) {
      wx.showToast({ title: '最多上传9张照片', icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: 9 - currentCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFiles = res.tempFiles.map(file => file.tempFilePath);

        // 先显示临时图片
        this.setData({
          'userInfo.photos': [...this.data.userInfo.photos, ...tempFiles]
        });

        // 上传到云存储
        if (wx.cloud) {
          wx.showLoading({ title: '上传中...' });
          const uploadedPhotos = [];
          const fileIDs = [];

          for (let i = 0; i < tempFiles.length; i++) {
            try {
              const cloudPath = `photos/${Date.now()}-${i}-${Math.random().toString(36).substr(2)}.jpg`;
              const uploadRes = await wx.cloud.uploadFile({
                cloudPath: cloudPath,
                filePath: tempFiles[i]
              });

              if (uploadRes.fileID) {
                fileIDs.push(uploadRes.fileID);
              }
            } catch (err) {
              console.warn('照片上传失败', err);
            }
          }

          // 获取临时链接用于显示
          if (fileIDs.length > 0) {
            try {
              const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs });
              if (urlRes.fileList) {
                urlRes.fileList.forEach(item => {
                  if (item.tempFileURL) {
                    uploadedPhotos.push(item.tempFileURL);
                  }
                });
              }
            } catch (err) {
              console.warn('获取照片链接失败', err);
              uploadedPhotos.push(...fileIDs);  // 失败时使用 fileID
            }
          }

          wx.hideLoading();

          // 更新照片列表
          const allPhotos = [...this.data.userInfo.photos.slice(0, currentCount), ...uploadedPhotos];
          this.setData({
            'userInfo.photos': allPhotos,
            'userInfo.photoFileIDs': fileIDs  // 保存 fileID 用于上传
          });
        }
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

    // 验证手机号
    if (!userInfo.phone) {
      wx.showToast({ title: '请输入联系方式', icon: 'none' });
      return;
    }

    const phoneReg = /^1[3-9]\d{9}$/;
    if (!phoneReg.test(userInfo.phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    wx.showLoading({ title: '保存中...' });

    try {
      // 获取选中的景点类型
      const selectedScenicTypes = scenicTypes.filter(item => item.selected).map(item => item.id);

      // 使用 fileID 保存到数据库（如果有）
      const avatarForDb = userInfo.avatarFileID || userInfo.avatar;
      const backgroundForDb = userInfo.backgroundFileID || userInfo.background;

      // 构建用户数据
      const userData = {
        ...userInfo,
        avatar: avatarForDb,
        background: backgroundForDb,
        scenicTypes: selectedScenicTypes,
        updatedAt: Date.now()
      };

      console.log('保存的用户数据:', userData);

      // 保存到本地存储（使用临时URL用于显示）
      wx.setStorageSync('userInfo', {
        ...userData,
        avatar: userInfo.avatar,  // 本地保存临时URL用于显示
        background: userInfo.background
      });
      wx.setStorageSync('lastLoginTime', Date.now());

      // 更新全局数据
      app.globalData.userInfo = userData;
      app.globalData.isLoggedIn = true;

      // 同步到数据库 - 使用云函数
      try {
        // 获取用户唯一标识 _id
        const userId = wx.getStorageSync('userId') || app.globalData.userId;

        // 照片使用 fileID（如果有）
        const photosForDb = userInfo.photoFileIDs || userData.photos;

        const updateRes = await api.userUpdate({
          _id: userId,  // 传递唯一标识
          nickname: userData.nickname,
          avatar: avatarForDb,
          gender: userData.gender,
          phone: userData.phone,
          bio: userData.bio,
          background: backgroundForDb,
          photos: photosForDb
        });
        console.log('云函数更新结果:', updateRes);
      } catch (err) {
        console.warn('同步到数据库失败', err);
        // 不影响本地保存，继续执行
      }

      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });

      setTimeout(() => {
        wx.navigateBack();
      }, 1000);

    } catch (err) {
      wx.hideLoading();
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
