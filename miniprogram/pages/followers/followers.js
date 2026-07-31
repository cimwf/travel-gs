const app = getApp();
const auth = require('../../utils/auth.js');
const api = require('../../utils/api.js');

Page({
  data: {
    activeTab: 'following',
    ownerId: '',
    counts: {
      following: 0,
      followers: 0
    },
    users: [],
    loading: true,
    error: false,
    hasMore: true,
    isCurrentOwner: true
  },

  onLoad: function (options) {
    auth.syncToApp(app);
    if (!auth.ensureLogin()) {
      auth.saveDeepLink('/pages/followers/followers');
      return;
    }
    const activeTab = options.type === 'followers' ? 'followers' : 'following';
    const viewerId = app.globalData.openid || wx.getStorageSync('openid') || '';
    const ownerId = options.userId || viewerId;
    this._cursor = 0;
    this._cursorId = '';
    this._loading = false;
    this.setData({
      activeTab,
      ownerId,
      isCurrentOwner: !options.userId || ownerId === viewerId
    });
    this.loadUsers(true);
  },

  onTabTap: function (event) {
    const type = event.currentTarget.dataset.type;
    if ((type !== 'following' && type !== 'followers') || type === this.data.activeTab) return;
    this.setData({
      activeTab: type,
      users: [],
      loading: true,
      error: false,
      hasMore: true
    });
    this._cursor = 0;
    this._cursorId = '';
    this.loadUsers(true);
  },

  loadUsers: function (reset) {
    if (this._loading || (!reset && !this.data.hasMore)) return Promise.resolve();
    this._loading = true;
    if (reset) {
      this._cursor = 0;
      this._cursorId = '';
      this.setData({ loading: true, error: false });
    }

    const request = {
      type: this.data.activeTab,
      userId: this.data.ownerId,
      pageSize: 20
    };
    if (!reset && this._cursor) {
      request.cursor = this._cursor;
      request.cursorId = this._cursorId;
    }

    return api.userFollowList(request).then(res => {
      const users = (res.users || []).map(user => this.formatUser(user));
      this._cursor = res.nextCursor || 0;
      this._cursorId = res.nextCursorId || '';
      this.setData({
        users: reset ? users : this.data.users.concat(users),
        counts: res.counts || this.data.counts,
        hasMore: res.hasMore !== false,
        loading: false,
        error: false
      });
    }).catch(err => {
      console.warn('关注列表加载失败', err);
      this.setData({ loading: false, error: reset });
      if (reset) wx.showToast({ title: err.message || '加载失败，请重试', icon: 'none' });
    }).then(() => {
      this._loading = false;
    });
  },

  formatUser: function (user) {
    let relationshipText = '关注';
    let relationshipClass = 'follow';
    if (user.isMutual) {
      relationshipText = '相互关注';
      relationshipClass = 'mutual';
    } else if (user.isFollowing) {
      relationshipText = '已关注';
      relationshipClass = 'following';
    }
    return {
      ...user,
      regionText: user.region ? user.region : '北京',
      relationshipText,
      relationshipClass
    };
  },

  onUserTap: function (event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({
      url: '/pages/user-profile/user-profile?id=' + encodeURIComponent(userId)
    });
  },

  onFollowTap: function (event) {
    const userId = event.currentTarget.dataset.userId;
    const index = this.data.users.findIndex(user => user.userId === userId);
    if (!userId || index < 0 || this.data.users[index].isCurrentUser) return;
    this._following = this._following || {};
    if (this._following[userId]) return;
    this._following[userId] = true;

    api.userFollowToggle(userId).then(res => {
      const viewerId = app.globalData.openid || wx.getStorageSync('openid');
      if (this.data.activeTab === 'following' && !res.isFollowing &&
        this.data.ownerId === viewerId) {
        const users = this.data.users.filter(user => user.userId !== userId);
        this.setData({
          users,
          'counts.following': Math.max(0, Number(res.followingCount) || 0)
        });
        return;
      }
      const update = {};
      if (this.data.ownerId === viewerId) {
        update['counts.following'] = Math.max(0, Number(res.followingCount) || 0);
      }
      update['users[' + index + '].isFollowing'] = !!res.isFollowing;
      update['users[' + index + '].isMutual'] = !!res.isMutual;
      update['users[' + index + '].relationshipText'] = res.isMutual
        ? '相互关注'
        : (res.isFollowing ? '已关注' : '关注');
      update['users[' + index + '].relationshipClass'] = res.isMutual
        ? 'mutual'
        : (res.isFollowing ? 'following' : 'follow');
      this.setData(update);
    }).catch(err => {
      wx.showToast({ title: err.message || '操作失败，请重试', icon: 'none' });
    }).then(() => {
      delete this._following[userId];
    });
  },

  onPullDownRefresh: function () {
    this.loadUsers(true).then(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    this.loadUsers(false);
  },

  onRetry: function () {
    this.loadUsers(true);
  },

  onEmptyAction: function () {
    if (!this.data.isCurrentOwner) return;
    if (this.data.activeTab === 'following') {
      wx.switchTab({ url: '/pages/community/community' });
      return;
    }
    wx.navigateTo({ url: '/pages/community-publish/community-publish' });
  }
});
