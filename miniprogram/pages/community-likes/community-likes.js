var api = require('../../utils/api.js');

Page({
  data: {
    postId: '',
    likes: [],
    loading: true,
    error: false,
    hasMore: true
  },

  onLoad: function (options) {
    var postId = options && options.postId ? decodeURIComponent(options.postId) : '';
    if (!postId) {
      this.setData({ loading: false, error: true });
      return;
    }
    this.setData({ postId: postId });
    this.loadLikes(true);
  },

  loadLikes: function (reset) {
    if (this._loadingLikes) return Promise.resolve();
    if (!reset && !this.data.hasMore) return Promise.resolve();
    if (reset) {
      this._cursor = 0;
      this._cursorId = '';
    }

    this._loadingLikes = true;
    this.setData({ loading: true, error: false });
    var request = {
      postId: this.data.postId,
      pageSize: 20
    };
    if (!reset && this._cursor) {
      request.cursor = this._cursor;
      request.cursorId = this._cursorId;
    }

    var self = this;
    return api.communityLikeList(request).then(function (result) {
      var incoming = result.likes || [];
      self._cursor = result.nextCursor || 0;
      self._cursorId = result.nextCursorId || '';
      self.setData({
        likes: reset ? incoming : self.data.likes.concat(incoming),
        hasMore: result.hasMore === true,
        loading: false,
        error: false
      });
    }).catch(function (error) {
      self.setData({ loading: false, error: true });
      if (!reset) {
        wx.showToast({ title: error.message || '加载失败，请重试', icon: 'none' });
      }
    }).then(function () {
      self._loadingLikes = false;
    });
  },

  onOpenUserProfile: function (event) {
    var userId = event.currentTarget.dataset.userId;
    if (!userId) {
      wx.showToast({ title: '用户信息暂不可用', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/user-profile/user-profile?id=' + encodeURIComponent(userId)
    });
  },

  onRetry: function () {
    this.loadLikes(true);
  },

  onLoadMore: function () {
    this.loadLikes(this.data.likes.length === 0);
  },

  onReachBottom: function () {
    this.loadLikes(false);
  },

  onPullDownRefresh: function () {
    this.loadLikes(true).then(function () {
      wx.stopPullDownRefresh();
    });
  }
});
