// pages/trip-detail/trip-detail.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const tripMediaUpload = require('../../utils/trip-media-upload.js');

Page({
  data: {
    tripId: '',
    trip: null,
    participants: [],
    statusText: '招募中',
    remainCount: 0,
    joinBtnText: '申请加入',
    canJoin: true,
    loading: true,
    loadError: false,
    hasJoined: false,
    isCreator: false,
    applySubmitting: false,
    userInfo: null,
    showMemberModal: false,
    selectedMember: null,
    selectedMemberAuthorized: false,
    showRemoveConfirm: false,
    // 日志相关
    tripStage: 'not_started',
    isTripDay: false,
    activeTab: 'trip',
    showTabs: true,
    canPublishLog: false,
    logGroups: [],
    windowWidth: 375,
    showPublishModal: false,
    publishContent: '',
    publishImages: [],
    publishLocation: null,
    publishSubmitting: false,
    // 行程评论相关
    comments: [],
    commentsLoading: false,
    commentsError: false,
    commentsHasMore: true,
    commentDraft: '',
    commentPlaceholder: '说点什么…',
    replyTarget: null,
    inputFocused: false,
    submittingComment: false,
    // 日志操作菜单
    showLogMenu: false,
    logMenuGroupIndex: -1,
    logMenuLogIndex: -1,
    logMenuLogId: '',
    logMenuCanDelete: false,
    logMenuCanReport: false,
    // 更换封面相关
    showCoverModal: false,
    pendingImages: [],
    savingCover: false
  },

  onLoad: async function (options) {
    const tripId = options.id || '';
    const windowInfo = wx.getWindowInfo();
    this.setData({
      tripId,
      activeTab: options.focus === 'comments' ? 'comment' : 'trip',
      windowWidth: windowInfo.windowWidth || 375
    });

    auth.saveDeepLink(`/pages/trip-detail/trip-detail?id=${tripId}`);
    if (!auth.ensureLogin()) {
      return;
    }

    this.setData({ userInfo: app.globalData.userInfo });

    await this.loadAttractions();

    if (tripId) {
      this.loadTripDetail(tripId);
      this.recordView(tripId);
    }
  },

  loadAttractions: async function () {
    await app.getAttractions();
  },

  getPlaceCover: function (placeId) {
    const attractions = app.globalData.attractions || [];
    const attraction = attractions.find(a => a._id === placeId);
    return attraction ? (attraction.coverImage || '') : '';
  },

  getTripCover: function (trip) {
    return (trip.coverImageUrls && trip.coverImageUrls[0]) ||
      trip.placeCoverImage ||
      trip.placeImage ||
      (trip.placeId ? this.getPlaceCover(trip.placeId) : '');
  },

  getTripCoverImages: function (trip) {
    const images = Array.isArray(trip.coverImageUrls)
      ? trip.coverImageUrls.filter(Boolean)
      : [];
    const fallback = this.getTripCover(trip);
    return images.length > 0 ? images : (fallback ? [fallback] : []);
  },

  onShow: function () {
    this.setData({ userInfo: app.globalData.userInfo });
  },

  recordView: async function (tripId) {
    if (wx.cloud) {
      try {
        await api.tripView(tripId);
      } catch (err) {
        console.warn('记录浏览量失败', err);
      }
    }
  },

  loadTripDetail: async function (tripId) {
    this.setData({ loading: true, loadError: false, trip: null });
    wx.showLoading({ title: '加载中...', mask: true });

    try {
      const res = await api.tripGet(tripId);

      if (res.success && res.trip) {
        await this.processTripData(res.trip);
        // 加载日志；评论在首次切换到评论 Tab 时加载。
        this.loadLogs(tripId, res.trip);
        if (this.data.activeTab === 'comment') this.loadComments(true);
        return;
      }
    } catch (err) {
      console.warn('加载行程详情失败', err);
    }

    wx.hideLoading();
    this.setData({ loading: false, loadError: true, trip: null });
  },

  loadLogs: async function (tripId, trip) {
    const tripStage = trip.tripStage || 'not_started';
    const logCount = trip.logCount || 0;

    if (tripStage === 'not_started' || logCount === 0) {
      return;
    }

    try {
      const res = await api.tripLogList(tripId);
      if (res.success) {
        const groups = this.processLogGroups(res.groups || []);
        this.setData({
          logGroups: groups,
          showTabs: true,
          activeTab: this.data.activeTab || 'trip'
        });
      }
    } catch (err) {
      console.warn('加载日志失败', err);
    }
  },

  processLogGroups: function (groups) {
    return groups.map(group => ({
      ...group,
      logs: (group.logs || []).map(log => ({
        ...log,
        renderImages: (log.images || []).slice(0, 9),
        imageGridClass: this.getLogImageGridClass(log.imageCount || ((log.images || []).length)),
        timeText: this.formatLogTime(log.createdAt),
        imageUrls: (log.images || []).map(img => img.url || img.tempFileURL || img.fileID).filter(Boolean),
        locationText: this.getLogLocationText(log.location),
        reviewStatusText: log.adminReviewStatus === 'pending' && log.machineSuggest === 'review'
          ? '已发布 · 待复核'
          : (log.reviewStatus === 'reviewing'
          ? '审核中'
          : (log.reviewStatus === 'manual_review'
            ? '待人工审核'
            : (log.reviewStatus === 'rejected' ? '审核不通过' : '')))
      }))
    }));
  },

  getLogLocationText: function (location) {
    if (!location) return '';
    return (location.name || location.address || '').trim();
  },

  getLogImageGridClass: function (imageCount) {
    if (imageCount <= 1) return 'photo-grid-1';
    if (imageCount === 2 || imageCount === 4) return 'photo-grid-2';
    return 'photo-grid-3';
  },

  formatLogTime: function (ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
      return hhmm;
    }
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
  },

  processTripData: async function (trip) {
    const remainCount = trip.needCount || 0;
    const totalCount = (trip.currentCount || 0) + (trip.needCount || 0);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
    const tripTime = new Date(trip.date).getTime();
    const hasValidTripTime = !Number.isNaN(tripTime);

    let statusText = '招募中';
    let canJoin = true;
    let joinBtnText = '申请加入';

    const tripStageForStatus = trip.tripStage || 'not_started';
    if (tripStageForStatus === 'cancelled') {
      statusText = '已取消';
      canJoin = false;
      joinBtnText = '已取消';
    } else if (tripStageForStatus === 'ongoing') {
      statusText = '进行中';
      canJoin = false;
      joinBtnText = '进行中';
    } else if (tripStageForStatus === 'ended') {
      statusText = '已结束';
      canJoin = false;
      joinBtnText = '已结束';
    } else if (trip.status === 'stopped') {
      statusText = '停止招募';
      canJoin = false;
      joinBtnText = '停止招募';
    } else if (remainCount <= 0) {
      statusText = '已满员';
      canJoin = false;
      joinBtnText = '已满员';
    } else if (remainCount === 1) {
      statusText = '即将满员';
      canJoin = true;
      joinBtnText = '申请加入';
    } else {
      statusText = '招募中';
      canJoin = true;
      joinBtnText = '申请加入';
    }

    let dateText = trip.date;
    if (trip.date) {
      const date = new Date(trip.date);
      const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
      dateText = `${trip.date} 周${weekDays[date.getDay()]}`;
    }

    const placeCoverImage = this.getTripCover(trip);
    const fallbackCoverImage = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop';
    const placeCoverImages = this.getTripCoverImages(trip);

    const creatorAvatar = trip.creatorAvatar || '';
    const participants = trip.participants || [];

    const processedTrip = {
      ...trip,
      creatorAvatar,
      dateText,
      totalCount,
      status: trip.status,
      placeCoverImage: placeCoverImage || fallbackCoverImage,
      placeCoverImages: placeCoverImages.length > 0 ? placeCoverImages : [fallbackCoverImage],
      placeHighlight: this.getPlaceHighlight(trip.placeName)
    };

    const openid = app.globalData.openid;
    const hasJoined = trip.participants && trip.participants.some(p => p.userId === openid);
    const isCreator = trip.creatorId === openid;

    // 日志状态
    const tripStage = trip.tripStage || 'not_started';
    const authorizedIds = trip.logAuthorizedPublisherIds || [];
    const canPublishLog = tripStage === 'ongoing' && (isCreator || authorizedIds.includes(openid));

    // 是否是行程当天
    let isTripDay = false;
    if (hasValidTripTime) {
      isTripDay = tripTime >= todayStart && tripTime <= todayEnd;
    }

    // 三个 Tab 从行程未开始时就固定展示，刷新时保持当前 Tab。
    const validTabs = ['trip', 'log', 'comment'];
    const activeTab = validTabs.includes(this.data.activeTab) ? this.data.activeTab : 'trip';

    this.setData({
      trip: processedTrip,
      participants,
      statusText,
      remainCount,
      canJoin,
      joinBtnText,
      hasJoined,
      isCreator,
      loading: false,
      tripStage: tripStage,
      canPublishLog,
      isTripDay,
      showTabs: true,
      activeTab
    });

    wx.hideLoading();
  },

  getPlaceHighlight: function (placeName) {
    const highlights = {
      '东灵山': '北京最高峰',
      '海坨山': '高山草甸露营',
      '百花山': '百花盛开',
      '香山': '红叶胜地',
      '八达岭长城': '世界遗产',
      '慕田峪长城': '人少景美',
      '十渡': '北方小桂林',
      '青龙峡': '青山绿水',
      '古北水镇': '长城脚下',
      '爨底下村': '明清古村落'
    };
    return highlights[placeName] || '北京周边';
  },

  onRetryTripDetail: function () {
    if (!this.data.tripId) return;
    this.loadTripDetail(this.data.tripId);
  },

  // ========== Tab 切换 ==========

  onSwitchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'comment' && !this._commentsLoaded && !this.data.commentsLoading) {
      this.loadComments(true);
    }
  },

  onPullDownRefresh: async function () {
    const { tripId, activeTab } = this.data;
    if (!tripId) {
      wx.stopPullDownRefresh();
      return;
    }

    try {
      if (activeTab === 'comment') {
        await this.loadComments(true);
      } else if (activeTab === 'log') {
        await this.loadTripDetail(tripId);
      }
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  // ========== 日志相关操作 ==========

  onStartLog: function () {
    const trip = this.data.trip;
    wx.showModal({
      title: '开始出发',
      content: '开始后，旅途记录发布通道将开启。开始后成员不能退出行程。',
      confirmText: '出发',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await api.tripLogStart(trip._id);
          wx.hideLoading();
          wx.showToast({ title: '行程已开始', icon: 'success' });
          setTimeout(() => this.loadTripDetail(trip._id), 500);
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  onEndLog: function () {
    const trip = this.data.trip;
    wx.showModal({
      title: '结束行程',
      content: '结束后，日志发布通道将关闭，已有日志继续可见。',
      confirmText: '确认结束',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await api.tripLogEnd(trip._id);
          wx.hideLoading();
          wx.showToast({ title: '行程已结束', icon: 'success' });
          setTimeout(() => this.loadTripDetail(trip._id), 500);
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  onPublishLogTap: function () {
    if (this.data.tripStage !== 'ongoing') {
      wx.showToast({
        title: this.data.tripStage === 'not_started' ? '出发后才能发布日志' : '行程已结束，不能发布日志',
        icon: 'none'
      });
      return;
    }
    if (!this.data.canPublishLog) {
      wx.showToast({ title: '暂无发布日志权限', icon: 'none' });
      return;
    }
    this.setData({
      showPublishModal: true,
      publishContent: '',
      publishImages: [],
      publishLocation: null,
      publishSubmitting: false
    });
  },

  // ========== 行程评论 ==========

  formatCommentTime: function (timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - Number(timestamp);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    const date = new Date(Number(timestamp));
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  formatTripReply: function (reply) {
    const currentUserId = app.globalData.openid || wx.getStorageSync('openid') || '';
    const tripCreatorId = this.data.trip && this.data.trip.creatorId || '';
    return {
      ...reply,
      timeText: reply.timeText || this.formatCommentTime(reply.createdAt),
      canDelete: !!currentUserId && (reply.authorId === currentUserId || tripCreatorId === currentUserId)
    };
  },

  formatTripComment: function (comment) {
    const currentUserId = app.globalData.openid || wx.getStorageSync('openid') || '';
    const tripCreatorId = this.data.trip && this.data.trip.creatorId || '';
    return {
      ...comment,
      timeText: comment.timeText || this.formatCommentTime(comment.createdAt),
      replyCount: Math.max(0, Number(comment.replyCount) || 0),
      replies: (comment.replies || []).map(reply => this.formatTripReply(reply)),
      repliesHasMore: comment.repliesHasMore === true,
      repliesLoading: false,
      nextReplyCursor: comment.nextReplyCursor || 0,
      nextReplyCursorId: comment.nextReplyCursorId || '',
      canDelete: !!currentUserId && (comment.authorId === currentUserId || tripCreatorId === currentUserId)
    };
  },

  loadComments: function (reset) {
    if (!this.data.trip || this._loadingComments) return Promise.resolve();
    if (!reset && !this.data.commentsHasMore) return Promise.resolve();
    if (reset) {
      this._commentCursor = 0;
      this._commentCursorId = '';
    }
    this._loadingComments = true;
    this.setData({ commentsLoading: true, commentsError: false });
    const request = { tripId: this.data.trip._id, pageSize: 20 };
    if (!reset && this._commentCursor) {
      request.cursor = this._commentCursor;
      request.cursorId = this._commentCursorId;
    }
    const requestTripId = request.tripId;
    return api.tripCommentList(request).then(result => {
      if (!this.data.trip || this.data.trip._id !== requestTripId) return;
      const incoming = (result.comments || []).map(comment => this.formatTripComment(comment));
      this._commentCursor = result.nextCursor || 0;
      this._commentCursorId = result.nextCursorId || '';
      const nextData = {
        comments: reset ? incoming : this.data.comments.concat(incoming),
        commentsHasMore: result.hasMore === true,
        commentsLoading: false,
        commentsError: false
      };
      if (Number.isFinite(Number(result.commentCount))) {
        nextData['trip.commentCount'] = Math.max(0, Number(result.commentCount));
      }
      this._commentsLoaded = true;
      this.setData(nextData);
    }).catch(error => {
      this.setData({ commentsLoading: false, commentsError: true });
      if (!reset) wx.showToast({ title: error.message || '评论加载失败', icon: 'none' });
    }).then(() => {
      this._loadingComments = false;
    });
  },

  onCommentInputTap: function () {
    this.setData({ replyTarget: null, commentPlaceholder: '说点什么…', inputFocused: true });
  },

  onReplyTap: function (e) {
    const { targetId, targetType, rootCommentId, userName } = e.currentTarget.dataset;
    if (!targetId || ['comment', 'reply'].indexOf(targetType) === -1) return;
    this.setData({
      replyTarget: { id: targetId, type: targetType, rootCommentId: rootCommentId || targetId, userName: userName || '旅行者' },
      commentPlaceholder: `回复给${userName || '旅行者'}`,
      inputFocused: true
    });
  },

  onCommentInput: function (e) {
    this.setData({ commentDraft: e.detail.value || '' });
  },

  onCommentFocus: function () {
    this.setData({ inputFocused: true });
  },

  onCommentBlur: function () {
    this.setData({ inputFocused: false });
  },

  onCommentConfirm: function () {
    const content = String(this.data.commentDraft || '').trim();
    if (!content || !this.data.trip || this.data.submittingComment) return;
    if (!auth.ensureLogin()) {
      auth.saveDeepLink(`/pages/trip-detail/trip-detail?id=${encodeURIComponent(this.data.trip._id)}`);
      return;
    }
    const replyTarget = this.data.replyTarget;
    this.setData({ submittingComment: true });
    wx.showLoading({ title: replyTarget ? '回复中...' : '评论中...', mask: true });
    api.tripCommentCreate(this.data.trip._id, content, replyTarget).then(result => {
      const nextComments = this.data.comments.slice();
      if (result.isReply) {
        const rootIndex = nextComments.findIndex(item => item._id === result.rootCommentId);
        if (rootIndex >= 0) {
          const root = { ...nextComments[rootIndex] };
          root.replies = (root.replies || []).concat([this.formatTripReply(result.comment || {})]);
          root.replyCount = Math.max(root.replies.length, Number(result.rootReplyCount) || root.replyCount + 1);
          nextComments[rootIndex] = root;
        }
      } else {
        nextComments.unshift(this.formatTripComment(result.comment || {}));
      }
      this.setData({
        comments: nextComments,
        commentDraft: '',
        commentPlaceholder: '说点什么…',
        replyTarget: null,
        inputFocused: false,
        submittingComment: false,
        commentsError: false,
        'trip.commentCount': Math.max(0, Number(result.commentCount) || 0)
      });
      wx.hideLoading();
      wx.showToast({ title: result.isReply ? '回复成功' : '评论成功', icon: 'success' });
    }).catch(error => {
      this.setData({ submittingComment: false });
      wx.hideLoading();
      wx.showToast({ title: error.message || '评论失败，请重试', icon: 'none' });
    });
  },

  onLoadMoreComments: function () {
    this.loadComments(this.data.comments.length === 0);
  },

  onLoadMoreReplies: function (e) {
    const rootCommentId = e.currentTarget.dataset.rootCommentId;
    const index = this.data.comments.findIndex(comment => comment._id === rootCommentId);
    if (index < 0 || this.data.comments[index].repliesLoading) return;
    const root = this.data.comments[index];
    this.setData({ [`comments[${index}].repliesLoading`]: true });
    const request = { tripId: this.data.trip._id, rootCommentId, pageSize: 20 };
    if (root.nextReplyCursor) {
      request.cursor = root.nextReplyCursor;
      request.cursorId = root.nextReplyCursorId;
    }
    api.tripReplyList(request).then(result => {
      const currentIndex = this.data.comments.findIndex(comment => comment._id === rootCommentId);
      if (currentIndex < 0) return;
      const existing = this.data.comments[currentIndex].replies || [];
      const seen = new Set(existing.map(reply => reply._id));
      const incoming = (result.replies || []).map(reply => this.formatTripReply(reply)).filter(reply => !seen.has(reply._id));
      this.setData({
        [`comments[${currentIndex}].replies`]: existing.concat(incoming),
        [`comments[${currentIndex}].replyCount`]: Math.max(0, Number(result.replyCount) || 0),
        [`comments[${currentIndex}].repliesHasMore`]: result.hasMore === true,
        [`comments[${currentIndex}].repliesLoading`]: false,
        [`comments[${currentIndex}].nextReplyCursor`]: result.nextCursor || 0,
        [`comments[${currentIndex}].nextReplyCursorId`]: result.nextCursorId || ''
      });
    }).catch(error => {
      this.setData({ [`comments[${index}].repliesLoading`]: false });
      wx.showToast({ title: error.message || '回复加载失败', icon: 'none' });
    });
  },

  onCommentLongPress: function (e) {
    const commentId = e.currentTarget.dataset.commentId;
    const targetType = e.currentTarget.dataset.targetType || 'comment';
    const rootCommentId = e.currentTarget.dataset.rootCommentId || commentId;
    let target;
    if (targetType === 'reply') {
      const root = this.data.comments.find(item => item._id === rootCommentId);
      target = root && (root.replies || []).find(reply => reply._id === commentId);
    } else {
      target = this.data.comments.find(item => item._id === commentId);
    }
    if (!target || !target.canDelete || this._deletingCommentId) return;
    wx.showActionSheet({
      itemList: ['删除'],
      itemColor: '#FF4D4F',
      success: result => {
        if (result.tapIndex === 0) this.deleteComment(commentId, targetType, rootCommentId);
      }
    });
  },

  deleteComment: function (commentId, targetType, rootCommentId) {
    if (!this.data.trip || !commentId || this._deletingCommentId) return;
    this._deletingCommentId = `${targetType}:${commentId}`;
    wx.showLoading({ title: '删除中...', mask: true });
    api.tripCommentDelete(this.data.trip._id, commentId, targetType).then(result => {
      let nextComments = this.data.comments.slice();
      if (targetType === 'reply') {
        const rootIndex = nextComments.findIndex(comment => comment._id === rootCommentId);
        if (rootIndex >= 0) {
          const root = { ...nextComments[rootIndex] };
          root.replies = (root.replies || []).filter(reply => reply._id !== commentId);
          root.replyCount = Math.max(0, Number(result.rootReplyCount) || 0);
          nextComments[rootIndex] = root;
        }
      } else {
        nextComments = nextComments.filter(comment => comment._id !== commentId);
      }
      const nextData = {
        comments: nextComments,
        'trip.commentCount': Math.max(0, Number(result.commentCount) || 0)
      };
      if (this.data.replyTarget && (this.data.replyTarget.id === commentId ||
        (targetType === 'comment' && this.data.replyTarget.rootCommentId === commentId))) {
        nextData.replyTarget = null;
        nextData.commentPlaceholder = '说点什么…';
      }
      this.setData(nextData);
      wx.hideLoading();
      wx.showToast({ title: '已删除', icon: 'success' });
    }).catch(error => {
      wx.hideLoading();
      wx.showToast({ title: error.message || '删除失败，请重试', icon: 'none' });
    }).then(() => {
      this._deletingCommentId = '';
    });
  },

  onCommentAuthorTap: function (e) {
    const userId = e.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/user-profile/user-profile?id=${encodeURIComponent(userId)}` });
  },

  onClosePublishModal: function () {
    this.setData({ showPublishModal: false });
  },

  onPublishContentInput: function (e) {
    this.setData({ publishContent: e.detail.value });
  },

  onChoosePublishLocation: function () {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          publishLocation: {
            name: res.name || '',
            address: res.address || '',
            latitude: Number(res.latitude) || 0,
            longitude: Number(res.longitude) || 0
          }
        });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        if (/auth deny/i.test(msg)) {
          wx.showToast({ title: '请在设置中开启位置权限', icon: 'none' });
          return;
        }
        wx.showToast({ title: '定位选择失败', icon: 'none' });
      }
    });
  },

  onRemovePublishLocation: function () {
    this.setData({ publishLocation: null });
  },

  onOpenDestLocation: function () {
    const loc = this.data.trip && this.data.trip.destLocation;
    if (!loc || !loc.latitude || !loc.longitude) {
      wx.showToast({ title: '暂无可用定位', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      name: loc.name || '',
      address: loc.address || '',
      scale: 16
    });
  },

  onOpenLogLocation: function (e) {
    const { latitude, longitude, name, address } = e.currentTarget.dataset;
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!lat || !lng) {
      wx.showToast({ title: '暂无可用定位', icon: 'none' });
      return;
    }

    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: name || '',
      address: address || '',
      scale: 16
    });
  },

  onChooseImage: function () {
    const remaining = 9 - this.data.publishImages.length;
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(f => ({
          tempUrl: f.tempFilePath,
          tempFilePath: f.tempFilePath
        }));
        this.setData({ publishImages: [...this.data.publishImages, ...newImages] });
      }
    });
  },

  onRemovePublishImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.publishImages];
    images.splice(index, 1);
    this.setData({ publishImages: images });
  },

  onSubmitLog: async function () {
    if (this.data.publishSubmitting) return;

    const content = this.data.publishContent.trim();
    const images = this.data.publishImages;
    const location = this.data.publishLocation;
    const trip = this.data.trip;

    console.log('[发布日志] content:', content, 'images:', images.length, 'location:', !!location, 'tripId:', trip && trip._id, 'tripStage:', trip && trip.tripStage);

    if (!content && images.length === 0 && !location) {
      wx.showToast({ title: '请输入内容、添加图片或选择定位', icon: 'none' });
      return;
    }
    if (content.length > 200) {
      wx.showToast({ title: '内容不能超过200字', icon: 'none' });
      return;
    }

    this.setData({ publishSubmitting: true });

    try {
      const uploadResult = await tripMediaUpload.uploadFiles({
        tripId: trip._id,
        purpose: 'log',
        files: images.map(img => ({ filePath: img.tempFilePath }))
      });
      const uploadedImages = uploadResult.media;

      console.log('[发布日志] 调用 tripLogCreate', { tripId: trip._id, content, images: uploadedImages, location });
      const res = await api.tripLogCreate({
        tripId: trip._id,
        content,
        images: uploadedImages,
        uploadSessionId: uploadResult.sessionId || undefined,
        location
      });
      console.log('[发布日志] 发布成功', res);

      this.setData({
        showPublishModal: false,
        publishSubmitting: false,
        publishContent: '',
        publishImages: [],
        publishLocation: null
      });
      wx.showToast({
        title: res.log && res.log.reviewStatus === 'reviewing' ? '已提交审核' : '发布成功',
        icon: 'success'
      });

      // 切到旅途记录 tab 并刷新日志
      this.setData({ activeTab: 'log' });
      this.loadLogs(trip._id, { ...trip, tripStage: trip.tripStage || 'ongoing', logCount: (trip.logCount || 0) + 1 });
    } catch (err) {
      console.error('[发布日志] 失败', err, err && err.message, err && err.result);
      this.setData({ publishSubmitting: false });
      wx.showToast({ title: err.message || '发布失败，请重试', icon: 'none' });
    }
  },

  onLogMenuTap: function (e) {
    const { groupIndex, logIndex, logId, canDelete, isPublisher } = e.currentTarget.dataset;
    this.setData({
      showLogMenu: true,
      logMenuGroupIndex: groupIndex,
      logMenuLogIndex: logIndex,
      logMenuLogId: logId,
      logMenuCanDelete: !!canDelete,
      logMenuCanReport: !isPublisher
    });
  },

  onLogMenuReport: function () {
    const logId = this.data.logMenuLogId;
    if (!logId || !this.data.logMenuCanReport) return;
    this.setData({ showLogMenu: false });
    wx.navigateTo({
      url: '/pages/report/report?type=trip_log&id=' + encodeURIComponent(logId)
    });
  },

  onCloseLogMenu: function () {
    this.setData({ showLogMenu: false });
  },

  onLogMenuDelete: function () {
    const logId = this.data.logMenuLogId;
    const tripId = this.data.trip._id;
    this.setData({ showLogMenu: false });
    wx.showModal({
      title: '删除日志',
      content: '确认删除这条日志吗？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await api.tripLogDelete(tripId, logId);
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => this.loadTripDetail(tripId), 500);
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  onPreviewImage: function (e) {
    const urls = e.currentTarget.dataset.urls || [];
    const current = e.currentTarget.dataset.current;
    if (urls.length > 0) {
      wx.previewImage({ current, urls });
    }
  },

  onAuthorizePublisher: async function () {
    const member = this.data.selectedMember;
    const trip = this.data.trip;
    if (!member || !trip) return;

    wx.showLoading({ title: '处理中...' });
    try {
      await api.tripLogAuthorize(trip._id, member.userId);
      wx.hideLoading();
      wx.showToast({ title: '授权成功', icon: 'success' });
      this.onCloseMemberModal();
      setTimeout(() => this.loadTripDetail(trip._id), 500);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '授权失败', icon: 'none' });
    }
  },

  onUnauthorizePublisher: async function () {
    const member = this.data.selectedMember;
    const trip = this.data.trip;
    if (!member || !trip) return;

    wx.showLoading({ title: '处理中...' });
    try {
      await api.tripLogUnauthorize(trip._id, member.userId);
      wx.hideLoading();
      wx.showToast({ title: '已取消授权', icon: 'success' });
      this.onCloseMemberModal();
      setTimeout(() => this.loadTripDetail(trip._id), 500);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  onEditTrip: function () {
    const trip = this.data.trip;
    wx.navigateTo({
      url: `/pages/trip-publish/trip-publish?id=${trip._id}`,
      events: {
        tripUpdated: () => {
          this.loadTripDetail(trip._id);
        }
      }
    });
  },

  onQuitTrip: function () {
    const trip = this.data.trip;
    wx.showModal({
      title: '退出行程',
      content: '确定要退出该行程吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });

          try {
            await api.tripQuit(trip._id);

            wx.hideLoading();
            wx.showToast({ title: '已退出行程', icon: 'success' });

            setTimeout(() => {
              wx.navigateBack();
            }, 1000);
          } catch (err) {
            wx.hideLoading();
            console.error('退出行程失败', err);
            wx.showToast({ title: err.message || '退出失败，请重试', icon: 'none' });
          }
        }
      }
    });
  },

  onJoinTap: async function () {
    auth.saveDeepLink(`/pages/trip-detail/trip-detail?id=${this.data.tripId}`);
    if (!auth.ensureLogin()) {
      return;
    }

    if (!this.data.canJoin || this.data.applySubmitting) {
      return;
    }

    const trip = this.data.trip;
    const openid = app.globalData.openid;
    if (trip.participants && trip.participants.some(p => p.userId === openid)) {
      wx.showToast({ title: '您已参与该行程', icon: 'none' });
      return;
    }

    this.setData({ applySubmitting: true });
    wx.showLoading({ title: '发送中...', mask: true });
    try {
      await api.applyCreate({ tripId: trip._id });
      this.setData({
        applySubmitting: false,
        canJoin: false,
        joinBtnText: '申请已发送'
      });
      wx.hideLoading();
      wx.showToast({ title: '申请已发送', icon: 'success' });
    } catch (err) {
      this.setData({ applySubmitting: false });
      wx.hideLoading();
      wx.showToast({ title: err.message || '发送失败，请重试', icon: 'none' });
    }
  },

  onMemberTap: function (e) {
    const member = e.currentTarget.dataset.member;
    if (!member) return;
    this.openMemberModal(member);
  },

  onCreatorTap: function () {
    const trip = this.data.trip;
    if (!trip || !trip.creatorId) return;

    this.openMemberModal({
      userId: trip.creatorId,
      nickname: trip.creatorName,
      avatar: trip.creatorAvatar
    });
  },

  openMemberModal: function (member) {
    if (!member) return;

    let joinTimeText = '刚刚';
    if (member.joinTime) {
      const now = Date.now();
      const diff = now - member.joinTime;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days > 0) {
        joinTimeText = `${days}天前`;
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        joinTimeText = hours > 0 ? `${hours}小时前` : '刚刚';
      }
    }

    const authorizedIds = (this.data.trip && this.data.trip.logAuthorizedPublisherIds) || [];
    const selectedMemberAuthorized = authorizedIds.includes(member.userId);

    this.setData({
      showMemberModal: true,
      selectedMember: { ...member, joinTimeText },
      selectedMemberAuthorized
    });
  },

  onCloseMemberModal: function () {
    this.setData({
      showMemberModal: false,
      selectedMember: null
    });
  },

  onViewProfile: function () {
    const member = this.data.selectedMember;
    if (member && member.userId) {
      this.onCloseMemberModal();
      wx.navigateTo({
        url: `/pages/user-profile/user-profile?id=${member.userId}`
      });
    }
  },

  onRemoveMember: function () {
    this.setData({
      showMemberModal: false,
      showRemoveConfirm: true
    });
  },

  onCloseRemoveConfirm: function () {
    this.setData({ showRemoveConfirm: false });
  },

  onConfirmRemove: async function () {
    const member = this.data.selectedMember;
    const trip = this.data.trip;

    if (!member || !trip) return;

    wx.showLoading({ title: '处理中...' });

    try {
      await api.tripRemoveMember(trip._id, member.userId);

      wx.hideLoading();
      wx.showToast({ title: '已移除成员', icon: 'success' });

      this.setData({
        showRemoveConfirm: false,
        selectedMember: null
      });

      setTimeout(() => {
        this.loadTripDetail(trip._id);
      }, 500);
    } catch (err) {
      wx.hideLoading();
      console.error('移除成员失败', err);
      wx.showToast({ title: err.message || '移除失败，请重试', icon: 'none' });
    }
  },

  // ========== 更换封面图 ==========

  onOpenCoverModal: function () {
    const trip = this.data.trip;
    if (!trip) return;

    const pendingImages = (trip.coverImages || []).map((fid, i) => ({
      url: (trip.coverImageUrls || [])[i] || '',
      fileID: fid,
      media: (trip.coverImageObjects || [])[i] || null
    }));

    this.setData({ showCoverModal: true, pendingImages, savingCover: false });
  },

  onCloseCoverModal: function () {
    this.setData({ showCoverModal: false });
  },

  onAddCoverImages: function () {
    const remaining = 9 - this.data.pendingImages.length;
    if (remaining <= 0) return;
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImgs = res.tempFiles.map(f => ({ url: f.tempFilePath, filePath: f.tempFilePath }));
        this.setData({ pendingImages: [...this.data.pendingImages, ...newImgs] });
      }
    });
  },

  onRemoveCoverImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.pendingImages];
    images.splice(index, 1);
    this.setData({ pendingImages: images });
  },

  onSaveCoverChanges: async function () {
    if (this.data.savingCover) return;
    const trip = this.data.trip;
    if (!trip) return;

    this.setData({ savingCover: true });

    try {
      // 一次上传全部新增封面，再与保留的旧云文件/COS 图片按原顺序合并。
      const pendingImages = this.data.pendingImages;
      const newCoverItems = pendingImages.filter(img => !!img.filePath);
      const coverUpload = await tripMediaUpload.uploadFiles({
        tripId: trip._id,
        purpose: 'cover',
        files: newCoverItems.map(img => ({ filePath: img.filePath }))
      });
      let newCoverIndex = 0;
      const finalImageObjects = [];
      const finalImageValues = pendingImages.map(img => {
        if (img.filePath) {
          const media = coverUpload.media[newCoverIndex++] || null;
          finalImageObjects.push(media);
          return media && media.url || '';
        }
        finalImageObjects.push(img.media || null);
        return img.fileID || img.url || '';
      }).filter(Boolean);

      await api.tripUpdate({
        tripId: trip._id,
        coverImages: finalImageValues,
        coverImageObjects: finalImageObjects,
        coverUploadSessionId: coverUpload.sessionId || undefined
      });

      // 详情头图只展示封面数组，回退到景点封面，不使用列表头像。
      const imageDisplayUrls = pendingImages.map(img => img.url);
      const attractionCover = this.getPlaceCover(trip.placeId) ||
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop';
      const newCoverUrl = imageDisplayUrls[0] || attractionCover;

      this.setData({
        showCoverModal: false,
        savingCover: false,
        'trip.coverImages': finalImageValues,
        'trip.coverImageObjects': finalImageObjects,
        'trip.coverImageUrls': imageDisplayUrls,
        'trip.placeCoverImage': newCoverUrl,
        'trip.placeCoverImages': imageDisplayUrls.length > 0 ? imageDisplayUrls : [newCoverUrl]
      });

      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      this.setData({ savingCover: false });
      wx.showToast({ title: err.message || '保存失败，请重试', icon: 'none' });
    }
  },

  onShareAppMessage: function () {
    const trip = this.data.trip;
    const title = trip.tripTitle || `${trip.creatorName} 邀你一起去 ${trip.placeName}`;
    return {
      title: title,
      path: `/pages/trip-detail/trip-detail?id=${trip._id}`,
      imageUrl: trip.placeCoverImage
    };
  }
});
