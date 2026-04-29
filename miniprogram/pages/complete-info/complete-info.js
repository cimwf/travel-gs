// pages/complete-info/complete-info.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    time: '21:30',
    avatarUrl: '',
    nickname: '',
    gender: 0,
    agreed: false,
    loading: false
  },

  onLoad() {
    this.updateTime();
    
    // 检查是否有临时数据
    const phone = wx.getStorageSync('tempPhone');
    const openid = wx.getStorageSync('tempOpenid');
    
    if (!phone || !openid) {
      // 没有临时数据，需要先获取手机号
      wx.showToast({ title: '请先完成手机号授权', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/auth/auth' });
      }, 1500);
    }
  },

  // 更新时间
  updateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    this.setData({ time: `${hours}:${minutes}` });
  },

  // 计算是否可以提交
  computeCanSubmit() {
    const { avatarUrl, nickname, agreed } = this.data;
    return avatarUrl && nickname.trim() && agreed;
  },

  // 更新提交按钮状态
  updateCanSubmit() {
    const canSubmit = this.computeCanSubmit();
    this.setData({ canSubmit });
  },

  // 选择头像
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ avatarUrl });
    this.updateCanSubmit();
  },

  // 昵称输入
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
    this.updateCanSubmit();
  },

  // 昵称失焦（微信会自动填充）
  onNicknameBlur(e) {
    if (e.detail.value) {
      this.setData({ nickname: e.detail.value });
      this.updateCanSubmit();
    }
  },

  // 性别选择
  onGenderChange(e) {
    const gender = parseInt(e.currentTarget.dataset.gender);
    this.setData({ gender });
  },

  // 同意协议
  onAgreeChange() {
    this.setData({ agreed: !this.data.agreed });
    this.updateCanSubmit();
  },

  // 打开协议
  onOpenAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/agreement/agreement?type=${type}`
    });
  },

  // 返回
  onBack() {
    wx.showModal({
      title: '确认返回',
      content: '返回后将重新进行手机号授权',
      success: (res) => {
        if (res.confirm) {
          // 清除临时数据
          wx.removeStorageSync('tempPhone');
          wx.removeStorageSync('tempOpenid');
          wx.navigateTo({ url: '/pages/auth/auth' });
        }
      }
    });
  },

  // 提交
  async onSubmit() {
    const { avatarUrl, nickname, gender, agreed } = this.data;

    // 验证
    if (!avatarUrl) {
      wx.showToast({ title: '请选择头像', icon: 'none' });
      return;
    }

    if (!nickname || nickname.trim() === '') {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    if (!agreed) {
      wx.showToast({ title: '请先同意用户协议', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const phone = wx.getStorageSync('tempPhone');
      const openid = wx.getStorageSync('tempOpenid');
      
      // 上传头像到云存储
      let avatarCloudUrl = '';
      if (avatarUrl && (avatarUrl.startsWith('http://tmp') || avatarUrl.startsWith('wxfile://'))) {
        try {
          const uploadRes = await new Promise((resolve, reject) => {
            wx.cloud.uploadFile({
              cloudPath: `avatars/${openid}_${Date.now()}.jpg`,
              filePath: avatarUrl,
              success: resolve,
              fail: reject
            });
          });
          avatarCloudUrl = uploadRes.fileID;
        } catch (uploadErr) {
          console.warn('头像上传失败', uploadErr);
        }
      }

      // 调用 API 注册用户
      const apiRes = await wx.cloud.callFunction({
        name: 'api',
        data: {
          action: 'user/register',
          data: {
            phone: phone,
            nickname: nickname.trim(),
            avatar: avatarCloudUrl || avatarUrl,
            gender: gender,
            openid: openid
          }
        }
      });

      if (apiRes.result.success) {
        const user = apiRes.result.user;
        
        // 使用 auth 模块处理登录成功
        auth.handleLoginSuccess(user);

        // 清除临时数据
        wx.removeStorageSync('tempPhone');
        wx.removeStorageSync('tempOpenid');

        wx.showToast({ title: '注册成功', icon: 'success' });

        setTimeout(() => {
          wx.removeStorageSync('deepLinkUrl');
          wx.switchTab({ url: '/pages/index/index' });
        }, 1000);
      } else {
        throw new Error(apiRes.result.error || '注册失败');
      }
    } catch (err) {
      console.error('注册失败:', err);
      wx.showToast({ title: err.message || '注册失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});