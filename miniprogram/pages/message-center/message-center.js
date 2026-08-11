const app = getApp();
const auth = require('../../utils/auth.js');
const api = require('../../utils/api.js');

const PAGE_SIZE = 20;

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    loadingMore: false,
    error: false,
    activeFilter: 'all',
    visibleMessages: [],
    hasMore: false,
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
    const isLoggedIn = !!app.globalData.isLoggedIn;
    this.setData({ isLoggedIn: isLoggedIn });
    if (isLoggedIn) this.loadMessages({ reset: true, silent: this.data.visibleMessages.length > 0 });
  },

  onPullDownRefresh: function () {
    if (!this.data.isLoggedIn) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadMessages({ reset: true, silent: true }).then(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.hasMore) this.loadMessages({ reset: false, silent: true });
  },

  loadMessages: function (options) {
    options = options || {};
    const reset = options.reset !== false;
    if (!reset && this._loading) return this._loading;
    if (!reset && !this.data.hasMore) return Promise.resolve();

    if (reset) this._requestVersion = (this._requestVersion || 0) + 1;
    const requestVersion = this._requestVersion || 0;

    if (!options.silent) {
      this.setData({ loading: reset, loadingMore: !reset, error: false });
    } else if (!reset) {
      this.setData({ loadingMore: true });
    }

    const category = this.data.activeFilter === 'all' ? '' : this.data.activeFilter;
    const self = this;
    const request = api.notificationList({
      category: category,
      pageSize: PAGE_SIZE,
      cursor: reset ? 0 : (this._nextCursor || 0),
      cursorId: reset ? '' : (this._nextCursorId || '')
    }).then(function (result) {
      if (requestVersion !== self._requestVersion) return;
      const incoming = (result.notifications || []).map(function (item) {
        return self.formatNotification(item);
      });
      const visibleMessages = reset
        ? incoming
        : self.data.visibleMessages.concat(incoming);

      self._nextCursor = Number(result.nextCursor) || 0;
      self._nextCursorId = result.nextCursorId || '';
      self.setData({
        visibleMessages: visibleMessages,
        counts: result.unreadCounts || { all: 0, trip: 0, interaction: 0 },
        hasMore: !!result.hasMore,
        loading: false,
        loadingMore: false,
        error: false
      });
    }).catch(function (err) {
      if (requestVersion !== self._requestVersion) return;
      console.warn('消息中心加载失败', err);
      self.setData({
        loading: false,
        loadingMore: false,
        error: reset && self.data.visibleMessages.length === 0
      });
      if (!reset) wx.showToast({ title: '加载更多失败，请重试', icon: 'none' });
    }).then(function () {
      if (self._loading === request) self._loading = null;
    });
    this._loading = request;
    return request;
  },

  formatNotification: function (item) {
    const category = item.category || 'system';
    const isSystem = category === 'system';
    const actorName = item.actorName || '';
    const title = isSystem ? '系统通知' : (actorName || item.title || '消息通知');
    const actionText = isSystem
      ? (item.title || '状态已更新')
      : (item.actionText || item.title || '与你产生了互动');
    let preview = item.content || '';
    if (preview.length > 42) preview = preview.slice(0, 42) + '…';

    return {
      _id: item._id,
      category: category,
      type: item.type || '',
      title: title,
      actionText: actionText,
      preview: preview || this.getDefaultPreview(item),
      createdAt: Number(item.createdAt) || 0,
      timeText: this.formatMessageTime(item.createdAt),
      unread: !item.isRead,
      avatar: isSystem
        ? '/images/xing-logo.png'
        : (item.actorAvatar || (category === 'trip' ? item.thumbnail : '')),
      avatarText: isSystem ? '系' : ((actorName || '旅').slice(0, 1)),
      thumbnail: category === 'trip' ? '' : (item.thumbnail || ''),
      targetType: item.targetType || '',
      targetId: item.targetId || '',
      sourceType: item.sourceType || '',
      sourceId: item.sourceId || '',
      actorId: item.actorId || ''
    };
  },

  getDefaultPreview: function (item) {
    if (item.category === 'trip') return '查看行程最新状态';
    if (item.category === 'system') return '查看处理结果';
    if (item.type === 'user_follow') return '查看对方个人主页';
    return '查看这条动态';
  },

  formatMessageTime: function (timestamp) {
    const value = Number(timestamp) || 0;
    if (!value) return '';
    const now = new Date();
    const date = new Date(value);
    const sameYear = now.getFullYear() === date.getFullYear();
    const sameDay = sameYear && now.getMonth() === date.getMonth() && now.getDate() === date.getDate();
    const hourText = date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
    if (sameDay) return hourText;

    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (yesterday.getFullYear() === date.getFullYear() &&
      yesterday.getMonth() === date.getMonth() &&
      yesterday.getDate() === date.getDate()) {
      return '昨天 ' + hourText;
    }
    if (sameYear) return (date.getMonth() + 1) + '-' + date.getDate();
    return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
  },

  onFilterTap: function (event) {
    const filter = event.currentTarget.dataset.filter;
    if (['all', 'trip', 'interaction'].indexOf(filter) === -1 || filter === this.data.activeFilter) return;
    this._nextCursor = 0;
    this._nextCursorId = '';
    this.setData({
      activeFilter: filter,
      visibleMessages: [],
      hasMore: false,
      error: false
    });
    this.loadMessages({ reset: true });
  },

  onMessageTap: function (event) {
    const index = Number(event.currentTarget.dataset.index);
    const message = this.data.visibleMessages[index];
    if (!message) return;

    this.markOneRead(message, index);
    this.openMessageTarget(message);
  },

  markOneRead: function (message, index) {
    if (!message.unread) return;
    const update = {};
    update['visibleMessages[' + index + '].unread'] = false;
    update['counts.all'] = Math.max(0, Number(this.data.counts.all) - 1);
    if (message.category === 'trip' || message.category === 'interaction') {
      update['counts.' + message.category] = Math.max(0, Number(this.data.counts[message.category]) - 1);
    }
    this.setData(update);
    api.notificationMarkRead(message._id).catch(function (err) {
      console.warn('单条消息标记已读失败', err);
    });
  },

  openMessageTarget: function (message) {
    if (message.targetType === 'community_post' && message.targetId) {
      var communityUrl = '/pages/community-detail/community-detail?id=' +
        encodeURIComponent(message.targetId);
      if (message.sourceType === 'comment' || message.sourceType === 'reply') {
        communityUrl += '&focus=comments&commentId=' + encodeURIComponent(message.sourceId || '');
      }
      wx.navigateTo({
        url: communityUrl,
        fail: function () { wx.showToast({ title: '该内容暂时无法查看', icon: 'none' }); }
      });
      return;
    }
    if (message.targetType === 'user' && message.targetId) {
      wx.navigateTo({
        url: '/pages/user-profile/user-profile?id=' + encodeURIComponent(message.targetId),
        fail: function () { wx.showToast({ title: '该用户暂时无法查看', icon: 'none' }); }
      });
      return;
    }
    if (message.targetType === 'my_works') {
      wx.navigateTo({ url: '/pages/community-mine/community-mine' });
      return;
    }
    if (message.type === 'trip_apply_received') {
      wx.navigateTo({ url: '/pages/trip-notifications/trip-notifications' });
      return;
    }
    if (message.targetType === 'trip' && message.targetId) {
      var tripUrl = '/pages/trip-detail/trip-detail?id=' + encodeURIComponent(message.targetId);
      if (message.sourceType === 'comment' || message.sourceType === 'reply') {
        tripUrl += '&focus=comments&commentId=' + encodeURIComponent(message.sourceId || '');
      }
      wx.navigateTo({
        url: tripUrl,
        fail: function () { wx.showToast({ title: '该行程暂时无法查看', icon: 'none' }); }
      });
      return;
    }
    wx.showToast({ title: '相关内容已不存在', icon: 'none' });
  },

  onMarkAllRead: function () {
    if (this.data.counts.all <= 0 || this._markingRead) return;
    this._markingRead = true;
    const self = this;
    wx.showLoading({ title: '处理中...' });
    api.notificationMarkAllRead('').then(function () {
      const visibleMessages = self.data.visibleMessages.map(function (item) {
        return Object.assign({}, item, { unread: false });
      });
      self.setData({
        visibleMessages: visibleMessages,
        counts: { all: 0, trip: 0, interaction: 0 }
      });
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
    this.loadMessages({ reset: true });
  },

  onLogin: function () {
    auth.ensureLogin();
  }
});
