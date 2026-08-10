var api = require('../../utils/api.js');
var auth = require('../../utils/auth.js');

Page({
  data: {
    posts: [],
    loading: true,
    error: false,
    refreshing: false,
    hasMore: true,
    pageSize: 10
  },

  onLoad: function () {
    if (!auth.ensureLogin()) return;
    this.loadPosts(true);
  },

  onShow: function () {
    this._pageVisible = true;
    if (this._loaded && auth.isLoggedIn()) {
      this.loadPosts(true);
    }
    this._loaded = true;
  },

  onHide: function () {
    this._pageVisible = false;
    this.clearReviewTimer();
  },

  onUnload: function () {
    this._pageVisible = false;
    this.clearReviewTimer();
  },

  loadPosts: function (reset, silent) {
    if (this._loadingPosts) return Promise.resolve();
    if (reset) {
      this._cursor = 0;
      this._cursorId = '';
      if (!silent) this.setData({ loading: true, error: false });
    }
    if (!reset && (!this.data.hasMore || this.data.loading)) return Promise.resolve();

    this._loadingPosts = true;
    var self = this;
    var request = { pageSize: this.data.pageSize };
    if (!reset && this._cursor) {
      request.cursor = this._cursor;
      request.cursorId = this._cursorId;
    }

    return api.communityMy(request).then(function (res) {
      var posts = (res.posts || []).map(function (post) {
        return self.formatPost(post);
      });
      self._cursor = res.nextCursor || 0;
      self._cursorId = res.nextCursorId || '';
      self.setData({
        posts: reset ? posts : self.data.posts.concat(posts),
        hasMore: res.hasMore !== false,
        loading: false,
        error: false
      });
      self.scheduleReviewRefresh();
    }).catch(function () {
      self.setData({ loading: false, error: reset });
      if (reset) wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    }).then(function () {
      self._loadingPosts = false;
    });
  },

  clearReviewTimer: function () {
    if (this._reviewTimer) {
      clearTimeout(this._reviewTimer);
      this._reviewTimer = null;
    }
  },

  scheduleReviewRefresh: function () {
    this.clearReviewTimer();
    if (!this._pageVisible) return;
    var hasReviewing = this.data.posts.some(function (post) {
      return post.reviewStatus === 'reviewing';
    });
    if (!hasReviewing) return;

    var self = this;
    this._reviewTimer = setTimeout(function () {
      self._reviewTimer = null;
      if (self._pageVisible) self.loadPosts(true, true);
    }, 5000);
  },

  formatPost: function (post) {
    var count = (post.images || []).length;
    var statusMap = {
      approved: { text: '已发布', className: 'approved' },
      reviewing: { text: '审核中', className: 'reviewing' },
      manual_review: { text: '待人工审核', className: 'manual-review' },
      rejected: { text: '审核未通过', className: 'rejected' }
    };
    var status = post.reviewStatus === 'approved' && post.machineSuggest === 'review'
      ? { text: '已发布 · 待复核', className: 'pending-review' }
      : statusMap[post.reviewStatus] || {
      text: '处理中',
      className: 'reviewing'
      };
    var urls = (post.images || []).map(function (image) {
      return image.url || '';
    }).filter(Boolean);

    return Object.assign({}, post, {
      timeText: this.formatTime(post.createdAt),
      statusText: status.text,
      statusClass: status.className,
      imageLayout: count === 1 ? 'grid-1' : count === 2 ? 'grid-2' : count >= 3 ? 'grid-3' : '',
      imageUrls: urls,
      hasLocation: !!(post.location && post.location.name)
    });
  },

  formatTime: function (timestamp) {
    if (!timestamp) return '';
    var date = new Date(timestamp);
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    var hour = String(date.getHours()).padStart(2, '0');
    var minute = String(date.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
  },

  onPreviewImage: function (event) {
    var urls = event.currentTarget.dataset.urls || [];
    var current = event.currentTarget.dataset.current || urls[0];
    if (urls.length > 0) wx.previewImage({ urls: urls, current: current });
  },

  onOpenLocation: function (event) {
    var latitude = Number(event.currentTarget.dataset.lat);
    var longitude = Number(event.currentTarget.dataset.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    wx.openLocation({
      latitude: latitude,
      longitude: longitude,
      name: event.currentTarget.dataset.name || '',
      address: event.currentTarget.dataset.address || '',
      scale: 16
    });
  },

  onMoreTap: function (event) {
    var postId = event.currentTarget.dataset.id;
    var self = this;
    wx.showActionSheet({
      itemList: ['删除作品'],
      success: function (result) {
        if (result.tapIndex === 0) self.confirmDelete(postId);
      }
    });
  },

  confirmDelete: function (postId) {
    var self = this;
    wx.showModal({
      title: '删除作品',
      content: '删除后无法恢复，确定删除吗？',
      success: function (result) {
        if (!result.confirm) return;
        wx.showLoading({ title: '删除中...' });
        api.communityDelete(postId).then(function () {
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          self.setData({
            posts: self.data.posts.filter(function (post) {
              return post._id !== postId;
            })
          });
        }).catch(function (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        });
      }
    });
  },

  onRefresh: function () {
    var self = this;
    this.setData({ refreshing: true });
    this.loadPosts(true).then(function () {
      self.setData({ refreshing: false });
    });
  },

  onLoadMore: function () {
    this.loadPosts(false);
  },

  onRetry: function () {
    this.loadPosts(true);
  }
});
