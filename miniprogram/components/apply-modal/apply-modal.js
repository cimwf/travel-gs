// components/apply-modal/apply-modal.js
const api = require('../../utils/api.js');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    placeName: {
      type: String,
      value: ''
    },
    remainCount: {
      type: Number,
      value: 0
    },
    tripId: {
      type: String,
      value: ''
    },
    toUserId: {
      type: String,
      value: ''
    },
    toUserName: {
      type: String,
      value: ''
    },
    defaultPhone: {
      type: String,
      value: ''
    }
  },

  data: {
    contactValue: '',
    introduction: ''
  },

  observers: {
    'show, defaultPhone': function(show, defaultPhone) {
      if (show && defaultPhone) {
        this.setData({ contactValue: defaultPhone });
      }
    }
  },

  methods: {
    // 阻止事件冒泡
    preventBubble: function () {},

    // 关闭弹窗
    onClose: function () {
      this.setData({
        contactValue: '',
        introduction: ''
      });
      this.triggerEvent('close');
    },

    // 输入联系方式
    onContactInput: function (e) {
      let value = e.detail.value;
      // 只允许输入数字，最多11位
      value = value.replace(/\D/g, '').slice(0, 11);
      this.setData({ contactValue: value });
    },

    // 输入备注
    onIntroductionInput: function (e) {
      this.setData({ introduction: e.detail.value });
    },

    // 提交申请
    onSubmit: async function () {
      const { contactValue, introduction } = this.data;

      // 校验联系方式
      if (!contactValue) {
        wx.showToast({ title: '请填写联系方式', icon: 'none' });
        return;
      }

      const phoneReg = /^1[3-9]\d{9}$/;
      if (!phoneReg.test(contactValue)) {
        wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return;
      }

      wx.showLoading({ title: '发送中...' });

      // 调用云函数创建申请记录
      if (wx.cloud) {
        try {
          await api.applyCreate({
            tripId: this.data.tripId,
            placeName: this.data.placeName,
            toUserId: this.data.toUserId,
            toUserName: this.data.toUserName,
            contactValue: contactValue,
            message: introduction || ''
          });

          wx.hideLoading();
          wx.showToast({ title: '申请已发送', icon: 'success' });

          this.setData({
            contactValue: '',
            introduction: ''
          });

          this.triggerEvent('submit');
        } catch (err) {
          wx.hideLoading();
          console.error('提交申请失败', err);
          wx.showToast({ title: '发送失败，请重试', icon: 'none' });
        }
      } else {
        wx.hideLoading();
        this.triggerEvent('submit');
      }
    }
  }
});
