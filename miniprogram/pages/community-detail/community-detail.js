var app = getApp();
var auth = require('../../utils/auth.js');
var api = require('../../utils/api.js');

Page({
  data: {
    post: null,
    loading: true,
    error: false,
    errorMessage: '',
    likers: [],
    likersLoading: false,
    comments: [],
    commentsLoading: false,
    commentsError: false,
    commentsHasMore: false,
    commentDraft: '',
    commentPlaceholder: '说点什么…',
    replyTarget: null,
    inputFocused: false,
    submittingComment: false,
    scrollIntoView: '',
    showPostActions: false,
    deletingPost: false
  },

  onLoad: function (options) {
    this._postId = options && options.id ? decodeURIComponent(options.id) : '';
    this._focusSection = options && options.focus || '';
    this._focusCommentId = options && options.commentId
      ? decodeURIComponent(options.commentId)
      : '';
    this.bindOpenerData();
    this.restoreCachedPost();
    this.loadPost();
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
      if (payload && payload.post) self.applyPost(payload.post, { source: 'opener' });
    });
  },

  restoreCachedPost: function () {
    if (!this._postId) {
      this.setData({ loading: false, error: true });
      return;
    }
    try {
      var cached = wx.getStorageSync('communityDetailPost:' + this._postId);
      if (cached && cached._id === this._postId) this.applyPost(cached, { source: 'cache' });
    } catch (cacheErr) {
      console.warn('读取动态详情缓存失败:', cacheErr);
    }
  },

  loadPost: function () {
    if (!this._postId || this._loadingPost) return Promise.resolve();
    this._loadingPost = true;
    var self = this;
    return api.communityGet(this._postId).then(function (result) {
      if (!result.post) throw new Error('动态数据不存在');
      self.applyPost(result.post, { source: 'server' });
      self.cachePost();
    }).catch(function (error) {
      var errorCode = error && error.result && error.result.errorCode || '';
      if (errorCode === 'POST_UNAVAILABLE') {
        try { wx.removeStorageSync('communityDetailPost:' + self._postId); } catch (e) { /* ignore */ }
        self.setData({
          post: null,
          loading: false,
          error: true,
          errorMessage: error.message || '该内容已删除或暂不可查看'
        });
      } else if (self.data.post) {
        self.setData({ loading: false, error: false });
        wx.showToast({ title: '内容刷新失败，已展示缓存', icon: 'none' });
      } else {
        self.setData({
          post: null,
          loading: false,
          error: true,
          errorMessage: error.message || '内容加载失败，请重试'
        });
      }
      console.warn('动态详情加载失败:', error.message || error);
    }).then(function () {
      self._loadingPost = false;
    });
  },

  focusNotificationTarget: function () {
    if (this._focusSection !== 'comments' || !this.data.post) return;
    this._focusSection = '';
    var self = this;
    wx.nextTick(function () {
      self.setData({ scrollIntoView: '' }, function () {
        self.setData({ scrollIntoView: 'comments-section' });
      });
    });
  },

  onRetryLoad: function () {
    if (this._loadingPost) return;
    this.setData({ loading: true, error: false, errorMessage: '' });
    this.loadPost();
  },

  applyPost: function (post, options) {
    options = options || {};
    var priorityMap = { cache: 1, opener: 2, server: 3 };
    var priority = priorityMap[options.source] || 2;
    var currentPost = this.data.post && this.data.post._id === post._id
      ? this.data.post
      : null;
    if (currentPost && priority < (this._postDataPriority || 0)) return;

    var isNewPost = !currentPost;
    var mergedPost = Object.assign({}, currentPost || {}, post);
    if (!post.authorAvatar && currentPost && currentPost.authorAvatar) {
      mergedPost.authorAvatar = currentPost.authorAvatar;
    }
    if (!post.authorName && currentPost && currentPost.authorName) {
      mergedPost.authorName = currentPost.authorName;
    }
    this._postDataPriority = priority;

    var count = (mergedPost.images || []).length;
    var imageUrls = (mergedPost.images || []).map(function (image) {
      return image.url || '';
    }).filter(Boolean);
    var likers = Array.isArray(post.likePreview) ? post.likePreview : [];

    var shouldLoadLikers = this._likersPostId !== post._id;
    var shouldLoadComments = this._commentsPostId !== post._id;
    if (shouldLoadLikers) this._likersPostId = post._id;
    if (shouldLoadComments) this._commentsPostId = post._id;
    var nextData = {
      post: Object.assign({}, mergedPost, {
        timeText: mergedPost.timeText || this.formatTime(mergedPost.createdAt),
        imageLayout: mergedPost.imageLayout || (count === 1 ? 'grid-1' : count === 2 ? 'grid-2' : count >= 3 ? 'grid-3' : ''),
        imageUrls: mergedPost.imageUrls || imageUrls,
        hasLocation: mergedPost.hasLocation !== undefined
          ? mergedPost.hasLocation
          : !!(mergedPost.location && mergedPost.location.name),
        likeCount: Math.max(0, Number(mergedPost.likeCount) || 0),
        commentCount: Math.max(0, Number(mergedPost.commentCount) || 0),
        isLiked: !!mergedPost.isLiked
      }),
      loading: false,
      error: false,
      errorMessage: ''
    };
    // Likes and comments have their own requests. A later post refresh must
    // never erase lists that have already finished loading.
    if (isNewPost) {
      nextData.likers = likers;
      nextData.comments = Array.isArray(post.commentPreview) ? post.commentPreview : [];
    }
    this.setData(nextData, function () {
      if (shouldLoadLikers) {
        this.loadLikers();
      }
      if (shouldLoadComments) {
        this.loadComments(true);
      }
      this.focusNotificationTarget();
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
    var requestPostId = this.data.post._id;
    return api.communityLikeList({
      postId: requestPostId,
      pageSize: 12
    }).then(function (result) {
      if (!self.data.post || self.data.post._id !== requestPostId) return;
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
    var self = this;
    return Object.assign({}, comment, {
      timeText: comment.timeText || this.formatTime(comment.createdAt),
      likeCount: Math.max(0, Number(comment.likeCount) || 0),
      replyCount: Math.max(0, Number(comment.replyCount) || 0),
      replies: (comment.replies || []).map(function (reply) {
        return self.formatReply(reply);
      }),
      repliesHasMore: comment.repliesHasMore === true,
      repliesLoading: false,
      nextReplyCursor: comment.nextReplyCursor || 0,
      nextReplyCursorId: comment.nextReplyCursorId || '',
      canDelete: !!currentUserId &&
        (comment.authorId === currentUserId || postAuthorId === currentUserId)
    });
  },

  formatReply: function (reply) {
    var currentUserId = app.globalData.openid || wx.getStorageSync('openid') || '';
    var postAuthorId = this.data.post && this.data.post.authorId || '';
    return Object.assign({}, reply, {
      timeText: reply.timeText || this.formatTime(reply.createdAt),
      likeCount: Math.max(0, Number(reply.likeCount) || 0),
      canDelete: !!currentUserId &&
        (reply.authorId === currentUserId || postAuthorId === currentUserId)
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
    var requestPostId = request.postId;
    if (!reset && this._commentCursor) {
      request.cursor = this._commentCursor;
      request.cursorId = this._commentCursorId;
    }

    var self = this;
    return api.communityCommentList(request).then(function (result) {
      if (!self.data.post || self.data.post._id !== requestPostId) return;
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
    this.setData({
      replyTarget: null,
      commentPlaceholder: '说点什么…',
      inputFocused: true
    });
  },

  onReplyTap: function (event) {
    if (!this.data.post) return;
    if (!auth.ensureLogin()) {
      auth.saveDeepLink('/pages/community-detail/community-detail?id=' +
        encodeURIComponent(this.data.post._id));
      return;
    }
    var targetId = event.currentTarget.dataset.targetId;
    var targetType = event.currentTarget.dataset.targetType;
    var rootCommentId = event.currentTarget.dataset.rootCommentId || targetId;
    var userName = event.currentTarget.dataset.userName || '旅行者';
    if (!targetId || ['comment', 'reply'].indexOf(targetType) === -1) return;
    this.setData({
      replyTarget: {
        id: targetId,
        type: targetType,
        rootCommentId: rootCommentId,
        userName: userName
      },
      commentPlaceholder: '回复给' + userName,
      inputFocused: true
    });
  },

  onCommentLikeTap: function () {
    // 评论点赞不在当前版本范围内。
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
    var replyTarget = this.data.replyTarget;
    wx.showLoading({ title: replyTarget ? '回复中...' : '评论中...', mask: true });
    var self = this;
    api.communityCommentCreate(this.data.post._id, content, replyTarget).then(function (result) {
      var comment = self.formatComment(result.comment || {});
      var commentCount = Math.max(
        0,
        Number(result.commentCount) || (Number(self.data.post.commentCount) || 0) + 1
      );
      var nextComments = self.data.comments.slice();
      if (result.isReply) {
        var rootIndex = nextComments.findIndex(function (item) {
          return item._id === result.rootCommentId;
        });
        if (rootIndex >= 0) {
          var reply = self.formatReply(result.comment || {});
          var root = Object.assign({}, nextComments[rootIndex]);
          root.replies = (root.replies || []).concat([reply]);
          root.replyCount = Math.max(
            root.replies.length,
            Number(result.rootReplyCount) || root.replyCount + 1
          );
          nextComments[rootIndex] = root;
        }
      } else {
        nextComments.unshift(comment);
      }
      self.setData({
        comments: nextComments,
        commentDraft: '',
        commentPlaceholder: '说点什么…',
        replyTarget: null,
        inputFocused: false,
        submittingComment: false,
        commentsError: false,
        'post.commentCount': commentCount
      });
      self.cachePost();
      self.emitPostUpdate();
      wx.hideLoading();
      wx.showToast({ title: result.isReply ? '回复成功' : '评论成功', icon: 'success' });
    }).catch(function (error) {
      self.setData({ submittingComment: false });
      wx.hideLoading();
      wx.showToast({
        title: error.message || (replyTarget ? '回复失败，请重试' : '评论失败，请重试'),
        icon: 'none'
      });
    });
  },

  onLoadMoreComments: function () {
    this.loadComments(this.data.comments.length === 0);
  },

  onLoadMoreReplies: function (event) {
    var rootCommentId = event.currentTarget.dataset.rootCommentId;
    var index = this.data.comments.findIndex(function (comment) {
      return comment._id === rootCommentId;
    });
    if (index < 0 || this.data.comments[index].repliesLoading) return;

    var root = this.data.comments[index];
    var loadingData = {};
    loadingData['comments[' + index + '].repliesLoading'] = true;
    this.setData(loadingData);
    var request = {
      postId: this.data.post._id,
      rootCommentId: rootCommentId,
      pageSize: 20
    };
    if (root.nextReplyCursor) {
      request.cursor = root.nextReplyCursor;
      request.cursorId = root.nextReplyCursorId;
    }

    var self = this;
    api.communityReplyList(request).then(function (result) {
      var currentIndex = self.data.comments.findIndex(function (comment) {
        return comment._id === rootCommentId;
      });
      if (currentIndex < 0) return;
      var existing = self.data.comments[currentIndex].replies || [];
      var seen = {};
      existing.forEach(function (reply) { seen[reply._id] = true; });
      var incoming = (result.replies || []).map(function (reply) {
        return self.formatReply(reply);
      }).filter(function (reply) {
        return !seen[reply._id];
      });
      var nextData = {};
      nextData['comments[' + currentIndex + '].replies'] = existing.concat(incoming);
      nextData['comments[' + currentIndex + '].replyCount'] =
        Math.max(0, Number(result.replyCount) || 0);
      nextData['comments[' + currentIndex + '].repliesHasMore'] = result.hasMore === true;
      nextData['comments[' + currentIndex + '].repliesLoading'] = false;
      nextData['comments[' + currentIndex + '].nextReplyCursor'] = result.nextCursor || 0;
      nextData['comments[' + currentIndex + '].nextReplyCursorId'] = result.nextCursorId || '';
      self.setData(nextData);
    }).catch(function (error) {
      var currentIndex = self.data.comments.findIndex(function (comment) {
        return comment._id === rootCommentId;
      });
      if (currentIndex >= 0) {
        var nextData = {};
        nextData['comments[' + currentIndex + '].repliesLoading'] = false;
        self.setData(nextData);
      }
      wx.showToast({ title: error.message || '回复加载失败', icon: 'none' });
    });
  },

  onCommentLongPress: function (event) {
    var commentId = event.currentTarget.dataset.commentId;
    var targetType = event.currentTarget.dataset.targetType || 'comment';
    var rootCommentId = event.currentTarget.dataset.rootCommentId || commentId;
    var comment;
    if (targetType === 'reply') {
      var root = this.data.comments.find(function (item) {
        return item._id === rootCommentId;
      });
      comment = root && (root.replies || []).find(function (reply) {
        return reply._id === commentId;
      });
    } else {
      comment = this.data.comments.find(function (item) {
        return item._id === commentId;
      });
    }
    if (!comment || !comment.canDelete || this._deletingCommentId) return;

    var self = this;
    wx.showActionSheet({
      itemList: ['删除'],
      itemColor: '#FF4D4F',
      success: function (result) {
        if (result.tapIndex === 0) {
          self.deleteComment(commentId, targetType, rootCommentId);
        }
      }
    });
  },

  onPostMoreTap: function () {
    if (!this.data.post) return;
    this.setData({ showPostActions: true });
  },

  onClosePostActions: function () {
    if (this.data.deletingPost) return;
    this.setData({ showPostActions: false });
  },

  onPostActionsPanelTap: function () {},

  onReportPostTap: function () {
    if (!this.data.post || this.data.post.isAuthor) return;
    var postId = this.data.post._id;
    this.setData({ showPostActions: false });
    wx.navigateTo({
      url: '/pages/report/report?type=community_post&id=' + encodeURIComponent(postId)
    });
  },

  onDeletePostTap: function () {
    if (!this.data.post || !this.data.post.isAuthor || this.data.deletingPost) return;
    var self = this;
    this.setData({ showPostActions: false });
    wx.showModal({
      title: '删除动态',
      content: '删除后无法恢复，确定删除吗？',
      confirmColor: '#FF4D4F',
      success: function (result) {
        if (!result.confirm) return;
        self.deletePost();
      }
    });
  },

  deletePost: function () {
    if (!this.data.post || this.data.deletingPost) return;
    var postId = this.data.post._id;
    this.setData({ deletingPost: true });
    wx.showLoading({ title: '删除中...', mask: true });
    var self = this;
    api.communityDelete(postId).then(function () {
      try { wx.removeStorageSync('communityDetailPost:' + postId); } catch (e) { /* ignore */ }
      wx.hideLoading();
      wx.showToast({ title: '已删除', icon: 'success' });
      setTimeout(function () {
        var pages = getCurrentPages();
        if (pages.length > 1) wx.navigateBack();
        else wx.switchTab({ url: '/pages/community/community' });
      }, 500);
    }).catch(function (error) {
      wx.hideLoading();
      self.setData({ deletingPost: false });
      wx.showToast({ title: error.message || '删除失败，请重试', icon: 'none' });
    });
  },

  deleteComment: function (commentId, targetType, rootCommentId) {
    if (!this.data.post || !commentId || this._deletingCommentId) return;
    this._deletingCommentId = targetType + ':' + commentId;
    wx.showLoading({ title: '删除中...', mask: true });
    var self = this;
    api.communityCommentDelete(this.data.post._id, commentId, targetType).then(function (result) {
      var nextComments = self.data.comments.slice();
      if (targetType === 'reply') {
        var rootIndex = nextComments.findIndex(function (comment) {
          return comment._id === rootCommentId;
        });
        if (rootIndex >= 0) {
          var root = Object.assign({}, nextComments[rootIndex]);
          root.replies = (root.replies || []).filter(function (reply) {
            return reply._id !== commentId;
          });
          root.replyCount = Math.max(0, Number(result.rootReplyCount) || 0);
          nextComments[rootIndex] = root;
        }
      } else {
        nextComments = nextComments.filter(function (comment) {
          return comment._id !== commentId;
        });
      }
      var nextData = {
        comments: nextComments,
        'post.commentCount': Math.max(0, Number(result.commentCount) || 0)
      };
      var replyTarget = self.data.replyTarget;
      if (replyTarget && (
        replyTarget.id === commentId ||
        (targetType === 'comment' && replyTarget.rootCommentId === commentId)
      )) {
        nextData.replyTarget = null;
        nextData.commentPlaceholder = '说点什么…';
      }
      self.setData(nextData);
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
  },

  getShareTitle: function () {
    var post = this.data.post || {};
    var content = String(post.content || '').trim();
    if (content) return content.length > 28 ? content.slice(0, 28) + '…' : content;
    return (post.authorName || '旅行者') + '分享了一条社区动态';
  },

  getShareImageUrl: function () {
    var images = this.data.post && this.data.post.images || [];
    var first = images[0];
    return typeof first === 'string' ? first : first && first.url || '';
  },

  onShareAppMessage: function () {
    if (this.data.showPostActions) this.setData({ showPostActions: false });
    var postId = this.data.post && this.data.post._id || this._postId || '';
    var result = {
      title: this.getShareTitle(),
      path: '/pages/community-detail/community-detail?id=' + encodeURIComponent(postId)
    };
    var imageUrl = this.getShareImageUrl();
    if (imageUrl) result.imageUrl = imageUrl;
    return result;
  },

  onShareTimeline: function () {
    var postId = this.data.post && this.data.post._id || this._postId || '';
    var result = {
      title: this.getShareTitle(),
      query: 'id=' + encodeURIComponent(postId)
    };
    var imageUrl = this.getShareImageUrl();
    if (imageUrl) result.imageUrl = imageUrl;
    return result;
  }
});
