// pages/community/community.js
var app = getApp();
var auth = require('../../utils/auth.js');
var api = require('../../utils/api.js');

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
    this.loadPosts(true);
  },

  onShow: function () {
    if (app.globalData._communityPublishSuccess) {
      app.globalData._communityPublishSuccess = false;
      this.loadPosts(true);
    }
    auth.syncToApp(app);
  },

  loadPosts: function (reset) {
    if (this._loadingPosts) return Promise.resolve();
    if (reset) { this._cursor = 0; this._cursorId = ''; this.setData({ loading: true, error: false }); }
    if (!reset && (!this.data.hasMore || this.data.loading)) return Promise.resolve();
    this._loadingPosts = true;

    var self = this;
    var req = { pageSize: this.data.pageSize };
    if (!reset && this._cursor) { req.cursor = this._cursor; req.cursorId = this._cursorId; }

    return api.communityList(req).then(function (res) {
      var posts = (res.posts || []).map(function (p) { return self.formatPost(p); });
      var all = reset ? posts : self.data.posts.concat(posts);
      self._cursor = res.nextCursor || 0;
      self._cursorId = res.nextCursorId || '';
      self.setData({ posts: all, hasMore: res.hasMore !== false, loading: false, error: false });
    }).catch(function () {
      self.setData({ loading: false, error: reset });
      if (reset) wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    }).then(function () {
      self._loadingPosts = false;
    });
  },

  formatPost: function (post) {
    var count = (post.images || []).length;
    var layout = count === 1 ? 'grid-1' : count === 2 ? 'grid-2' : count >= 3 ? 'grid-3' : '';
    var urls = (post.images || []).map(function (img) { return img.url || ''; }).filter(Boolean);
    return Object.assign({}, post, {
      timeText: this.formatTime(post.createdAt),
      imageLayout: layout,
      imageUrls: urls,
      hasLocation: !!(post.location && post.location.name),
      likeCount: Math.max(0, Number(post.likeCount) || 0),
      isLiked: !!post.isLiked,
      isReviewing: !!post._reviewing
    });
  },

  formatTime: function (ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    var hrs = Math.floor(diff / 3600000);
    var days = Math.floor(hrs / 24);
    if (mins < 1) return '刚刚';
    if (mins < 60) return mins + '分钟前';
    if (hrs < 24) return hrs + '小时前';
    if (days < 7) return days + '天前';
    var d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },

  onPublish: function () {
    if (!auth.ensureLogin()) { auth.saveDeepLink('/pages/community-publish/community-publish'); return; }
    wx.navigateTo({ url: '/pages/community-publish/community-publish' });
  },

  onPreviewImage: function (e) {
    var urls = e.currentTarget.dataset.urls || [];
    var current = e.currentTarget.dataset.current || urls[0];
    wx.previewImage({ urls: urls, current: current });
  },

  onOpenLocation: function (e) {
    var lat = Number(e.currentTarget.dataset.lat);
    var lng = Number(e.currentTarget.dataset.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    wx.openLocation({ latitude: lat, longitude: lng, name: e.currentTarget.dataset.name || '', address: e.currentTarget.dataset.address || '', scale: 16 });
  },

  onLikeTap: function (e) {
    if (!auth.ensureLogin()) {
      auth.saveDeepLink('/pages/community/community');
      return;
    }

    var postId = e.currentTarget.dataset.postId;
    if (!postId) return;
    this._likingPosts = this._likingPosts || {};
    if (this._likingPosts[postId]) return;

    var index = this.data.posts.findIndex(function (post) {
      return post._id === postId;
    });
    if (index < 0) return;

    var previousLiked = !!this.data.posts[index].isLiked;
    var previousCount = Math.max(0, Number(this.data.posts[index].likeCount) || 0);
    var optimisticLiked = !previousLiked;
    var optimisticCount = Math.max(0, previousCount + (optimisticLiked ? 1 : -1));
    var optimisticData = {};
    optimisticData['posts[' + index + '].isLiked'] = optimisticLiked;
    optimisticData['posts[' + index + '].likeCount'] = optimisticCount;
    this.setData(optimisticData);
    this._likingPosts[postId] = true;

    var self = this;
    api.communityToggleLike(postId).then(function (res) {
      var currentIndex = self.data.posts.findIndex(function (post) {
        return post._id === postId;
      });
      if (currentIndex < 0) return;
      var confirmedData = {};
      confirmedData['posts[' + currentIndex + '].isLiked'] = !!res.liked;
      confirmedData['posts[' + currentIndex + '].likeCount'] = Math.max(0, Number(res.likeCount) || 0);
      self.setData(confirmedData);
    }).catch(function (err) {
      var currentIndex = self.data.posts.findIndex(function (post) {
        return post._id === postId;
      });
      if (currentIndex >= 0) {
        var rollbackData = {};
        rollbackData['posts[' + currentIndex + '].isLiked'] = previousLiked;
        rollbackData['posts[' + currentIndex + '].likeCount'] = previousCount;
        self.setData(rollbackData);
      }
      wx.showToast({ title: err.message || '点赞失败，请重试', icon: 'none' });
    }).then(function () {
      delete self._likingPosts[postId];
    });
  },

  onMoreTap: function (e) {
    var postId = e.currentTarget.dataset.postId;
    var isAuthor = e.currentTarget.dataset.isAuthor;
    var self = this;
    wx.showActionSheet({
      itemList: isAuthor ? ['删除动态'] : ['举报'],
      success: function (res) {
        if (res.tapIndex === 0) {
          if (isAuthor) { self.deletePost(postId); }
          else { wx.showToast({ title: '举报功能建设中', icon: 'none' }); }
        }
      }
    });
  },

  deletePost: function (postId) {
    var self = this;
    wx.showModal({
      title: '确认删除', content: '删除后无法恢复，确定删除这条动态吗？',
      success: function (res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        api.communityDelete(postId).then(function () {
          wx.hideLoading(); wx.showToast({ title: '已删除', icon: 'success' });
          self.setData({ posts: self.data.posts.filter(function (p) { return p._id !== postId; }) });
        }).catch(function (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        });
      }
    });
  },

  onRefresh: function () {
    this.setData({ refreshing: true });
    var self = this;
    this.loadPosts(true).then(function () {
      self.setData({ refreshing: false });
    });
  },

  onLoadMore: function () {
    if (this.data.loading || !this.data.hasMore) return;
    this.loadPosts(false);
  },

  onRetry: function () {
    this.loadPosts(true);
  },

  onShareAppMessage: function () {
    return { title: '社区 - 北上周边行', path: '/pages/community/community' };
  }
});
