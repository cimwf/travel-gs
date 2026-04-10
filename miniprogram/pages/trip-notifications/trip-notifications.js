// pages/trip-notifications/trip-notifications.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    notifications: []
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

  // 加载通知数据
  loadNotifications: async function () {
    this.setData({ loading: true });

    const openid = app.globalData.openid;
    if (!openid) {
      this.setData({ loading: false, notifications: [] });
      return;
    }

    // 从数据库加载真实数据
    if (wx.cloud) {
      try {
        const db = wx.cloud.database();

        // 加载申请通知（别人申请加入我的行程，toUserId 是我）
        const applyRes = await db.collection('applies')
          .where({
            toUserId: openid
          })
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get();

        // 加载邀请消息（别人邀请我，toUserId 是我）
        const inviteRes = await db.collection('applies')
          .where({
            toUserId: openid,
            type: 'invite'
          })
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get();

        // 收集所有云存储头像链接
        const fileIDs = [];
        const allData = [...(applyRes.data || []), ...(inviteRes.data || [])];
        allData.forEach(item => {
          if (item.fromUserAvatar && item.fromUserAvatar.startsWith('cloud://')) {
            fileIDs.push(item.fromUserAvatar);
          }
        });

        // 批量获取临时链接
        let avatarMap = {};
        if (fileIDs.length > 0 && wx.cloud) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({
              fileList: fileIDs
            });
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

        // 处理申请通知数据
        const applyList = (applyRes.data || []).filter(item => item.type !== 'invite').map(item => {
          const timeAgo = this.formatTimeAgo(item.createdAt);
          const contactLabel = item.contactType === 'phone' ? '手机号' : '微信号';
          // 转换云存储链接
          let avatar = item.fromUserAvatar || '';
          if (avatar && avatar.startsWith('cloud://') && avatarMap[avatar]) {
            avatar = avatarMap[avatar];
          }
          // 如果头像不是 http 开头，设为空字符串
          if (avatar && !avatar.startsWith('http')) {
            avatar = '';
          }
          return {
            _id: item._id,
            type: 'apply',
            userName: item.fromUserName || '旅行者',
            fromUserAvatar: avatar,
            avatarBg: this.getAvatarBg(item.fromUserName),
            headerTitle: (item.fromUserName || '旅行者') + ' 申请加入您的行程',
            headerMeta: item.placeName || '行程',
            timeAgo: timeAgo,
            contactType: item.contactType || 'phone',
            contactLabel: contactLabel,
            contactValue: item.contactValue || '',
            introduction: item.message || '',
            isHandled: item.status !== 'pending',
            status: item.status === 'accepted' ? 'agreed' : item.status,
            statusText: item.status === 'accepted' ? '已同意' : (item.status === 'rejected' ? '已拒绝' : ''),
            tripId: item.tripId
          };
        });

        // 处理邀请消息数据
        const inviteList = (inviteRes.data || []).map(item => {
          const timeAgo = this.formatTimeAgo(item.createdAt);
          const contactLabel = item.contactType === 'phone' ? '手机号' : '微信号';
          // 转换云存储链接
          let avatar = item.fromUserAvatar || '';
          if (avatar && avatar.startsWith('cloud://') && avatarMap[avatar]) {
            avatar = avatarMap[avatar];
          }
          // 如果头像不是 http 开头，设为空字符串
          if (avatar && !avatar.startsWith('http')) {
            avatar = '';
          }
          return {
            _id: item._id,
            type: 'invite',
            userName: item.fromUserName || '旅行者',
            fromUserAvatar: avatar,
            avatarBg: this.getAvatarBg(item.fromUserName),
            headerTitle: (item.fromUserName || '旅行者') + ' 想加入您的行程',
            headerMeta: item.placeName || '行程',
            placeName: item.placeName || '',
            timeAgo: timeAgo,
            contactType: item.contactType || 'phone',
            contactLabel: contactLabel,
            contactValue: item.contactValue || '',
            message: item.message || '',
            tripId: item.tripId,
            isHandled: item.status !== 'pending',
            status: item.status,
            statusText: item.status === 'accepted' ? '已同意' : (item.status === 'rejected' ? '已拒绝' : '')
          };
        });

        // 合并列表，按时间排序（未处理的优先）
        const notifications = [...applyList, ...inviteList].sort((a, b) => {
          if (a.isHandled !== b.isHandled) {
            return a.isHandled ? 1 : -1;
          }
          return 0;
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

  // 忽略邀请
  onIgnoreInvite: function (e) {
    const id = e.currentTarget.dataset.id;
    this.updateNotificationStatus(id, 'ignored', '已忽略');
  },

  // 查看行程
  onViewTrip: function (e) {
    const tripId = e.currentTarget.dataset.tripid;
    wx.navigateTo({
      url: `/pages/trip-detail/trip-detail?id=${tripId}`
    });
  },

  // 更新申请状态（数据库操作）
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
            // 获取申请信息
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
                  currentCount: db.command.inc(1)
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

    this.updateNotificationStatus(applyId, status === 'accepted' ? 'agreed' : status, statusText);
  },

  // 更新通知状态（本地）
  updateNotificationStatus: function (id, status, statusText) {
    const notifications = this.data.notifications.map(item => {
      if (item._id === id) {
        return { ...item, isHandled: true, status, statusText };
      }
      return item;
    });
    // 重新排序，将已处理的放到后面
    notifications.sort((a, b) => {
      if (a.isHandled !== b.isHandled) {
        return a.isHandled ? 1 : -1;
      }
      return 0;
    });
    this.setData({ notifications });
    wx.showToast({ title: '操作成功', icon: 'success' });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    if (this.data.isLoggedIn) {
      this.loadNotifications();
    }
    wx.stopPullDownRefresh();
  }
});
