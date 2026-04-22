// pages/edit-profile/edit-profile.js
const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    userInfo: {
      avatar: '',
      avatarFileID: '',
      background: '',
      backgroundFileID: '',
      nickname: '',
      gender: '',
      contactPhone: '',  // 联系方式
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

  // 保存到本地存储
  saveToLocal: function () {
    const { userInfo, scenicTypes } = this.data;
    const selectedScenicTypes = scenicTypes.filter(item => item.selected).map(item => item.id);
    const avatarForDb = userInfo.avatarFileID || userInfo.avatar;
    const backgroundForDb = userInfo.backgroundFileID || userInfo.background;

    const userData = {
      ...userInfo,
      avatar: avatarForDb,
      background: backgroundForDb,
      scenicTypes: selectedScenicTypes,
      updatedAt: Date.now()
    };

    // 保存到本地存储
    wx.setStorageSync('userInfo', {
      ...userData,
      avatar: userInfo.avatar,
      background: userInfo.background
    });
    wx.setStorageSync('lastLoginTime', Date.now());

    // 更新全局数据
    app.globalData.userInfo = userData;
    app.globalData.isLoggedIn = true;
  },

  // 异步同步到数据库
  saveToDatabase: function () {
    const { userInfo, scenicTypes } = this.data;
    const userId = wx.getStorageSync('userId') || app.globalData.userId;
    if (!userId) return;

    const selectedScenicTypes = scenicTypes.filter(item => item.selected).map(item => item.id);
    const avatarForDb = userInfo.avatarFileID || userInfo.avatar;
    const backgroundForDb = userInfo.backgroundFileID || userInfo.background;
    const photosForDb = (userInfo.photoFileIDs && userInfo.photoFileIDs.length > 0)
      ? userInfo.photoFileIDs
      : userInfo.photos.filter(p => p.startsWith('cloud://'));

    api.userUpdate({
      _id: userId,
      nickname: userInfo.nickname,
      avatar: avatarForDb,
      gender: userInfo.gender,
      contactPhone: userInfo.contactPhone,
      bio: userInfo.bio,
      background: backgroundForDb,
      photos: photosForDb
    }).catch(err => console.warn('同步到数据库失败', err));
  },

  // 实时保存
  autoSave: function () {
    this.saveToLocal();
    this.saveToDatabase();
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
          const fileIDMap = {};

          urlRes.fileList.forEach(item => {
            if (item.tempFileURL) {
              fileIDMap[item.fileID] = item.tempFileURL;

              if (item.fileID === avatar) {
                updates['userInfo.avatar'] = item.tempFileURL;
                updates['userInfo.avatarFileID'] = item.fileID;
              }
              if (item.fileID === background) {
                updates['userInfo.background'] = item.tempFileURL;
                updates['userInfo.backgroundFileID'] = item.fileID;
              }
            }
          });

          const photoFileIDs = [];
          newPhotos.forEach((photo, index) => {
            if (photo.startsWith('cloud://') && fileIDMap[photo]) {
              newPhotos[index] = fileIDMap[photo];
              photoFileIDs.push(photo);
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
        this.setData({ 'userInfo.avatar': tempFilePath });

        if (wx.cloud) {
          try {
            const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2)}.jpg`;
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: tempFilePath
            });

            if (uploadRes.fileID) {
              const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
              if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
                this.setData({
                  'userInfo.avatar': urlRes.fileList[0].tempFileURL,
                  'userInfo.avatarFileID': uploadRes.fileID
                });
                this.autoSave();
              }
            }
          } catch (err) {
            console.warn('头像上传失败', err);
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
        this.setData({ 'userInfo.background': tempFilePath });

        if (wx.cloud) {
          try {
            const cloudPath = `backgrounds/${Date.now()}-${Math.random().toString(36).substr(2)}.jpg`;
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: tempFilePath
            });

            if (uploadRes.fileID) {
              const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
              if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
                this.setData({
                  'userInfo.background': urlRes.fileList[0].tempFileURL,
                  'userInfo.backgroundFileID': uploadRes.fileID
                });
                this.autoSave();
              }
            }
          } catch (err) {
            console.warn('背景图上传失败', err);
          }
        }
      }
    });
  },

  // 昵称输入（失焦时保存）
  onNicknameInput: function (e) {
    this.setData({ 'userInfo.nickname': e.detail.value });
  },

  onNicknameBlur: function () {
    this.autoSave();
  },

  // 性别选择
  onGenderChange: function (e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ 'userInfo.gender': value });
    this.autoSave();
  },

  // 联系方式输入
  onPhoneInput: function (e) {
    let value = e.detail.value;
    value = value.replace(/\D/g, '').slice(0, 11);
    this.setData({ 'userInfo.contactPhone': value });
  },

  onPhoneBlur: function () {
    this.autoSave();
  },

  // 简介输入
  onBioInput: function (e) {
    this.setData({ 'userInfo.bio': e.detail.value });
  },

  onBioBlur: function () {
    this.autoSave();
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
        this.setData({ 'userInfo.photos': [...this.data.userInfo.photos, ...tempFiles] });

        if (wx.cloud) {
          wx.showLoading({ title: '上传中...' });
          const uploadedPhotos = [];
          const newFileIDs = [];

          for (let i = 0; i < tempFiles.length; i++) {
            try {
              const cloudPath = `photos/${Date.now()}-${i}-${Math.random().toString(36).substr(2)}.jpg`;
              const uploadRes = await wx.cloud.uploadFile({
                cloudPath: cloudPath,
                filePath: tempFiles[i]
              });
              if (uploadRes.fileID) {
                newFileIDs.push(uploadRes.fileID);
              }
            } catch (err) {
              console.warn('照片上传失败', err);
            }
          }

          if (newFileIDs.length > 0) {
            try {
              const urlRes = await wx.cloud.getTempFileURL({ fileList: newFileIDs });
              if (urlRes.fileList) {
                urlRes.fileList.forEach(item => {
                  if (item.tempFileURL) {
                    uploadedPhotos.push(item.tempFileURL);
                  }
                });
              }
            } catch (err) {
              console.warn('获取照片链接失败', err);
              uploadedPhotos.push(...newFileIDs);
            }
          }

          wx.hideLoading();

          const allPhotos = [...this.data.userInfo.photos.slice(0, currentCount), ...uploadedPhotos];
          const existingFileIDs = this.data.userInfo.photoFileIDs || [];
          const allFileIDs = [...existingFileIDs, ...newFileIDs];

          this.setData({
            'userInfo.photos': allPhotos,
            'userInfo.photoFileIDs': allFileIDs
          });
          this.autoSave();
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
    const photoFileIDs = [...(this.data.userInfo.photoFileIDs || [])];

    photos.splice(index, 1);
    if (photoFileIDs.length === this.data.userInfo.photos.length) {
      photoFileIDs.splice(index, 1);
    }

    this.setData({
      'userInfo.photos': photos,
      'userInfo.photoFileIDs': photoFileIDs
    });
    this.autoSave();
  }
});
