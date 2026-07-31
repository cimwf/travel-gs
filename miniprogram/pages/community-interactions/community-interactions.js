var app = getApp();
var auth = require('../../utils/auth.js');
var api = require('../../utils/api.js');

Page({
  data: {
    activeTab: 'liked',
    visibleItems: [],
    loading: true,
    error: false,
    refreshing: false,
    hasMore: true
  },

  onLoad: function () {
    auth.syncToApp(app);
    if (!auth.ensureLogin()) {
      auth.saveDeepLink('/pages/community-interactions/community-interactions');
      return;
    }
    this._states = {
      liked: this.createTabState(),
      commented: this.createTabState()
    };
    this._loadingTabs = {};
    this.loadInteractions('liked', true);
  },

  createTabState: function () {
    return {
      items: [],
      cursor: 0,
      cursorId: '',
      hasMore: true,
      loaded: false
    };
  },

  onTabTap: function (event) {
    var tab = event.currentTarget.dataset.tab;
    if (['liked', 'commented'].indexOf(tab) === -1 || tab === this.data.activeTab) return;
    var state = this._states[tab];
    this.setData({
      activeTab: tab,
      visibleItems: state.items,
      loading: !state.loaded,
      error: false,
      hasMore: state.hasMore
    });
    if (!state.loaded) this.loadInteractions(tab, true);
  },

  loadInteractions: function (type, reset) {
    var state = this._states[type];
    if (!state || this._loadingTabs[type]) return Promise.resolve();
    if (!reset && !state.hasMore) return Promise.resolve();
    if (reset) {
      state.cursor = 0;
      state.cursorId = '';
      state.hasMore = true;
      if (type === this.data.activeTab) {
        this.setData({ loading: true, error: false });
      }
    }

    var request = {
      type: type,
      pageSize: 10
    };
    if (!reset && state.cursor) {
      request.cursor = state.cursor;
      request.cursorId = state.cursorId;
    }

    var self = this;
    this._loadingTabs[type] = true;
    return api.communityInteractions(request).then(function (res) {
      var nextItems = (res.interactions || []).map(function (item) {
        return self.formatInteraction(item);
      });
      state.items = reset ? nextItems : state.items.concat(nextItems);
      state.cursor = res.nextCursor || 0;
      state.cursorId = res.nextCursorId || '';
      state.hasMore = res.hasMore !== false;
      state.loaded = true;
      if (type === self.data.activeTab) {
        self.setData({
          visibleItems: state.items,
          loading: false,
          error: false,
          hasMore: state.hasMore
        });
      }
    }).catch(function (err) {
      console.warn('我的互动加载失败:', err);
      if (type === self.data.activeTab) {
        self.setData({ loading: false, error: reset });
        if (reset) {
          wx.showToast({ title: err.message || '加载失败，请重试', icon: 'none' });
        }
      }
    }).then(function () {
      delete self._loadingTabs[type];
    });
  },

  formatInteraction: function (interaction) {
    var post = interaction.post || {};
    var images = (post.images || []).filter(function (image) {
      return image && image.url;
    });
    var count = images.length;
    return Object.assign({}, interaction, {
      post: Object.assign({}, post, {
        timeText: this.formatTime(post.createdAt),
        hasLocation: !!(post.location && post.location.name),
        likeCount: Math.max(0, Number(post.likeCount) || 0),
        commentCount: Math.max(0, Number(post.commentCount) || 0),
        isLiked: !!post.isLiked,
        displayImages: images.slice(0, 3),
        firstImage: images.length > 0 ? images[0].url : '',
        imageLayout: count === 1 ? 'grid-1' : count === 2 ? 'grid-2' : count >= 3 ? 'grid-3' : ''
      }),
      interactionTimeText: this.formatTime(interaction.interactionCreatedAt)
    });
  },

  formatTime: function (timestamp) {
    var value = Number(timestamp) || 0;
    if (!value) return '';
    var now = new Date();
    var date = new Date(value);
    var timeText = String(date.getHours()).padStart(2, '0') + ':' +
      String(date.getMinutes()).padStart(2, '0');
    var sameYear = now.getFullYear() === date.getFullYear();
    var sameDay = sameYear &&
      now.getMonth() === date.getMonth() &&
      now.getDate() === date.getDate();
    if (sameDay) return timeText;

    var yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    var isYesterday = yesterday.getFullYear() === date.getFullYear() &&
      yesterday.getMonth() === date.getMonth() &&
      yesterday.getDate() === date.getDate();
    if (isYesterday) return '昨天 ' + timeText;

    var dateText = String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
    return sameYear ? dateText + ' ' + timeText :
      date.getFullYear() + '-' + dateText + ' ' + timeText;
  },

  onLikeTap: function (event) {
    var interactionId = event.currentTarget.dataset.interactionId;
    var item = this.data.visibleItems.find(function (current) {
      return current._id === interactionId;
    });
    if (!item || !item.post || !item.post._id) return;

    var postId = item.post._id;
    this._likingPosts = this._likingPosts || {};
    if (this._likingPosts[postId]) return;
    this._likingPosts[postId] = true;

    var previousLiked = !!item.post.isLiked;
    var previousCount = Math.max(0, Number(item.post.likeCount) || 0);
    this.updatePostLike(postId, !previousLiked, Math.max(0, previousCount + (previousLiked ? -1 : 1)));

    var self = this;
    api.communityToggleLike(postId).then(function (res) {
      if (self.data.activeTab === 'liked' && !res.liked) {
        self.removeLikedPost(postId);
        return;
      }
      self.updatePostLike(postId, !!res.liked, Math.max(0, Number(res.likeCount) || 0));
    }).catch(function (err) {
      self.updatePostLike(postId, previousLiked, previousCount);
      wx.showToast({ title: err.message || '点赞失败，请重试', icon: 'none' });
    }).then(function () {
      delete self._likingPosts[postId];
    });
  },

  updatePostLike: function (postId, liked, count) {
    var self = this;
    ['liked', 'commented'].forEach(function (type) {
      var state = self._states[type];
      state.items = state.items.map(function (item) {
        if (!item.post || item.post._id !== postId) return item;
        return Object.assign({}, item, {
          post: Object.assign({}, item.post, {
            isLiked: liked,
            likeCount: count
          })
        });
      });
    });
    this.setData({ visibleItems: this._states[this.data.activeTab].items });
  },

  removeLikedPost: function (postId) {
    this._states.liked.items = this._states.liked.items.filter(function (item) {
      return !item.post || item.post._id !== postId;
    });
    if (this.data.activeTab === 'liked') {
      this.setData({ visibleItems: this._states.liked.items });
    }
  },

  onOpenDetail: function (event) {
    var interactionId = event.currentTarget.dataset.interactionId;
    var item = this.data.visibleItems.find(function (current) {
      return current._id === interactionId;
    });
    if (!item || !item.post || !item.post._id) return;
    var post = item.post;
    var postId = post._id;
    try {
      wx.setStorageSync('communityDetailPost:' + postId, post);
    } catch (cacheErr) {
      console.warn('缓存动态详情失败:', cacheErr);
    }

    var self = this;
    wx.navigateTo({
      url: '/pages/community-detail/community-detail?id=' + encodeURIComponent(postId),
      events: {
        postUpdated: function (updatedPost) {
          if (!updatedPost || updatedPost._id !== postId) return;
          if (self.data.activeTab === 'liked' && !updatedPost.isLiked) {
            self.removeLikedPost(postId);
            return;
          }
          self.updatePostLike(
            postId,
            !!updatedPost.isLiked,
            Math.max(0, Number(updatedPost.likeCount) || 0)
          );
          self.updatePostCommentCount(
            postId,
            Math.max(0, Number(updatedPost.commentCount) || 0)
          );
        }
      },
      success: function (res) {
        if (res.eventChannel && res.eventChannel.emit) {
          res.eventChannel.emit('postData', { post: post });
        }
      }
    });
  },

  updatePostCommentCount: function (postId, count) {
    var self = this;
    ['liked', 'commented'].forEach(function (type) {
      var state = self._states[type];
      state.items = state.items.map(function (item) {
        if (!item.post || item.post._id !== postId) return item;
        return Object.assign({}, item, {
          post: Object.assign({}, item.post, { commentCount: count })
        });
      });
    });
    this.setData({ visibleItems: this._states[this.data.activeTab].items });
  },

  onOpenUserProfile: function (event) {
    var userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({
      url: '/pages/user-profile/user-profile?id=' + encodeURIComponent(userId)
    });
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

  onPullDownRefresh: function () {
    var self = this;
    this.setData({ refreshing: true });
    this.loadInteractions(this.data.activeTab, true).then(function () {
      self.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.loading || !this.data.hasMore) return;
    this.loadInteractions(this.data.activeTab, false);
  },

  onRetry: function () {
    this.loadInteractions(this.data.activeTab, true);
  }
});
