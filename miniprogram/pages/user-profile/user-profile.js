// pages/user-profile/user-profile.js
const app = getApp();
const api = require('../../utils/api.js');

Page({
  data: {
    loading: true,
    userId: '',
    isCurrentUser: false,
    isFollowing: false,
    isMutual: false,
    activeTab: 'works',
    userInfo: {
      nickname: '',
      avatar: '',
      bio: '',
      region: ''
    },
    stats: {
      following: 0,
      followers: 0,
      receivedLikes: 0,
      works: 0,
      trips: 0
    },
    posts: [],
    trips: []
  },

  onLoad: function (options) {
    this.skipNextShowRefresh = true;
    const userId = options.id || options.userId || options.fromUserId || '';
    if (userId) {
      this.setData({ userId, isCurrentUser: false });
      this.loadUserProfile(userId);
      return;
    }
    this.loadCurrentUser();
  },

  onShow: function () {
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false;
      return;
    }
    if (this.data.isCurrentUser && app.globalData._profileUpdated) {
      this.applyProfileUpdate(app.globalData._profileUpdated);
      app.globalData._profileUpdated = null;
    }
    if (this.data.userId) {
      this.refreshFollowCounts();
    }
  },

  applyProfileUpdate: function (update) {
    if (!update) return;
    this.setData({
      'userInfo.nickname': update.nickname || this.data.userInfo.nickname,
      'userInfo.avatar': update.avatar || this.data.userInfo.avatar,
      'userInfo.bio': update.bio || '去山野，也记录沿途的人',
      'userInfo.region': update.region || ''
    });
  },

  loadCurrentUser: async function () {
    const storedUserInfo = wx.getStorageSync('userInfo');
    const openid = app.globalData.openid || wx.getStorageSync('openid');
    if (!storedUserInfo || !openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1200);
      return;
    }
    this.setData({ userId: openid, isCurrentUser: true });
    await this.loadUserProfile(openid);
  },

  loadUserProfile: async function (userId) {
    this.setData({ loading: true });
    try {
      const res = await api.userGet(userId);
      if (!res.success || !res.user) {
        throw new Error('未找到用户资料');
      }

      const localUserInfo = this.data.isCurrentUser
        ? (wx.getStorageSync('userInfo') || app.globalData.userInfo || {})
        : {};
      const userData = this.data.isCurrentUser
        ? { ...res.user, ...localUserInfo }
        : res.user;
      const authorId = userData.profileId || userId;
      const avatar = await this.resolveCloudUrl(userData.avatar || userData.avatarUrl || '');

      this.setData({
        userId: authorId,
        userInfo: {
          nickname: userData.nickname || userData.nickName || '旅行者',
          avatar,
          bio: userData.bio || '去山野，也记录沿途的人',
          region: userData.region || ''
        },
        stats: {
          following: Math.max(0, Number(userData.following) || 0),
          followers: Math.max(0, Number(userData.followers) || 0),
          receivedLikes: Math.max(0, Number(userData.receivedLikes) || 0),
          works: 0,
          trips: 0
        }
      });

      await Promise.all([
        this.loadUserPosts(authorId),
        this.loadUserTrips(authorId),
        this.loadFollowStatus(authorId)
      ]);
    } catch (err) {
      console.error('加载用户主页失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  loadFollowStatus: async function (userId) {
    if (this.data.isCurrentUser) return;
    try {
      const res = await api.userFollowStatus(userId);
      this.setData({
        isFollowing: !!res.isFollowing,
        isMutual: !!res.isMutual,
        'stats.followers': Math.max(0, Number(res.followerCount) || 0)
      });
    } catch (err) {
      console.warn('加载关注状态失败', err);
    }
  },

  refreshFollowCounts: function () {
    api.userFollowStatus(this.data.userId).then(res => {
      const update = {
        'stats.following': Math.max(0, Number(res.followingCount) || 0),
        'stats.followers': Math.max(0, Number(res.followerCount) || 0)
      };
      if (!this.data.isCurrentUser) {
        update.isFollowing = !!res.isFollowing;
        update.isMutual = !!res.isMutual;
      }
      this.setData(update);
    }).catch(err => {
      console.warn('刷新关注统计失败', err);
    });
  },

  onFollowUser: function () {
    if (this.data.isCurrentUser || this._followingUser) return;
    this._followingUser = true;
    api.userFollowToggle(this.data.userId).then(res => {
      this.setData({
        isFollowing: !!res.isFollowing,
        isMutual: !!res.isMutual,
        'stats.followers': Math.max(0, Number(res.followerCount) || 0)
      });
      const currentUser = wx.getStorageSync('userInfo') || {};
      currentUser.following = Math.max(0, Number(res.followingCount) || 0);
      wx.setStorageSync('userInfo', currentUser);
      if (app.globalData.userInfo) app.globalData.userInfo.following = currentUser.following;
    }).catch(err => {
      wx.showToast({ title: err.message || '操作失败，请重试', icon: 'none' });
    }).then(() => {
      this._followingUser = false;
    });
  },

  onOpenFollowList: function (event) {
    const type = event.currentTarget.dataset.type;
    if (type !== 'following' && type !== 'followers') return;
    wx.navigateTo({
      url: '/pages/followers/followers?type=' + type +
        '&userId=' + encodeURIComponent(this.data.userId)
    });
  },

  resolveCloudUrl: async function (url) {
    if (!url || !url.startsWith('cloud://') || !wx.cloud) return url;
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [url] });
      return (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) || url;
    } catch (err) {
      console.warn('获取头像临时链接失败', err);
      return url;
    }
  },

  loadUserPosts: async function (authorId) {
    try {
      const res = await api.communityList({ authorId, pageSize: 20 });
      const posts = (res.posts || []).map((post) => this.formatPost(post));
      const receivedLikes = posts.reduce(function (sum, post) {
        return sum + Math.max(0, Number(post.likeCount) || 0);
      }, 0);
      this.setData({
        posts,
        'stats.works': posts.length,
        'stats.receivedLikes': Math.max(this.data.stats.receivedLikes, receivedLikes)
      });
    } catch (err) {
      console.warn('加载用户作品失败', err);
      this.setData({ posts: [], 'stats.works': 0 });
    }
  },

  formatPost: function (post) {
    const count = (post.images || []).length;
    const imageUrls = (post.images || []).map(function (image) {
      return image.url || '';
    }).filter(Boolean);
    return {
      ...post,
      timeText: this.formatTime(post.createdAt),
      imageUrls,
      imageLayout: count === 1 ? 'grid-1' : count === 2 ? 'grid-2' : count >= 3 ? 'grid-3' : '',
      hasLocation: !!(post.location && post.location.name),
      likeCount: Math.max(0, Number(post.likeCount) || 0),
      commentCount: Math.max(0, Number(post.commentCount) || 0),
      isLiked: !!post.isLiked
    };
  },

  formatTime: function (timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + '分钟前';
    if (hours < 24) return hours + '小时前';
    if (days < 7) return days + '天前';
    const date = new Date(timestamp);
    return (date.getMonth() + 1) + '月' + date.getDate() + '日';
  },

  loadUserTrips: async function (userId) {
    try {
      await app.getAttractions();
      const res = await api.tripListByUser(userId, 1, 50);
      const trips = (res.trips || []).map((trip) => this.formatTrip(trip));
      this.setData({
        trips,
        'stats.trips': trips.length
      });
    } catch (err) {
      console.warn('加载用户行程失败', err);
      this.setData({ trips: [], 'stats.trips': 0 });
    }
  },

  formatTrip: function (trip) {
    const date = trip.date ? new Date(trip.date) : null;
    let dateText = trip.date || '';
    if (date && !Number.isNaN(date.getTime())) {
      const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
      dateText = `${date.getMonth() + 1}月${date.getDate()}日 周${weekDays[date.getDay()]}`;
    }
    const attractions = app.globalData.attractions || [];
    const attraction = trip.placeId
      ? attractions.find(function (item) {
        return item._id === trip.placeId || item.id === trip.placeId;
      })
      : null;
    const placeCoverImage = (trip.coverImageUrls && trip.coverImageUrls[0]) ||
      trip.placeCoverImage ||
      trip.placeImage ||
      (attraction && attraction.coverImage) ||
      '';

    const participants = trip.participants || [];
    const creator = participants.find(function (participant) {
      return participant.userId === trip.creatorId;
    }) || participants[0] || {};
    const creatorName = trip.creatorName || creator.nickname || '旅行者';
    const creatorAvatar = creator.avatar || trip.creatorAvatar || '';
    const displayParticipants = participants.slice(0, 4).map(function (participant) {
      return {
        ...participant,
        initial: (participant.nickname || '旅').slice(0, 1)
      };
    });

    const needCount = Number(trip.needCount) || 0;
    const tripStage = trip.tripStage || 'not_started';
    let statusClass = 'recruiting';
    let statusText = '招募中';
    if (tripStage === 'cancelled') {
      statusClass = 'cancelled';
      statusText = '已取消';
    } else if (tripStage === 'ongoing') {
      statusClass = 'ongoing';
      statusText = '进行中';
    } else if (tripStage === 'ended') {
      statusClass = 'ended';
      statusText = '已结束';
    } else if (trip.status === 'stopped') {
      statusClass = 'stopped';
      statusText = '停止招募';
    } else if (needCount <= 0) {
      statusClass = 'full';
      statusText = '已满员';
    } else if (needCount === 1) {
      statusClass = 'almost-full';
      statusText = '即将满员';
    }

    return {
      _id: trip._id,
      displayTitle: trip.tripTitle || trip.title || trip.placeName || '未命名行程',
      placeName: trip.placeName || '',
      departureTimeText: trip.meetingTime || '',
      meetingLocation: trip.meetingPlace || trip.departure || '集合地点待定',
      dateText,
      publishTime: this.formatTripPublishTime(trip.createdAt),
      participants,
      displayParticipants,
      participantCount: Math.max(Number(trip.currentCount) || 0, participants.length),
      creatorName,
      creatorAvatar,
      creatorInitial: creatorName.slice(0, 1),
      placeCoverImage,
      statusClass,
      statusText
    };
  },

  formatTripPublishTime: function (createdAt) {
    const timestamp = new Date(createdAt).getTime();
    if (!timestamp) return '';

    const now = new Date();
    const date = new Date(timestamp);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDiff = Math.max(0, Math.round((todayStart - dateStart) / 86400000));
    const timeText = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

    if (dayDiff === 0) return timeText;
    if (dayDiff === 1) return `昨天 ${timeText}`;
    if (dayDiff < 7) return `${date.getMonth() + 1}-${date.getDate()} ${timeText}`;
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}-${date.getDate()}`;
    }
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  },

  onSwitchTab: function (event) {
    const tab = event.currentTarget.dataset.tab;
    if (tab === 'works' || tab === 'trips') {
      this.setData({ activeTab: tab });
    }
  },

  onEditProfile: function () {
    if (this.data.isCurrentUser) {
      wx.navigateTo({
        url: '/pages/edit-profile/edit-profile',
        events: {
          profileUpdated: (update) => {
            this.applyProfileUpdate(update);
            app.globalData._profileUpdated = null;
          }
        }
      });
    }
  },

  onPreviewImage: function (event) {
    const urls = event.currentTarget.dataset.urls || [];
    const current = event.currentTarget.dataset.current || urls[0];
    if (urls.length > 0) wx.previewImage({ urls, current });
  },

  onOpenLocation: function (event) {
    const latitude = Number(event.currentTarget.dataset.lat);
    const longitude = Number(event.currentTarget.dataset.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    wx.openLocation({
      latitude,
      longitude,
      name: event.currentTarget.dataset.name || '',
      address: event.currentTarget.dataset.address || '',
      scale: 16
    });
  },

  onOpenPost: function (event) {
    const postId = event.currentTarget.dataset.postId;
    const post = this.data.posts.find(function (item) { return item._id === postId; });
    if (!post) return;
    try {
      wx.setStorageSync('communityDetailPost:' + postId, post);
    } catch (err) {
      console.warn('缓存动态详情失败', err);
    }
    wx.navigateTo({ url: '/pages/community-detail/community-detail?id=' + encodeURIComponent(postId) });
  },

  onLikeTap: function (event) {
    const postId = event.currentTarget.dataset.postId;
    const index = this.data.posts.findIndex(function (post) { return post._id === postId; });
    if (index < 0 || this._likingPost === postId) return;

    const previousLiked = !!this.data.posts[index].isLiked;
    const previousCount = Math.max(0, Number(this.data.posts[index].likeCount) || 0);
    const optimistic = {};
    optimistic['posts[' + index + '].isLiked'] = !previousLiked;
    optimistic['posts[' + index + '].likeCount'] = Math.max(0, previousCount + (previousLiked ? -1 : 1));
    this.setData(optimistic);
    this._likingPost = postId;

    api.communityToggleLike(postId).then((res) => {
      const nextIndex = this.data.posts.findIndex(function (post) { return post._id === postId; });
      if (nextIndex < 0) return;
      const confirmed = {};
      confirmed['posts[' + nextIndex + '].isLiked'] = !!res.liked;
      confirmed['posts[' + nextIndex + '].likeCount'] = Math.max(0, Number(res.likeCount) || 0);
      this.setData(confirmed);
    }).catch((err) => {
      const rollback = {};
      rollback['posts[' + index + '].isLiked'] = previousLiked;
      rollback['posts[' + index + '].likeCount'] = previousCount;
      this.setData(rollback);
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }).then(() => {
      this._likingPost = '';
    });
  },

  onTripTap: function (event) {
    const tripId = event.currentTarget.dataset.id;
    if (tripId) wx.navigateTo({ url: '/pages/trip-detail/trip-detail?id=' + tripId });
  },

  onShareAppMessage: function () {
    return {
      title: this.data.userInfo.nickname + '的个人主页',
      path: '/pages/user-profile/user-profile?id=' + this.data.userId
    };
  }
});
