// pages/trip-detail/trip-detail.js
const app = getApp();
const api = require('../../utils/api.js');
const auth = require('../../utils/auth.js');
const nav = require('../../utils/nav.js');

Page({
  data: {
    statusBarHeight: 0,
    tripId: '',
    trip: null,
    participants: [],
    statusText: '招募中',
    remainCount: 0,
    joinBtnText: '申请加入',
    canJoin: true,
    loading: true,
    hasJoined: false,
    isCreator: false,
    maskedPhone: '',
    showApplyModal: false,
    userInfo: null,
    showMemberModal: false,
    selectedMember: null,
    selectedMemberAuthorized: false,
    showRemoveConfirm: false,
    // 日志相关
    tripStage: 'not_started',
    isTripDay: false,
    activeTab: 'trip',
    showTabs: false,
    canPublishLog: false,
    logGroups: [],
    showPublishModal: false,
    publishContent: '',
    publishImages: [],
    publishSubmitting: false
  },

  onLoad: async function (options) {
    const tripId = options.id || '';
    const windowInfo = wx.getWindowInfo();
    this.setData({
      tripId,
      statusBarHeight: windowInfo.statusBarHeight
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

  onShow: function () {
    this.setData({ userInfo: app.globalData.userInfo });
    if (this.data.tripId) {
      if (this.data.trip) {
        this.loadTripDetail(this.data.tripId);
      } else if (app.globalData.userInfo) {
        this.loadTripDetail(this.data.tripId);
      }
    }
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
    wx.showLoading({ title: '加载中...', mask: true });

    try {
      const res = await api.tripGet(tripId);

      if (res.success && res.trip) {
        await this.processTripData(res.trip);
        // 加载日志
        this.loadLogs(tripId, res.trip);
        return;
      }
    } catch (err) {
      console.warn('加载行程详情失败', err);
    }

    this.loadMockTripDetail();
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
        const showTabs = groups.length > 0 || tripStage === 'ongoing';
        this.setData({
          logGroups: groups,
          showTabs,
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
        timeText: this.formatLogTime(log.createdAt),
        imageUrls: (log.images || []).map(img => img.tempFileURL || img.fileID)
      }))
    }));
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

    let placeCoverImage = trip.placeId ? this.getPlaceCover(trip.placeId) : '';

    const creatorAvatar = trip.creatorAvatar || '';
    const participants = trip.participants || [];

    const processedTrip = {
      ...trip,
      creatorAvatar,
      dateText,
      totalCount,
      status: trip.status,
      placeCoverImage: placeCoverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
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

    // 是否展示 tabs（已开始或有日志）
    const logCount = trip.logCount || 0;
    const showTabs = tripStage === 'ongoing' || tripStage === 'ended' || logCount > 0;

    // 默认展示行程 tab
    const activeTab = 'trip';

    let maskedPhone = '';
    if (trip.contactPhone) {
      const phone = trip.contactPhone;
      maskedPhone = phone.substring(0, 3) + '****' + phone.substring(7);
    }

    this.setData({
      trip: processedTrip,
      participants,
      statusText,
      remainCount,
      canJoin,
      joinBtnText,
      hasJoined,
      isCreator,
      maskedPhone,
      loading: false,
      tripStage: tripStage,
      canPublishLog,
      isTripDay,
      showTabs,
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

  loadMockTripDetail: function () {
    const mockTrip = {
      _id: 'trip_001',
      tripTitle: '周六灵山徒步',
      placeName: '东灵山',
      placeHighlight: '北京最高峰',
      placeCoverImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
      date: '2026-04-12',
      dateText: '2026-04-12 周六',
      departure: '海淀区',
      meetingPlace: '海淀黄庄地铁站B口',
      meetingTime: '08:00',
      currentCount: 2,
      totalCount: 4,
      needCount: 2,
      hasCar: true,
      carSeats: '5',
      carModel: 'SUV',
      price: '150',
      contactPhone: '13800138000',
      status: 'open',
      remark: '周六早上8点在海淀黄庄地铁站B口集合，自驾前往灵山，预计10:30到达。下午4点返程。费用AA，油费+门票约150元/人。',
      creatorId: 'user_001',
      creatorName: '张伟',
      creatorAvatar: 'https://i.pravatar.cc/100?img=1',
      creatorTripCount: 5,
      creatorRating: 98,
      tripStage: 'not_started',
      logCount: 0,
      logAuthorizedPublisherIds: []
    };

    const mockParticipants = [
      { userId: 'p1', nickname: '张伟', avatar: 'https://i.pravatar.cc/100?img=1' },
      { userId: 'p2', nickname: '李明', avatar: 'https://i.pravatar.cc/100?img=5' }
    ];

    let maskedPhone = '';
    if (mockTrip.contactPhone) {
      maskedPhone = mockTrip.contactPhone.substring(0, 3) + '****' + mockTrip.contactPhone.substring(7);
    }

    this.setData({
      trip: mockTrip,
      participants: mockParticipants,
      statusText: '招募中',
      remainCount: 2,
      canJoin: true,
      joinBtnText: '申请加入',
      maskedPhone,
      loading: false,
      tripStage: 'not_started',
      showTabs: false,
      canPublishLog: false
    });

    wx.hideLoading();
  },

  // ========== Tab 切换 ==========

  onSwitchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
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
    this.setData({
      showPublishModal: true,
      publishContent: '',
      publishImages: [],
      publishSubmitting: false
    });
  },

  onClosePublishModal: function () {
    this.setData({ showPublishModal: false });
  },

  onPublishContentInput: function (e) {
    this.setData({ publishContent: e.detail.value });
  },

  onChooseImage: function () {
    const remaining = 3 - this.data.publishImages.length;
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
    const trip = this.data.trip;

    console.log('[发布日志] content:', content, 'images:', images.length, 'tripId:', trip && trip._id, 'tripStage:', trip && trip.tripStage);

    if (!content && images.length === 0) {
      wx.showToast({ title: '请输入内容或添加图片', icon: 'none' });
      return;
    }
    if (content.length > 200) {
      wx.showToast({ title: '内容不能超过200字', icon: 'none' });
      return;
    }

    this.setData({ publishSubmitting: true });

    try {
      // 上传图片
      const uploadedImages = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const ts = Date.now();
        const cloudPath = `trip-logs/${trip._id}/${app.globalData.openid}/${ts}_${i}.jpg`;
        console.log('[发布日志] 上传图片', i, cloudPath);
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: img.tempFilePath
        });
        console.log('[发布日志] 图片上传成功', uploadRes.fileID);
        uploadedImages.push({
          fileID: uploadRes.fileID,
          cloudPath,
          sort: i
        });
      }

      console.log('[发布日志] 调用 tripLogCreate', { tripId: trip._id, content, images: uploadedImages });
      const res = await api.tripLogCreate({
        tripId: trip._id,
        content,
        images: uploadedImages
      });
      console.log('[发布日志] 发布成功', res);

      this.setData({ showPublishModal: false, publishSubmitting: false });
      wx.showToast({ title: '发布成功', icon: 'success' });

      // 切到旅途记录 tab 并刷新日志
      this.setData({ activeTab: 'log' });
      this.loadLogs(trip._id, { ...trip, tripStage: trip.tripStage || 'ongoing', logCount: (trip.logCount || 0) + 1 });
    } catch (err) {
      console.error('[发布日志] 失败', err, err && err.message, err && err.result);
      this.setData({ publishSubmitting: false });
      wx.showToast({ title: err.message || '发布失败，请重试', icon: 'none' });
    }
  },

  onDeleteLog: function (e) {
    const { logId, tripId } = e.currentTarget.dataset;
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

  // ========== 原有方法保留 ==========

  onBackTap: function () {
    nav.goBack();
  },

  onCopyPhone: function () {
    const { selectedMember } = this.data;
    const phone = selectedMember && selectedMember.contactPhone;

    if (!phone) {
      wx.showToast({ title: '暂无联系方式', icon: 'none' });
      return;
    }

    wx.setClipboardData({
      data: phone,
      success: () => {
        wx.showToast({ title: '已复制联系方式', icon: 'success' });
      }
    });
  },

  onEditTrip: function () {
    const trip = this.data.trip;
    wx.navigateTo({
      url: `/pages/trip-publish/trip-publish?id=${trip._id}`
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

    if (!this.data.canJoin) {
      return;
    }

    const trip = this.data.trip;
    const openid = app.globalData.openid;
    if (trip.participants && trip.participants.some(p => p.userId === openid)) {
      wx.showToast({ title: '您已参与该行程', icon: 'none' });
      return;
    }

    this.setData({ showApplyModal: true });
  },

  onCloseApplyModal: function () {
    this.setData({ showApplyModal: false });
  },

  onSubmitApplySuccess: function () {
    this.setData({ showApplyModal: false });
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

  onShareAppMessage: function () {
    const trip = this.data.trip;
    const title = trip.tripTitle || `${trip.creatorName} 邀你一起去 ${trip.placeName}`;
    return {
      title: title,
      path: `/pages/trip-detail/trip-detail?id=${trip._id}`,
      imageUrl: trip.placeImage
    };
  }
});
