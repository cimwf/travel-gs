const app = getApp();
const auth = require('../../utils/auth.js');
const api = require('../../utils/api.js');

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    error: false,
    activeFilter: 'all',
    allMessages: [],
    visibleMessages: [],
    counts: {
      all: 0,
      trip: 0,
      interaction: 0
    }
  },

  onLoad: function () {
    auth.syncToApp(app);
    this.setData({ isLoggedIn: !!app.globalData.isLoggedIn });
  },

  onShow: function () {
    auth.syncToApp(app);
    var isLoggedIn = !!app.globalData.isLoggedIn;
    this.setData({ isLoggedIn: isLoggedIn });
    if (isLoggedIn) this.loadMessages();
  },

  onPullDownRefresh: function () {
    var self = this;
    if (!this.data.isLoggedIn) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadMessages(true).then(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadMessages: function (silent) {
    if (this._loading) return this._loading;
    if (!silent) this.setData({ loading: true, error: false });

    var self = this;
    this._loading = Promise.all([
      api.applyNotifications(1, 50),
      api.communityNotifications({ pageSize: 50 })
    ]).then(function (results) {
      var tripMessages = (results[0].notifications || []).map(function (item) {
        return self.formatTripMessage(item);
      });
      var interactionMessages = (results[1].notifications || []).map(function (item) {
        return self.formatInteractionMessage(item);
      });
      var allMessages = tripMessages.concat(interactionMessages).sort(function (a, b) {
        return b.createdAt - a.createdAt;
      });

      self.setData({
        allMessages: allMessages,
        loading: false,
        error: false,
        counts: self.getUnreadCounts(allMessages)
      });
      self.applyFilter();
    }).catch(function (err) {
      console.warn('消息中心加载失败', err);
      self.setData({ loading: false, error: true });
    }).then(function () {
      self._loading = null;
    });
    return this._loading;
  },

  formatTripMessage: function (item) {
    var title = item.tripTitle || item.placeName || '行程通知';
    var actionText = '';
    var preview = '';

    if (item.type === 'received' && !item.isHandled) {
      actionText = (item.userName || '旅行者') + ' 申请加入';
      preview = item.introduction || '等待你处理这条行程申请';
    } else if (item.status === 'accepted' || item.status === 'agreed') {
      actionText = item.type === 'sent' ? '你的活动申请已通过' : '你已同意加入申请';
      preview = item.tripDate ? '出发日期：' + item.tripDate : '查看行程详情';
    } else if (item.status === 'pending') {
      actionText = '活动申请等待处理';
      preview = item.tripDate ? '出发日期：' + item.tripDate : '申请已提交';
    } else if (item.status === 'rejected') {
      actionText = '活动申请未通过';
      preview = '可以继续发现其他合适的行程';
    } else if (item.status === 'quit') {
      actionText = (item.userName || '成员') + ' 已退出行程';
      preview = '成员信息已更新';
    } else if (item.status === 'removed') {
      actionText = '成员状态发生变化';
      preview = '你已被移出该行程';
    } else if (item.status === 'cancelled') {
      actionText = '行程已取消';
      preview = '发起人取消了本次行程';
    } else if (item.status === 'deleted') {
      actionText = '行程已删除';
      preview = '该行程已不再展示';
    } else {
      actionText = item.headerTitle || '行程状态已更新';
      preview = item.headerMeta || '查看行程详情';
    }

    return {
      _id: 'trip_' + item._id,
      sourceId: item._id,
      category: 'trip',
      kind: 'trip',
      title: title,
      actionText: actionText,
      preview: preview,
      createdAt: Number(item.createdAt) || 0,
      timeText: this.formatMessageTime(item.createdAt),
      unread: !!item.unread,
      avatar: item.placeCoverImage || item.fromUserAvatar || '',
      avatarText: '行',
      thumbnail: '',
      tripId: item.tripId || '',
      needsHandling: item.type === 'received' && !item.isHandled
    };
  },

  formatInteractionMessage: function (item) {
    var actionMap = {
      like: '赞了你的动态',
      comment: '评论了你',
      reply: '回复了你',
      follow: '关注了你'
    };
    var preview = item.content || item.postContent || '';
    if (preview.length > 42) preview = preview.slice(0, 42) + '…';
    return {
      _id: item._id,
      sourceId: item.sourceId,
      category: 'interaction',
      kind: item.kind,
      title: item.actorName || '旅行者',
      actionText: actionMap[item.kind] || '与你产生了互动',
      preview: preview || '查看这条动态',
      createdAt: Number(item.createdAt) || 0,
      timeText: this.formatMessageTime(item.createdAt),
      unread: !!item.unread,
      avatar: item.actorAvatar || '',
      avatarText: (item.actorName || '旅').slice(0, 1),
      thumbnail: item.postThumbnail || '',
      postId: item.postId || '',
      userId: item.actorId || ''
    };
  },

  formatMessageTime: function (timestamp) {
    var value = Number(timestamp) || 0;
    if (!value) return '';
    var now = new Date();
    var date = new Date(value);
    var diff = Date.now() - value;
    var minutes = Math.floor(diff / 60000);
    var sameDay = now.getFullYear() === date.getFullYear() &&
      now.getMonth() === date.getMonth() &&
      now.getDate() === date.getDate();
    if (sameDay && minutes < 1) return '刚刚';
    if (sameDay && minutes < 60) return minutes + '分钟前';
    if (sameDay) return date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');

    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (yesterday.getFullYear() === date.getFullYear() &&
      yesterday.getMonth() === date.getMonth() &&
      yesterday.getDate() === date.getDate()) {
      return '昨天';
    }
    return String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  },

  getUnreadCounts: function (messages) {
    var counts = { all: 0, trip: 0, interaction: 0 };
    messages.forEach(function (item) {
      if (!item.unread) return;
      counts.all += 1;
      counts[item.category] += 1;
    });
    return counts;
  },

  applyFilter: function () {
    var filter = this.data.activeFilter;
    var visibleMessages = filter === 'all'
      ? this.data.allMessages
      : this.data.allMessages.filter(function (item) {
        return item.category === filter;
      });
    this.setData({ visibleMessages: visibleMessages });
  },

  onFilterTap: function (event) {
    var filter = event.currentTarget.dataset.filter;
    if (['all', 'trip', 'interaction'].indexOf(filter) === -1) return;
    this.setData({ activeFilter: filter });
    this.applyFilter();
  },

  onMessageTap: function (event) {
    var message = this.data.visibleMessages[event.currentTarget.dataset.index];
    if (!message) return;
    if (message.category === 'trip') {
      if (message.needsHandling || !message.tripId) {
        wx.navigateTo({ url: '/pages/trip-notifications/trip-notifications' });
        return;
      }
      wx.navigateTo({
        url: '/pages/trip-detail/trip-detail?id=' + encodeURIComponent(message.tripId)
      });
      return;
    }
    if (message.postId) {
      wx.navigateTo({
        url: '/pages/community-detail/community-detail?id=' + encodeURIComponent(message.postId)
      });
      return;
    }
    if (message.kind === 'follow' && message.userId) {
      wx.navigateTo({
        url: '/pages/user-profile/user-profile?id=' + encodeURIComponent(message.userId)
      });
    }
  },

  onMarkAllRead: function () {
    if (this.data.counts.all <= 0 || this._markingRead) return;
    this._markingRead = true;
    var self = this;
    wx.showLoading({ title: '处理中...' });
    Promise.all([
      api.applyMarkRead(),
      api.communityNotificationsMarkRead()
    ]).then(function () {
      var allMessages = self.data.allMessages.map(function (item) {
        return Object.assign({}, item, { unread: false });
      });
      app.globalData.notificationsCache = null;
      self.setData({
        allMessages: allMessages,
        counts: { all: 0, trip: 0, interaction: 0 }
      });
      self.applyFilter();
      wx.hideLoading();
      wx.showToast({ title: '已全部标为已读', icon: 'success' });
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '操作失败，请重试', icon: 'none' });
    }).then(function () {
      self._markingRead = false;
    });
  },

  onRetry: function () {
    this.loadMessages();
  },

  onLogin: function () {
    auth.ensureLogin();
  }
});
