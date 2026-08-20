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
    showJoinApplication: false,
    joinMessage: '',
    userInfo: null,
    showMemberModal: false,
    selectedMember: null,
    selectedMemberAuthorized: false,
    showRemoveConfirm: false,
    // 日志相关
    tripStage: 'not_started',
    isPastTrip: false,
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
    commentImages: [],
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
    savingCover: false,
    // 分享与海报
    showShareSheet: false,
    posterGenerating: false,
    showPosterPreview: false,
    posterTempPath: '',
    posterCodeUrl: ''
  },

  onLoad: async function (options) {
    let tripId = options.id || '';
    const posterScene = options.scene ? decodeURIComponent(options.scene).trim() : '';
    if (!tripId && posterScene) {
      wx.showLoading({ title: '正在打开行程...', mask: true });
      try {
        const sceneResult = await api.tripResolvePosterScene(posterScene);
        tripId = sceneResult.tripId || '';
      } catch (err) {
        wx.hideLoading();
        this.setData({ loading: false, loadError: true });
        wx.showToast({ title: err.message || '行程码已失效', icon: 'none' });
        return;
      }
      wx.hideLoading();
    }
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

  loadLogs: async function (tripId, trip, options = {}) {
    const tripStage = trip.tripStage || 'not_started';
    const logCount = trip.logCount || 0;

    if (!options.force && (tripStage === 'not_started' || logCount === 0)) {
      this.setData({ logGroups: [] });
      return;
    }

    try {
      const res = await api.tripLogList(tripId);
      if (res.success) {
        const groups = this.processLogGroups(res.groups || []);
        const nextData = {
          logGroups: groups,
          showTabs: true,
          activeTab: this.data.activeTab || 'trip'
        };
        if (this.data.trip) {
          nextData.trip = {
            ...this.data.trip,
            logCount: typeof res.logCount === 'number' ? res.logCount : groups.reduce((count, group) => count + group.logs.length, 0)
          };
        }
        this.setData(nextData);
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
        reviewStatusText: log.adminReviewStatus === 'pending'
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
    const isPastTrip = trip.isPastTrip === true || (hasValidTripTime && tripTime < todayStart);

    let statusText = '招募中';
    let canJoin = true;
    let joinBtnText = '申请加入';

    const tripStageForStatus = trip.tripStage || 'not_started';
    if (isPastTrip) {
      statusText = '已结束';
      canJoin = false;
      joinBtnText = '已结束';
    } else if (tripStageForStatus === 'cancelled') {
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
      isPastTrip,
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
        wx.showLoading({ title: '刷新中...', mask: false });
        await this.loadLogs(tripId, this.data.trip || {}, { force: true });
      }
    } finally {
      if (activeTab === 'log') wx.hideLoading();
      wx.stopPullDownRefresh();
    }
  },

  // ========== 日志相关操作 ==========

  onStartLog: function () {
    if (this.data.isPastTrip) {
      wx.showToast({ title: '往期行程不能开始', icon: 'none' });
      return;
    }
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
    if (this.data.isPastTrip) {
      wx.showToast({ title: '行程已结束，不能发布日志', icon: 'none' });
      return;
    }
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
      imageUrls: (reply.images || []).map(image => image.url || '').filter(Boolean),
      timeText: reply.timeText || this.formatCommentTime(reply.createdAt),
      canDelete: !!currentUserId && (reply.authorId === currentUserId || tripCreatorId === currentUserId)
    };
  },

  formatTripComment: function (comment) {
    const currentUserId = app.globalData.openid || wx.getStorageSync('openid') || '';
    const tripCreatorId = this.data.trip && this.data.trip.creatorId || '';
    return {
      ...comment,
      imageUrls: (comment.images || []).map(image => image.url || '').filter(Boolean),
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

  onChooseCommentImages: function () {
    if (this.data.submittingComment) return;
    if (!auth.ensureLogin()) {
      if (this.data.trip) {
        auth.saveDeepLink(`/pages/trip-detail/trip-detail?id=${encodeURIComponent(this.data.trip._id)}`);
      }
      return;
    }
    const remaining = 3 - this.data.commentImages.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多选择3张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: result => {
        const selected = (result.tempFiles || []).map((file, index) => ({
          id: `trip_comment_img_${Date.now()}_${index}`,
          path: file.tempFilePath,
          size: Number(file.size) || 0
        }));
        this.setData({
          commentImages: this.data.commentImages.concat(selected).slice(0, 3),
          inputFocused: true
        });
      }
    });
  },

  onRemoveCommentImage: function (e) {
    if (this.data.submittingComment) return;
    const id = e.currentTarget.dataset.id;
    this.setData({ commentImages: this.data.commentImages.filter(image => image.id !== id) });
  },

  onPreviewCommentDraftImage: function (e) {
    const urls = this.data.commentImages.map(image => image.path);
    if (urls.length > 0) wx.previewImage({ urls, current: e.currentTarget.dataset.current || urls[0] });
  },

  uploadCommentImages: function () {
    if (!this.data.commentImages.length) {
      return Promise.resolve({ images: [], uploadSessionId: '' });
    }
    return tripMediaUpload.uploadFiles({
      tripId: this.data.trip._id,
      purpose: 'comment',
      files: this.data.commentImages.map(image => ({ tempFilePath: image.path }))
    }).then(result => ({
      images: result.media || [],
      uploadSessionId: result.sessionId || ''
    }));
  },

  onCommentConfirm: function () {
    const content = String(this.data.commentDraft || '').trim();
    const hasImages = this.data.commentImages.length > 0;
    if ((!content && !hasImages) || !this.data.trip || this.data.submittingComment) return;
    if (!auth.ensureLogin()) {
      auth.saveDeepLink(`/pages/trip-detail/trip-detail?id=${encodeURIComponent(this.data.trip._id)}`);
      return;
    }
    const replyTarget = this.data.replyTarget;
    this.setData({ submittingComment: true });
    wx.showLoading({ title: replyTarget ? '回复中...' : '评论中...', mask: true });
    this.uploadCommentImages().then(media => {
      return api.tripCommentCreate(this.data.trip._id, content, replyTarget, media);
    }).then(result => {
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
        commentImages: [],
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
    if (this.data.isPastTrip) {
      wx.showToast({ title: '行程已结束，不能发布日志', icon: 'none' });
      return;
    }

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
        title: '发布成功',
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
          const logGroups = (this.data.logGroups || []).map(group => ({
            ...group,
            logs: (group.logs || []).filter(log => log._id !== logId)
          })).filter(group => group.logs.length > 0);
          const trip = this.data.trip || {};
          this.setData({
            logGroups,
            trip: {
              ...trip,
              logCount: Math.max((trip.logCount || 0) - 1, 0)
            }
          });
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
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
    if (this.data.isPastTrip) {
      wx.showToast({ title: '往期行程不能编辑', icon: 'none' });
      return;
    }
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

  onJoinTap: function () {
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

    this.setData({ showJoinApplication: true, joinMessage: '' });
  },

  onPendingMemberTap: function () {
    if (this.data.isCreator || this.data.hasJoined || !this.data.canJoin) return;
    this.onJoinTap();
  },

  onJoinMessageInput: function (event) {
    this.setData({ joinMessage: event.detail.value || '' });
  },

  onCloseJoinApplication: function () {
    if (this.data.applySubmitting) return;
    this.setData({ showJoinApplication: false, joinMessage: '' });
  },

  onSubmitJoinApplication: async function () {
    if (!this.data.showJoinApplication || this.data.applySubmitting) return;
    const trip = this.data.trip;
    if (!trip || !trip._id) return;

    const message = String(this.data.joinMessage || '').trim();
    if (message.length > 200) {
      wx.showToast({ title: '留言不能超过200字', icon: 'none' });
      return;
    }

    this.setData({ applySubmitting: true });
    wx.showLoading({ title: '发送中...', mask: true });
    try {
      await api.applyCreate({ tripId: trip._id, message: message });
      this.setData({
        applySubmitting: false,
        showJoinApplication: false,
        joinMessage: '',
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
    if (this.data.isPastTrip) {
      wx.showToast({ title: '往期行程不能编辑', icon: 'none' });
      return;
    }
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
  },

  onOpenTripShare: function () {
    if (!this.data.trip) return;
    this.setData({ showShareSheet: true });
  },

  onCloseTripShare: function () {
    this.setData({ showShareSheet: false });
  },

  onShareWechatTap: function () {
    this.setData({ showShareSheet: false });
  },

  onGenerateTripPoster: async function () {
    if (this.data.posterGenerating || !this.data.trip) return;
    this.setData({ showShareSheet: false, posterGenerating: true });
    wx.showLoading({ title: '生成海报中...', mask: true });
    try {
      const codeResult = await api.tripPosterCode(this.data.trip._id);
      const posterPath = await this.drawTripPoster(codeResult.codeUrl);
      this.setData({
        posterGenerating: false,
        posterCodeUrl: codeResult.codeUrl,
        posterTempPath: posterPath,
        showPosterPreview: true
      });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      this.setData({ posterGenerating: false });
      console.error('生成行程海报失败', err);
      wx.showToast({ title: err.message || '海报生成失败，请重试', icon: 'none' });
    }
  },

  onClosePosterPreview: function () {
    this.setData({ showPosterPreview: false });
  },

  getPosterCanvas: function () {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this)
        .select('#tripPosterCanvas')
        .fields({ node: true, size: true })
        .exec(result => {
          const item = result && result[0];
          if (!item || !item.node) {
            reject(new Error('海报画布初始化失败'));
            return;
          }
          resolve(item.node);
        });
    });
  },

  loadPosterImage: function (canvas, source) {
    return new Promise((resolve, reject) => {
      if (!source) {
        reject(new Error('图片地址为空'));
        return;
      }
      const load = path => {
        const image = canvas.createImage();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('海报素材加载失败'));
        image.src = path;
      };
      if (/^https?:\/\//.test(source) || /^cloud:\/\//.test(source)) {
        wx.getImageInfo({
          src: source,
          success: result => load(result.path),
          fail: () => reject(new Error('海报图片下载失败，请检查下载域名配置'))
        });
      } else {
        load(source);
      }
    });
  },

  drawPosterRoundRect: function (ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  },

  drawPosterCover: function (ctx, image, x, y, width, height) {
    const sourceRatio = image.width / image.height;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;
    if (sourceRatio > targetRatio) {
      sw = image.height * targetRatio;
      sx = (image.width - sw) / 2;
    } else {
      sh = image.width / targetRatio;
      sy = (image.height - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  },

  drawPosterCalendarIcon: function (ctx, x, y, size) {
    const scale = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#4A90E2';
    ctx.globalAlpha = .72;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(11.5, 21);
    ctx.lineTo(6, 21);
    ctx.quadraticCurveTo(4, 21, 4, 19);
    ctx.lineTo(4, 7);
    ctx.quadraticCurveTo(4, 5, 6, 5);
    ctx.lineTo(18, 5);
    ctx.quadraticCurveTo(20, 5, 20, 7);
    ctx.lineTo(20, 13);
    ctx.moveTo(8, 3);
    ctx.lineTo(8, 7);
    ctx.moveTo(16, 3);
    ctx.lineTo(16, 7);
    ctx.moveTo(4, 11);
    ctx.lineTo(20, 11);
    ctx.moveTo(15, 19);
    ctx.lineTo(17, 21);
    ctx.lineTo(21, 17);
    ctx.stroke();
    ctx.restore();
  },

  drawPosterLocationIcon: function (ctx, x, y, size) {
    const scale = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#4A90E2';
    ctx.globalAlpha = .72;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(12, 22);
    ctx.bezierCurveTo(11.5, 22, 11.05, 21.78, 10.59, 21.31);
    ctx.lineTo(6.34, 17.07);
    ctx.bezierCurveTo(3.22, 13.95, 3.22, 8.88, 6.34, 5.76);
    ctx.bezierCurveTo(9.47, 2.63, 14.53, 2.63, 17.66, 5.76);
    ctx.bezierCurveTo(20.78, 8.88, 20.78, 13.95, 17.66, 17.07);
    ctx.lineTo(13.41, 21.31);
    ctx.bezierCurveTo(12.95, 21.78, 12.5, 22, 12, 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, 11, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  ellipsizePosterText: function (ctx, text, maxWidth) {
    const value = String(text || '');
    if (ctx.measureText(value).width <= maxWidth) return value;
    let result = value;
    while (result && ctx.measureText(result + '…').width > maxWidth) result = result.slice(0, -1);
    return result + '…';
  },

  drawPosterWrappedText: function (ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const lines = this.getPosterTextLines(ctx, text, maxWidth, maxLines);
    lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
    return lines;
  },

  getPosterTextLines: function (ctx, text, maxWidth, maxLines) {
    const paragraphs = String(text || '').split(/\r?\n/);
    const lines = [];
    let truncated = false;
    paragraphs.forEach((paragraph, paragraphIndex) => {
      let line = '';
      Array.from(paragraph).forEach(char => {
        if (maxLines && lines.length >= maxLines) {
          truncated = true;
          return;
        }
        const next = line + char;
        if (ctx.measureText(next).width > maxWidth && line) {
          lines.push(line);
          line = char;
        } else {
          line = next;
        }
      });
      if (line && (!maxLines || lines.length < maxLines)) lines.push(line);
      if (!paragraph && (!maxLines || lines.length < maxLines)) lines.push('');
      if (paragraphIndex < paragraphs.length - 1 && maxLines && lines.length >= maxLines) truncated = true;
    });
    if (truncated && lines.length) {
      lines[lines.length - 1] = this.ellipsizePosterText(ctx, lines[lines.length - 1] + '…', maxWidth);
    }
    return lines.length ? lines : [''];
  },

  getPosterRenderScale: function (logicalWidth, logicalHeight) {
    const targetScale = 2;
    const maxCanvasEdge = 4096;
    const maxCanvasPixels = 12000000;
    const edgeScale = maxCanvasEdge / Math.max(logicalWidth, logicalHeight);
    const areaScale = Math.sqrt(maxCanvasPixels / (logicalWidth * logicalHeight));
    const safeScale = Math.min(targetScale, edgeScale, areaScale);
    if (safeScale < 1) {
      throw new Error('行程内容过长，暂时无法生成海报');
    }
    // 向下保留三位小数，避免浮点取整后越过真机 Canvas 的边长或面积上限。
    return Math.max(1, Math.floor(safeScale * 1000) / 1000);
  },

  drawTripPoster: async function (codeUrl) {
    const trip = this.data.trip;
    const canvas = await this.getPosterCanvas();
    const width = 750;
    canvas.width = width;
    canvas.height = 100;
    let ctx = canvas.getContext('2d');

    // 海报严格沿用行程详情页行程 Tab 的字段顺序与显示条件。
    const infoRows = [
      { label: '出发日期', value: trip.dateText || trip.date || '' },
      { label: '出发地', value: trip.departure || '待定' }
    ];
    if (trip.meetingPlace) infoRows.push({ label: '集合地点', value: trip.meetingPlace });
    if (trip.destLocation) {
      infoRows.push({
        label: '目的地定位',
        value: trip.destLocation.name || trip.destLocation.address || '',
        link: true
      });
    }
    if (trip.meetingTime) infoRows.push({ label: '集合时间', value: trip.meetingTime });
    infoRows.push({ label: '出行方式', value: trip.hasCar ? '有车' : '无车' });
    if (trip.hasCar && (trip.carSeats || trip.carModel)) {
      infoRows.push({
        label: '车辆信息',
        value: [trip.carSeats ? trip.carSeats + '座' : '', trip.carModel || ''].filter(Boolean).join(' · ')
      });
    }
    if (!trip.hasCar && trip.travelDesc) infoRows.push({ label: '出行描述', value: trip.travelDesc });
    if (trip.price) infoRows.push({ label: '人均费用', value: trip.price + '元/人', price: true });
    infoRows.push({
      label: '招募人数',
      value: (trip.currentCount || 0) + '/' + (trip.totalCount || ((trip.currentCount || 0) + (trip.needCount || 0))) + '人'
    });

    ctx.font = '28px sans-serif';
    infoRows.forEach(row => {
      row.lines = this.getPosterTextLines(ctx, row.value, 470);
      row.height = Math.max(86, row.lines.length * 40 + 20);
    });
    const remarkLines = trip.remark ? this.getPosterTextLines(ctx, trip.remark, 646) : [];
    const overviewTop = 398;
    const overviewLeft = 32;
    const titleTop = overviewTop + 34;
    const posterJoinedStatus = this.data.hasJoined && !this.data.isCreator;
    const status = posterJoinedStatus ? '已加入' : (this.data.statusText || '招募中');
    ctx.font = '24px sans-serif';
    const statusWidth = ctx.measureText(status).width + 36;
    const statusX = width - overviewLeft - statusWidth;
    ctx.font = 'bold 42px sans-serif';
    const titleLines = this.getPosterTextLines(
      ctx,
      trip.tripTitle || trip.placeName || '周末行程',
      statusX - overviewLeft - 18,
      2
    );
    const titleHeight = Math.max(58, titleLines.length * 58);
    ctx.font = '27px sans-serif';
    const destinationText = [trip.placeName, trip.placeHighlight].filter(Boolean).join(' · ');
    const destinationLines = this.getPosterTextLines(ctx, destinationText, width - 64);
    const destinationTop = titleTop + titleHeight + 8;
    const dateText = (trip.dateText || trip.date || '') + (trip.meetingTime ? ' ' + trip.meetingTime + ' 出发' : '');
    ctx.font = '28px sans-serif';
    const dateLines = this.getPosterTextLines(ctx, dateText, 620);
    const dateTop = destinationTop + destinationLines.length * 40 + 22;
    const hasOverviewLocation = !!(trip.meetingPlace || trip.departure);
    const overviewLocationText = trip.meetingPlace || trip.departure || '';
    const locationLines = hasOverviewLocation ? this.getPosterTextLines(ctx, overviewLocationText, 620) : [];
    const locationTop = dateTop + dateLines.length * 40 + 22;
    const peopleTop = hasOverviewLocation
      ? locationTop + locationLines.length * 40 + 24
      : dateTop + dateLines.length * 40 + 24;
    const overviewHeight = peopleTop - overviewTop + 64 + 30;
    const contentTop = overviewTop + overviewHeight + 22;
    const remarkHeight = trip.remark ? 30 + 46 + 18 + remarkLines.length * 48 + 30 : 0;
    const infoHeight = 30 + 46 + 12 + infoRows.reduce((sum, row) => sum + row.height, 0) + 30;
    const infoTop = contentTop + (trip.remark ? remarkHeight + 22 : 0);
    const brandTop = infoTop + infoHeight + 22;
    const brandHeight = 230;
    const height = brandTop + brandHeight + 24;
    const renderScale = this.getPosterRenderScale(width, height);
    const physicalWidth = Math.floor(width * renderScale);
    const physicalHeight = Math.floor(height * renderScale);
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
    ctx = canvas.getContext('2d');
    ctx.scale(renderScale, renderScale);

    const logoPromise = this.loadPosterImage(canvas, '/images/xing-logo.png');
    const [logo, code] = await Promise.all([
      logoPromise,
      this.loadPosterImage(canvas, codeUrl)
    ]);
    const cover = await this.loadPosterImage(canvas, trip.placeCoverImage).catch(() => null);
    const avatarImages = await Promise.all((this.data.participants || []).slice(0, 4).map(member => {
      return member.avatar ? this.loadPosterImage(canvas, member.avatar).catch(() => null) : Promise.resolve(null);
    }));

    // 页面背景、封面与顶部概览完全对应 detail-v2-page / hero / overview。
    ctx.fillStyle = '#f5f7fa';
    ctx.fillRect(0, 0, width, height);
    if (cover) {
      this.drawPosterCover(ctx, cover, 0, 0, width, 430);
    } else {
      ctx.fillStyle = '#e8edf3';
      ctx.fillRect(0, 0, width, 430);
      ctx.fillStyle = '#eaf3ff';
      ctx.beginPath();
      ctx.arc(375, 215, 72, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(375, 215, 60, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, 315, 155, 120, 120);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.moveTo(0, overviewTop + 32);
    ctx.arcTo(0, overviewTop, 32, overviewTop, 32);
    ctx.lineTo(width - 32, overviewTop);
    ctx.arcTo(width, overviewTop, width, overviewTop + 32, 32);
    ctx.lineTo(width, overviewTop + overviewHeight);
    ctx.lineTo(0, overviewTop + overviewHeight);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 42px sans-serif';
    ctx.textBaseline = 'top';
    titleLines.forEach((line, index) => ctx.fillText(line, overviewLeft, titleTop + index * 58));
    ctx.font = '24px sans-serif';
    this.drawPosterRoundRect(ctx, statusX, titleTop + 6, statusWidth, 50, 12);
    ctx.fillStyle = posterJoinedStatus ? '#edf8ef' : '#eaf3ff';
    ctx.fill();
    ctx.fillStyle = posterJoinedStatus ? '#52a663' : '#2f80ed';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(status, statusX + statusWidth / 2, titleTop + 31);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#2f80ed';
    ctx.font = '27px sans-serif';
    ctx.textBaseline = 'top';
    destinationLines.forEach((line, index) => ctx.fillText(line, overviewLeft, destinationTop + index * 40));

    const quickRows = [{
      iconType: 'calendar',
      lines: dateLines,
      y: dateTop
    }];
    if (hasOverviewLocation) {
      quickRows.push({
        iconType: 'location',
        lines: locationLines,
        y: locationTop
      });
    }
    ctx.fillStyle = '#677386';
    ctx.font = '28px sans-serif';
    quickRows.forEach(row => {
      if (row.iconType === 'calendar') this.drawPosterCalendarIcon(ctx, overviewLeft, row.y + 2, 34);
      if (row.iconType === 'location') this.drawPosterLocationIcon(ctx, overviewLeft, row.y + 2, 34);
      row.lines.forEach((line, index) => ctx.fillText(line, overviewLeft + 50, row.y + index * 40));
    });

    const participants = (this.data.participants || []).slice(0, 4);
    participants.forEach((member, index) => {
      const centerX = overviewLeft + 27 + index * 46;
      const centerY = peopleTop + 32;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, 23, 0, Math.PI * 2);
      ctx.clip();
      if (avatarImages[index]) {
        this.drawPosterCover(ctx, avatarImages[index], centerX - 23, centerY - 23, 46, 46);
      } else {
        ctx.fillStyle = '#dcecff';
        ctx.fillRect(centerX - 23, centerY - 23, 46, 46);
        ctx.fillStyle = '#2f80ed';
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((member.nickname || '旅').slice(0, 1), centerX, centerY);
      }
      ctx.restore();
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#697586';
    ctx.font = '25px sans-serif';
    const peopleTextX = overviewLeft + (participants.length ? (participants.length - 1) * 46 + 68 : 0);
    ctx.fillText(
      '已加入 ' + (trip.currentCount || 0) + '/' + (trip.totalCount || ((trip.currentCount || 0) + (trip.needCount || 0))) + ' 人',
      peopleTextX,
      peopleTop + 32
    );

    const drawSectionCard = (top, cardHeight) => {
      ctx.save();
      ctx.shadowColor = 'rgba(29, 55, 90, .05)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 6;
      this.drawPosterRoundRect(ctx, 24, top, 702, cardHeight, 22);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    };

    if (trip.remark) {
      drawSectionCard(contentTop, remarkHeight);
      ctx.fillStyle = '#172033';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('行程说明', 52, contentTop + 30);
      ctx.fillStyle = '#566274';
      ctx.font = '28px sans-serif';
      this.drawPosterWrappedText(ctx, trip.remark, 52, contentTop + 94, 646, 48);
    }

    drawSectionCard(infoTop, infoHeight);
    ctx.fillStyle = '#172033';
    ctx.font = 'bold 32px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('行程信息', 52, infoTop + 30);
    const listTop = infoTop + 88;
    let rowTop = listTop;
    infoRows.forEach((row, index) => {
      const rowCenter = rowTop + row.height / 2;
      ctx.fillStyle = '#8a94a4';
      ctx.font = '27px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.label, 52, rowCenter);
      ctx.fillStyle = row.price ? '#ff7d36' : (row.link ? '#2f80ed' : '#303a4b');
      ctx.font = row.price ? 'bold 28px sans-serif' : '28px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = row.lines.length > 1 ? 'top' : 'middle';
      const valueTop = row.lines.length > 1 ? rowTop + 10 : rowCenter;
      row.lines.forEach((line, lineIndex) => ctx.fillText(line, 698, valueTop + lineIndex * 40));
      if (index < infoRows.length - 1) {
        ctx.strokeStyle = '#f0f2f5';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(52, rowTop + row.height);
        ctx.lineTo(698, rowTop + row.height);
        ctx.stroke();
      }
      rowTop += row.height;
    });

    // 仅在行程主体之后追加品牌组件；不加入成员区、Tab、评论或底部操作栏。
    drawSectionCard(brandTop, brandHeight);
    const logoCenterX = 99;
    const logoCenterY = brandTop + 103;
    ctx.fillStyle = '#eaf3ff';
    ctx.beginPath();
    ctx.arc(logoCenterX, logoCenterY, 48, 0, Math.PI * 2);
    ctx.fill();
    // 直接等比绘制项目原始正方形 Logo，黑色四角由 Canvas 圆形 clip 自然排除。
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoCenterX, logoCenterY, 32, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, logoCenterX - 32, logoCenterY - 32, 64, 64);
    ctx.restore();

    ctx.fillStyle = '#17243b';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('周末约行', 168, brandTop + 86);
    ctx.fillStyle = '#7b8798';
    ctx.font = '19px sans-serif';
    ctx.fillText('发现同路的人，记录真实旅途', 168, brandTop + 128);

    const codeCenterX = 594;
    const codeCenterY = brandTop + 86;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(codeCenterX, codeCenterY, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(code, codeCenterX - 62, codeCenterY - 62, 124, 124);
    ctx.fillStyle = '#697586';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('微信扫码，查看行程详情', codeCenterX, brandTop + 166);

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvas,
          x: 0,
          y: 0,
          width: physicalWidth,
          height: physicalHeight,
          destWidth: physicalWidth,
          destHeight: physicalHeight,
          fileType: 'png',
          success: result => resolve(result.tempFilePath),
          fail: () => reject(new Error('海报图片导出失败'))
        });
      }, 80);
    });
  }
});
