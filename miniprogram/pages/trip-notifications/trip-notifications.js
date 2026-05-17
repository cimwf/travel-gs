// pages/trip-notifications/trip-notifications.js
const app = getApp();
const auth = require('../../utils/auth.js');
const api = require('../../utils/api.js');

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    loadingMore: false,
    isRefreshing: false,
    notifications: [],
    currentPage: 1,
    hasMore: false,
    pageSize: 5,

    // 取消弹窗
    showCancelModal: false,
    cancelApplyId: '',

    // 管理弹窗
    showManageModal: false,
    manageApplyId: '',
    manageTripId: ''
  },

  onLoad: function () {
    auth.syncToApp(app);
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });
  },

  onShow: function () {
    auth.syncToApp(app);
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });
    if (isLoggedIn) {
      this._showCacheThenRefresh();
    }
  },

  // 先展示缓存，同时后台拉第 1 页新数据替换
  _showCacheThenRefresh: function () {
    const cache = app.globalData.notificationsCache;
    if (cache && cache.length > 0) {
      this.setData({ notifications: cache, loading: false });
    }
    this.loadNotifications(1);
  },

  // 加载通知：page=1 替换列表并更新缓存，page>1 追加
  loadNotifications: async function (page = 1) {
    const { pageSize } = this.data;

    if (page === 1) {
      if (!app.globalData.notificationsCache) {
        this.setData({ loading: true });
      }
    } else {
      this.setData({ loadingMore: true });
    }

    try {
      const [res, attractions] = await Promise.all([
        api.applyNotifications(page, pageSize),
        app.getAttractions()
      ]);

      const newItems = (res.notifications || []).map(item => {
        let coverImage = item.placeCoverImage || '';
        if (item.placeId) {
          const attraction = attractions.find(a => a._id === item.placeId);
          if (attraction) {
            coverImage = attraction.coverImage || attraction.image || coverImage;
          }
        }
        return {
          ...item,
          fromUserId: item.fromUserId,
          placeCoverImage: coverImage,
          avatarBg: this.getAvatarBg(item.userName),
          placeBg: this.getPlaceBg(item.placeName),
          placeEmoji: this.getPlaceEmoji(item.placeName)
        };
      });

      if (page === 1) {
        app.globalData.notificationsCache = newItems;
        this.setData({
          loading: false,
          notifications: newItems,
          currentPage: 1,
          hasMore: res.hasMore || false
        });
        this.markAsRead();
      } else {
        this.setData({
          loadingMore: false,
          notifications: [...this.data.notifications, ...newItems],
          currentPage: page,
          hasMore: res.hasMore || false
        });
      }
    } catch (err) {
      console.warn('加载通知失败', err);
      this.setData({ loading: false, loadingMore: false });
    }
  },

  // 滚到底部加载下一页
  onScrollToLower: function () {
    if (this.data.loadingMore || !this.data.hasMore) return;
    this.loadNotifications(this.data.currentPage + 1);
  },

  // 标记所有通知为已读
  markAsRead: async function () {
    try {
      await api.applyMarkRead();
    } catch (err) {
      console.warn('标记已读失败', err);
    }
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
    auth.ensureLogin();
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
    try {
      const accept = status === 'accepted';
      await api.applyHandle(applyId, accept);

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
    } catch (err) {
      console.error('更新申请状态失败', err);
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
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

    try {
      wx.showLoading({ title: '取消中...' });

      await api.applyCancel(applyId);

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

  // 下拉刷新（清缓存，强制重新拉第 1 页）
  onRefresh: async function () {
    this.setData({ isRefreshing: true });
    if (this.data.isLoggedIn) {
      app.globalData.notificationsCache = null;
      await this.loadNotifications(1);
    }
    this.setData({ isRefreshing: false });
  },

  // 去发现行程
  onExploreTap: function () {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 打开管理弹窗
  onManageApply: function (e) {
    const id = e.currentTarget.dataset.id;
    const tripId = e.currentTarget.dataset.tripid;
    this.setData({
      showManageModal: true,
      manageApplyId: id,
      manageTripId: tripId
    });
  },

  // 关闭管理弹窗
  onCloseManageModal: function () {
    this.setData({
      showManageModal: false,
      manageApplyId: '',
      manageTripId: ''
    });
  },

  onTapNotificationCard: function (e) {
    const { type, userid } = e.currentTarget.dataset;
    if (type !== 'received' || !userid) {
      return;
    }

    wx.navigateTo({
      url: `/pages/user-profile/user-profile?id=${userid}`
    });
  },

  // 点击头像跳转用户主页
  onTapUserAvatar: function (e) {
    const userId = e.currentTarget.dataset.userid;
    if (userId) {
      wx.navigateTo({
        url: `/pages/user-profile/user-profile?id=${userId}`
      });
    }
  },

  // 删除通知记录
  onDeleteApply: async function () {
    const applyId = this.data.manageApplyId;

    if (!applyId) return;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除此通知吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });

            await api.applyDelete(applyId);

            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });

            this.setData({
              showManageModal: false,
              manageApplyId: '',
              manageTripId: ''
            });

            // 重新加载列表
            this.loadNotifications(1);
          } catch (err) {
            wx.hideLoading();
            console.error('删除通知失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
