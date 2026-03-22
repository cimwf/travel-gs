// components/login-modal/login-modal.js
const app = getApp();

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {
    avatarUrl: '',
    nickname: '',
    gender: 0,
    agreed: false,
    loading: false
  },

  methods: {
    // 选择头像
    onChooseAvatar(e) {
      const { avatarUrl } = e.detail;
      this.setData({ avatarUrl });
    },

    // 昵称输入
    onNicknameInput(e) {
      this.setData({ nickname: e.detail.value });
    },

    // 昵称失焦（微信会自动填充）
    onNicknameBlur(e) {
      if (e.detail.value) {
        this.setData({ nickname: e.detail.value });
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
    },

    // 打开协议页面
    onOpenAgreement(e) {
      const type = e.currentTarget.dataset.type;
      wx.navigateTo({
        url: `/pages/agreement/agreement?type=${type}`
      });
    },

    // 关闭弹窗
    onClose() {
      this.triggerEvent('close');
    },

    // 确认登录
    async onConfirm() {
      const { avatarUrl, nickname, gender, agreed } = this.data;

      // 验证协议
      if (!agreed) {
        wx.showToast({ title: '请先同意用户协议', icon: 'none' });
        return;
      }

      // 验证昵称
      if (!nickname || nickname.trim() === '') {
        wx.showToast({ title: '请输入昵称', icon: 'none' });
        return;
      }

      this.setData({ loading: true });

      try {
        // 先调用login云函数获取openid
        const loginRes = await new Promise((resolve, reject) => {
          wx.cloud.callFunction({
            name: 'login',
            success: resolve,
            fail: reject
          });
        });

        const openid = loginRes.result.openid;

        // 上传头像到云存储
        let avatarCloudUrl = avatarUrl;
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
            console.warn('头像上传失败，使用默认头像', uploadErr);
            avatarCloudUrl = '';
          }
        }

        // 调用API保存用户信息
        const apiRes = await new Promise((resolve, reject) => {
          wx.cloud.callFunction({
            name: 'api',
            data: {
              action: 'user/login',
              data: {
                nickname: nickname.trim(),
                avatar: avatarCloudUrl,
                gender
              }
            },
            success: resolve,
            fail: reject
          });
        });

        if (apiRes.result.success) {
          const user = apiRes.result.user;
          
          // 保存到全局
          app.globalData.userInfo = user;
          app.globalData.openid = openid;
          app.globalData.isLoggedIn = true;

          // 保存到本地
          wx.setStorageSync('userInfo', user);
          wx.setStorageSync('openid', openid);

          // 触发登录成功事件
          this.triggerEvent('success', { user });
          
          wx.showToast({ title: '登录成功', icon: 'success' });
          this.onClose();
        } else {
          throw new Error(apiRes.result.error || '登录失败');
        }
      } catch (err) {
        console.error('登录失败:', err);
        wx.showToast({ title: err.message || '登录失败', icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    }
  }
});
