var app = getApp();
var auth = require('../../utils/auth.js');
var api = require('../../utils/api.js');

Page({
  data: {
    post: null,
    loading: true,
    error: false,
    likers: [],
    likersLoading: false,
    comments: [],
    commentsLoading: false,
    commentsError: false,
    commentsHasMore: false,
    commentDraft: '',
    inputFocused: false,
    submittingComment: false
  },

  onLoad: function (options) {
    this._postId = options && options.id ? decodeURIComponent(options.id) : '';
    this.bindOpenerData();
    this.restoreCachedPost();
  },

  onUnload: function () {
    this.emitPostUpdate();
  },

  bindOpenerData: function () {
    if (!this.getOpenerEventChannel) return;
    var eventChannel = this.getOpenerEventChannel();
    if (!eventChannel || !eventChannel.on) return;
    var self = this;
    eventChannel.on('postData', function (payload) {
      if (payload && payload.post) self.applyPost(payload.post);
    });
  },

  restoreCachedPost: function () {
    if (!this._postId) {
      this.setData({ loading: false, error: true });
      return;
    }
    try {
      var cached = wx.getStorageSync('communityDetailPost:' + this._postId);
      if (cached && cached._id === this._postId) this.applyPost(cached);
    } catch (cacheErr) {
      console.warn('读取动态详情缓存失败:', cacheErr);
    }
  },

  applyPost: function (post) {
    var count = (post.images || []).length;
    var imageUrls = (post.images || []).map(function (image) {
      return image.url || '';
    }).filter(Boolean);
    var likers = Array.isArray(post.likePreview) ? post.likePreview : [];

    var shouldLoadLikers = this._likersPostId !== post._id;
    var shouldLoadComments = this._commentsPostId !== post._id;
    this.setData({
      post: Object.assign({}, post, {
        timeText: post.timeText || this.formatTime(post.createdAt),
        imageLayout: post.imageLayout || (count === 1 ? 'grid-1' : count === 2 ? 'grid-2' : count >= 3 ? 'grid-3' : ''),
        imageUrls: post.imageUrls || imageUrls,
        hasLocation: post.hasLocation !== undefined
          ? post.hasLocation
          : !!(post.location && post.location.name),
        likeCount: Math.max(0, Number(post.likeCount) || 0),
        commentCount: Math.max(0, Number(post.commentCount) || 0),
        isLiked: !!post.isLiked
      }),
      likers: likers,
      comments: Array.isArray(post.commentPreview) ? post.commentPreview : [],
      loading: false,
      error: false
    }, function () {
      if (shouldLoadLikers) {
        this._likersPostId = post._id;
        this.loadLikers();
      }
      if (shouldLoadComments) {
        this._commentsPostId = post._id;
        this.loadComments(true);
      }
    });
  },

  loadLikers: function () {
    if (!this.data.post) return Promise.resolve();
    if (this._loadingLikers) {
      this._reloadLikersAfterCurrent = true;
      return Promise.resolve();
    }
    this._loadingLikers = true;
    this.setData({ likersLoading: true });
    var self = this;
    return api.communityLikeList({
      postId: this.data.post._id,
      pageSize: 12
    }).then(function (result) {
      var nextData = {
        likers: result.likes || [],
        likersLoading: false
      };
      if (Number.isFinite(Number(result.likeCount))) {
        nextData['post.likeCount'] = Math.max(0, Number(result.likeCount));
      }
      self.setData(nextData);
    }).catch(function () {
      self.setData({ likersLoading: false });
    }).then(function () {
      self._loadingLikers = false;
      if (self._reloadLikersAfterCurrent) {
        self._reloadLikersAfterCurrent = false;
        self.loadLikers();
      }
    });
  },

  formatComment: function (comment) {
    var currentUserId = app.globalData.openid || wx.getStorageSync('openid') || '';
    var postAuthorId = this.data.post && this.data.post.authorId || '';
    return Object.assign({}, comment, {
      timeText: comment.timeText || this.formatTime(comment.createdAt),
      likeCount: Math.max(0, Number(comment.likeCount) || 0),
      canDelete: !!currentUserId &&
        (comment.authorId === currentUserId || postAuthorId === currentUserId)
    });
  },

  loadComments: function (reset) {
    if (!this.data.post || this._loadingComments) return Promise.resolve();
    if (!reset && !this.data.commentsHasMore) return Promise.resolve();
    if (reset) {
      this._commentCursor = 0;
      this._commentCursorId = '';
    }

    this._loadingComments = true;
    this.setData({ commentsLoading: true, commentsError: false });
    var request = {
      postId: this.data.post._id,
      pageSize: 20
    };
    if (!reset && this._commentCursor) {
      request.cursor = this._commentCursor;
      request.cursorId = this._commentCursorId;
    }

    var self = this;
    return api.communityCommentList(request).then(function (result) {
      var incoming = (result.comments || []).map(function (comment) {
        return self.formatComment(comment);
      });
      self._commentCursor = result.nextCursor || 0;
      self._commentCursorId = result.nextCursorId || '';
      var nextData = {
        comments: reset ? incoming : self.data.comments.concat(incoming),
        commentsHasMore: result.hasMore === true,
        commentsLoading: false,
        commentsError: false
      };
      if (self.data.post && Number.isFinite(Number(result.commentCount))) {
        nextData['post.commentCount'] = Math.max(0, Number(result.commentCount));
      }
      self.setData(nextData);
    }).catch(function (error) {
      self.setData({
        commentsLoading: false,
        commentsError: true
      });
      if (!reset) {
        wx.showToast({ title: error.message || '评论加载失败', icon: 'none' });
      }
    }).then(function () {
      self._loadingComments = false;
    });
  },

  formatTime: function (timestamp) {
    if (!timestamp) return '';
    var diff = Date.now() - Number(timestamp);
    var minutes = Math.floor(diff / 60000);
    var hours = Math.floor(diff / 3600000);
    var days = Math.floor(hours / 24);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + '分钟前';
    if (hours < 24) return hours + '小时前';
    if (days < 7) return days + '天前';
    var date = new Date(timestamp);
    return (date.getMonth() + 1) + '月' + date.getDate() + '日';
  },

  onPreviewImage: function (event) {
    var urls = event.currentTarget.dataset.urls || [];
    var current = event.currentTarget.dataset.current || urls[0];
    if (urls.length > 0) wx.previewImage({ urls: urls, current: current });
  },

  onOpenLocation: function () {
    var location = this.data.post && this.data.post.location;
    if (!location) return;
    var latitude = Number(location.latitude);
    var longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    wx.openLocation({
      latitude: latitude,
      longitude: longitude,
      name: location.name || '',
      address: location.address || '',
      scale: 16
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

  onViewAllLikes: function () {
    if (!this.data.post || !this.data.post._id || this.data.post.likeCount <= 0) return;
    wx.navigateTo({
      url: '/pages/community-likes/community-likes?postId=' +
        encodeURIComponent(this.data.post._id)
    });
  },

  onLikeTap: function () {
    if (!this.data.post || this._liking) return;
    if (!auth.ensureLogin()) {
      auth.saveDeepLink('/pages/community-detail/community-detail?id=' + encodeURIComponent(this.data.post._id));
      return;
    }

    var previousLiked = !!this.data.post.isLiked;
    var previousCount = Math.max(0, Number(this.data.post.likeCount) || 0);
    var previousLikers = this.data.likers.slice();
    var nextLiked = !previousLiked;
    var nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));
    var userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {};
    var currentUserId = app.globalData.openid || wx.getStorageSync('openid') || 'current-user';
    var optimisticLikers = previousLikers.slice();

    if (nextLiked && !optimisticLikers.some(function (item) { return item.userId === currentUserId; })) {
      optimisticLikers.unshift({
        userId: currentUserId,
        userName: userInfo.nickname || '我',
        userAvatar: userInfo.avatar || ''
      });
    }
    if (!nextLiked) {
      optimisticLikers = optimisticLikers.filter(function (item) {
        return item.userId !== currentUserId;
      });
    }

    this.setData({
      'post.isLiked': nextLiked,
      'post.likeCount': nextCount,
      likers: optimisticLikers
    });
    this._liking = true;

    var self = this;
    api.communityToggleLike(this.data.post._id).then(function (result) {
      self.setData({
        'post.isLiked': !!result.liked,
        'post.likeCount': Math.max(0, Number(result.likeCount) || 0)
      });
      self.cachePost();
      self.emitPostUpdate();
      self.loadLikers();
    }).catch(function (error) {
      self.setData({
        'post.isLiked': previousLiked,
        'post.likeCount': previousCount,
        likers: previousLikers
      });
      wx.showToast({ title: error.message || '点赞失败，请重试', icon: 'none' });
    }).then(function () {
      self._liking = false;
    });
  },

  onCommentTap: function () {
    this.setData({ inputFocused: true });
  },

  onInput: function (event) {
    this.setData({ commentDraft: event.detail.value || '' });
  },

  onInputFocus: function () {
    this.setData({ inputFocused: true });
  },

  onInputBlur: function () {
    this.setData({ inputFocused: false });
  },

  onCommentConfirm: function () {
    var content = String(this.data.commentDraft || '').trim();
    if (!content || !this.data.post || this.data.submittingComment) return;
    if (!auth.ensureLogin()) {
      auth.saveDeepLink('/pages/community-detail/community-detail?id=' +
        encodeURIComponent(this.data.post._id));
      return;
    }

    this.setData({ submittingComment: true });
    wx.showLoading({ title: '评论中...', mask: true });
    var self = this;
    api.communityCommentCreate(this.data.post._id, content).then(function (result) {
      var comment = self.formatComment(result.comment || {});
      var commentCount = Math.max(
        0,
        Number(result.commentCount) || (Number(self.data.post.commentCount) || 0) + 1
      );
      self.setData({
        comments: [comment].concat(self.data.comments),
        commentDraft: '',
        inputFocused: false,
        submittingComment: false,
        commentsError: false,
        'post.commentCount': commentCount
      });
      self.cachePost();
      self.emitPostUpdate();
      wx.hideLoading();
      wx.showToast({ title: '评论成功', icon: 'success' });
    }).catch(function (error) {
      self.setData({ submittingComment: false });
      wx.hideLoading();
      wx.showToast({ title: error.message || '评论失败，请重试', icon: 'none' });
    });
  },

  onLoadMoreComments: function () {
    this.loadComments(this.data.comments.length === 0);
  },

  onCommentLongPress: function (event) {
    var commentId = event.currentTarget.dataset.commentId;
    var comment = this.data.comments.find(function (item) {
      return item._id === commentId;
    });
    if (!comment || !comment.canDelete || this._deletingCommentId) return;

    var self = this;
    wx.showActionSheet({
      itemList: ['删除'],
      itemColor: '#FF4D4F',
      success: function (result) {
        if (result.tapIndex === 0) self.deleteComment(commentId);
      }
    });
  },

  deleteComment: function (commentId) {
    if (!this.data.post || !commentId || this._deletingCommentId) return;
    this._deletingCommentId = commentId;
    wx.showLoading({ title: '删除中...', mask: true });
    var self = this;
    api.communityCommentDelete(this.data.post._id, commentId).then(function (result) {
      self.setData({
        comments: self.data.comments.filter(function (comment) {
          return comment._id !== commentId;
        }),
        'post.commentCount': Math.max(0, Number(result.commentCount) || 0)
      });
      self.cachePost();
      self.emitPostUpdate();
      wx.hideLoading();
      wx.showToast({ title: '已删除', icon: 'success' });
    }).catch(function (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || '删除失败，请重试', icon: 'none' });
    }).then(function () {
      self._deletingCommentId = '';
    });
  },

  cachePost: function () {
    if (!this.data.post) return;
    try {
      wx.setStorageSync('communityDetailPost:' + this.data.post._id, this.data.post);
    } catch (cacheErr) {
      console.warn('更新动态详情缓存失败:', cacheErr);
    }
  },

  emitPostUpdate: function () {
    if (!this.data.post || !this.getOpenerEventChannel) return;
    var eventChannel = this.getOpenerEventChannel();
    if (eventChannel && eventChannel.emit) {
      eventChannel.emit('postUpdated', {
        _id: this.data.post._id,
        isLiked: !!this.data.post.isLiked,
        likeCount: Math.max(0, Number(this.data.post.likeCount) || 0),
        commentCount: Math.max(0, Number(this.data.post.commentCount) || 0)
      });
    }
  }
});
