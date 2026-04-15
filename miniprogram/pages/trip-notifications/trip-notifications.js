// pages/trip-notifications/trip-notifications.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    notifications: [],

    // 取消弹窗
    showCancelModal: false,
    cancelApplyId: ''
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.checkLogin();
  },

  // 检查登录状态
  checkLogin: function () {
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });

    if (isLoggedIn) {
      this.loadNotifications();
    }
  },

  // 加载所有通知
  loadNotifications: async function () {
    this.setData({ loading: true });

    const openid = app.globalData.openid;
    if (!openid) {
      this.setData({ loading: false, notifications: [] });
      return;
    }

    if (wx.cloud) {
      try {
        const db = wx.cloud.database();

        // 并行加载两种数据
        const [receivedRes, sentRes] = await Promise.all([
          // 我收到的申请（别人申请加入我的行程）
          db.collection('applies')
            .where({
              toUserId: openid,
              type: db.command.neq('invite')
            })
            .orderBy('createdAt', 'desc')
            .limit(30)
            .get(),
          // 我发出的申请（我申请加入别人的行程）
          db.collection('applies')
            .where({
              fromUserId: openid
            })
            .orderBy('createdAt', 'desc')
            .limit(30)
            .get()
        ]);

        // 收集云存储头像
        const fileIDs = [];
        (receivedRes.data || []).forEach(item => {
          if (item.fromUserAvatar && item.fromUserAvatar.startsWith('cloud://')) {
            fileIDs.push(item.fromUserAvatar);
          }
        });

        let avatarMap = {};
        if (fileIDs.length > 0) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs });
            if (urlRes.fileList) {
              urlRes.fileList.forEach(item => {
                if (item.tempFileURL) {
                  avatarMap[item.fileID] = item.tempFileURL;
                }
              });
            }
          } catch (err) {
            console.warn('获取头像临时链接失败', err);
          }
        }

        // 处理我收到的申请
        const receivedList = (receivedRes.data || []).map(item => {
          let avatar = item.fromUserAvatar || '';
          if (avatar && avatar.startsWith('cloud://') && avatarMap[avatar]) {
            avatar = avatarMap[avatar];
          }
          if (avatar && !avatar.startsWith('http')) {
            avatar = '';
          }

          return {
            _id: item._id,
            type: 'received',
            userName: item.fromUserName || '旅行者',
            fromUserAvatar: avatar,
            avatarBg: this.getAvatarBg(item.fromUserName),
            headerTitle: (item.fromUserName || '旅行者') + ' 申请加入您的行程',
            headerMeta: item.placeName || '行程',
            timeAgo: this.formatTimeAgo(item.createdAt),
            contactType: item.contactType || 'phone',
            contactValue: item.contactValue || '',
            introduction: item.message || '',
            isHandled: item.status !== 'pending',
            status: item.status === 'accepted' ? 'agreed' : item.status,
            statusText: item.status === 'accepted' ? '已同意' : (item.status === 'rejected' ? '已拒绝' : ''),
            tripId: item.tripId,
            createdAt: item.createdAt
          };
        });

        // 处理我发出的申请（需要获取行程详情）
        const sentList = [];
        for (const item of sentRes.data || []) {
          let tripData = null;
          let creatorPhone = '';
          let creatorWechat = '';

          if (item.tripId) {
            try {
              const tripRes = await db.collection('trips').doc(item.tripId).get();
              if (tripRes.data) {
                tripData = tripRes.data;

                // 如果已同意，获取发起人联系方式
                if (item.status === 'accepted' && tripData.creatorId) {
                  const userRes = await db.collection('users').where({
                    _openid: tripData.creatorId
                  }).get();
                  if (userRes.data && userRes.data[0]) {
                    creatorPhone = userRes.data[0].phone || '';
                    creatorWechat = userRes.data[0].wechat || '';
                  }
                }
              }
            } catch (err) {
              console.warn('获取行程详情失败', err);
            }
          }

          const status = item.status || 'pending';
          const statusText = status === 'pending' ? '申请中' :
                            (status === 'accepted' ? '已同意' : '已拒绝');

          sentList.push({
            _id: item._id,
            type: 'sent',
            tripId: item.tripId,
            placeName: item.placeName || tripData?.placeName || '未知地点',
            placeBg: this.getPlaceBg(item.placeName),
            placeEmoji: this.getPlaceEmoji(item.placeName),
            creatorName: item.toUserName || tripData?.creatorName || '旅行者',
            tripDate: tripData?.date ? this.formatDate(tripData.date) : '待定',
            status: status,
            statusText: statusText,
            message: item.message || '',
            applyTime: this.formatApplyTime(item.createdAt),
            creatorPhone: creatorPhone,
            creatorWechat: creatorWechat,
            createdAt: item.createdAt
          });
        }

        // 合并列表，按时间排序
        const notifications = [...receivedList, ...sentList].sort((a, b) => {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        this.setData({
          loading: false,
          notifications
        });
        return;
      } catch (err) {
        console.warn('加载通知失败', err);
      }
    }

    this.setData({
      loading: false,
      notifications: []
    });
  },

  // 格式化日期
  formatDate: function (dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  },

  // 格式化申请时间
  formatApplyTime: function (timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 格式化时间为"xx前"
  formatTimeAgo: function (timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(timestamp).toLocaleDateString();
  },

  // 根据名字生成头像背景色
  getAvatarBg: function (name) {
    const colors = [
      'linear-gradient(135deg, #FF6B6B, #FF8E53)',
      'linear-gradient(135deg, #4A90E2, #6BA3E8)',
      'linear-gradient(135deg, #56AB2F, #A8E6CF)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #11998e, #38ef7d)'
    ];
    if (!name) return colors[0];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  },

  // 根据地点名生成背景色
  getPlaceBg: function (name) {
    const colors = [
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #FF6B6B, #FF8E53)',
      'linear-gradient(135deg, #4A90E2, #6BA3E8)',
      'linear-gradient(135deg, #56AB2F, #A8E6CF)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #11998e, #38ef7d)'
    ];
    if (!name) return colors[0];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  },

  // 根据地点名获取emoji
  getPlaceEmoji: function (name) {
    if (!name) return '🏔️';
    if (name.includes('山') || name.includes('峰')) return '🏔️';
    if (name.includes('湖')) return '🏞️';
    if (name.includes('海')) return '🌊';
    if (name.includes('长城')) return '🏯';
    if (name.includes('公园') || name.includes('园')) return '🌳';
    if (name.includes('寺') || name.includes('庙')) return '🏛️';
    return '🏔️';
  },

  // 点击登录
  onTapLogin: function () {
    auth.goToLogin('/pages/trip-notifications/trip-notifications');
  },

  // 拒绝申请
  onRejectApply: async function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认拒绝',
      content: '确定要拒绝此申请吗？',
      success: async (res) => {
        if (res.confirm) {
          await this.updateApplyStatus(id, 'rejected', '已拒绝');
        }
      }
    });
  },

  // 同意申请
  onAgreeApply: async function (e) {
    const id = e.currentTarget.dataset.id;
    await this.updateApplyStatus(id, 'accepted', '已同意');
  },

  // 更新申请状态
  updateApplyStatus: async function (applyId, status, statusText) {
    if (wx.cloud) {
      try {
        const db = wx.cloud.database();
        await db.collection('applies').doc(applyId).update({
          data: { status }
        });

        // 如果同意，将申请人加入行程
        if (status === 'accepted') {
          const notification = this.data.notifications.find(n => n._id === applyId);
          if (notification && notification.tripId) {
            const applyRes = await db.collection('applies').doc(applyId).get();
            if (applyRes.data) {
              const apply = applyRes.data;
              await db.collection('trips').doc(apply.tripId).update({
                data: {
                  participants: db.command.push({
                    userId: apply.fromUserId,
                    nickname: apply.fromUserName,
                    avatar: apply.fromUserAvatar || ''
                  }),
                  currentCount: db.command.inc(1),
                  needCount: db.command.inc(-1)
                }
              });
            }
          }
        }
      } catch (err) {
        console.error('更新申请状态失败', err);
        wx.showToast({ title: '操作失败，请重试', icon: 'none' });
        return;
      }
    }

    // 更新本地状态
    const notifications = this.data.notifications.map(item => {
      if (item._id === applyId) {
        return {
          ...item,
          isHandled: true,
          status: status === 'accepted' ? 'agreed' : status,
          statusText: statusText
        };
      }
      return item;
    });
    this.setData({ notifications });
    wx.showToast({ title: '操作成功', icon: 'success' });
  },

  // 查看行程
  onViewTrip: function (e) {
    const tripId = e.currentTarget.dataset.tripid;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 取消申请
  onCancelApply: function (e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      showCancelModal: true,
      cancelApplyId: id
    });
  },

  // 关闭取消弹窗
  onCloseCancelModal: function () {
    this.setData({
      showCancelModal: false,
      cancelApplyId: ''
    });
  },

  // 阻止冒泡
  preventBubble: function () {},

  // 确认取消申请
  onConfirmCancel: async function () {
    const applyId = this.data.cancelApplyId;

    if (wx.cloud) {
      try {
        wx.showLoading({ title: '取消中...' });

        const db = wx.cloud.database();
        await db.collection('applies').doc(applyId).update({
          data: { status: 'cancelled' }
        });

        wx.hideLoading();
        wx.showToast({ title: '已取消申请', icon: 'success' });

        this.setData({
          showCancelModal: false,
          cancelApplyId: ''
        });

        // 重新加载列表
        this.loadNotifications();
      } catch (err) {
        wx.hideLoading();
        console.error('取消申请失败', err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    }
  },

  // 复制联系方式
  onCopyContact: function (e) {
    const value = e.currentTarget.dataset.value;
    wx.setClipboardData({
      data: value,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  // 重新申请
  onReapply: function (e) {
    const tripId = e.currentTarget.dataset.tripid;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    if (this.data.isLoggedIn) {
      this.loadNotifications();
    }
    wx.stopPullDownRefresh();
  }
});
