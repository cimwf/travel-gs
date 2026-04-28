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
    showRemoveConfirm: false
  },

  onLoad: async function (options) {
    const tripId = options.id || '';
    this.setData({ tripId });

    // 检查登录状态（保存 deepLink，登录后回跳到此页）
    auth.saveDeepLink(`/pages/trip-detail/trip-detail?id=${tripId}`);
    if (!auth.ensureLogin()) {
      return;
    }

    // 获取状态栏高度
    const windowInfo = wx.getWindowInfo();
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight,
      userInfo: app.globalData.userInfo
    });

    // 加载景点数据到全局缓存
    await this.loadAttractions();

    if (tripId) {
      this.loadTripDetail(tripId);
      this.recordView(tripId);
    }
  },

  // 加载景点数据到全局缓存
  loadAttractions: async function () {
    await app.getAttractions();
  },

  // 根据 placeId 从全局缓存获取景点封面图
  getPlaceCover: function (placeId) {
    const attractions = app.globalData.attractions || [];
    const attraction = attractions.find(a => a._id === placeId);
    return attraction ? (attraction.coverImage || '') : '';
  },

  onShow: function () {
    this.setData({ userInfo: app.globalData.userInfo });
    if (this.data.tripId) {
      if (this.data.trip) {
        // 已加载过数据，刷新
        this.loadTripDetail(this.data.tripId);
      } else if (app.globalData.userInfo) {
        // 从登录页返回，首次加载数据
        this.loadTripDetail(this.data.tripId);
      }
    }
  },

  // 记录浏览量
  recordView: async function (tripId) {
    if (wx.cloud) {
      try {
        await api.tripView(tripId);
      } catch (err) {
        console.warn('记录浏览量失败', err);
      }
    }
  },

  // 加载行程详情
  loadTripDetail: async function (tripId) {
    wx.showLoading({ title: '加载中...', mask: true });

    try {
      const res = await api.tripGet(tripId);

      if (res.success && res.trip) {
        await this.processTripData(res.trip);
        return;
      }
    } catch (err) {
      console.warn('加载行程详情失败', err);
    }

    // 使用mock数据
    this.loadMockTripDetail();
  },

  // 处理行程数据
  processTripData: async function (trip) {
    // 计算剩余名额
    const remainCount = trip.needCount || 0;
    const totalCount = (trip.currentCount || 0) + (trip.needCount || 0);

    // 动态判断状态
    let statusText = '招募中';
    let canJoin = true;
    let joinBtnText = '申请加入';

    if (trip.status === 'cancelled') {
      statusText = '已取消';
      canJoin = false;
      joinBtnText = '已取消';
    } else if (trip.status === 'stopped') {
      statusText = '停止招募';
      canJoin = false;
      joinBtnText = '停止招募';
    } else if (trip.status === 'ended') {
      statusText = '已结束';
      canJoin = false;
      joinBtnText = '已结束';
    } else if (remainCount <= 0) {
      statusText = '已满员';
      canJoin = false;
      joinBtnText = '已满员';
    } else {
      statusText = '招募中';
      canJoin = true;
      joinBtnText = '申请加入';
    }

    // 格式化日期显示
    let dateText = trip.date;
    if (trip.date) {
      const date = new Date(trip.date);
      const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
      dateText = `${trip.date} 周${weekDays[date.getDay()]}`;
    }

    // 从全局缓存获取景点封面图
    let placeCoverImage = trip.placeId ? this.getPlaceCover(trip.placeId) : '';

    // 发起人和参与者头像已由云函数处理
    const creatorAvatar = trip.creatorAvatar || '';
    const participants = trip.participants || [];

    const processedTrip = {
      ...trip,
      creatorAvatar,
      dateText,
      totalCount,
      status: remainCount <= 0 ? 'full' : trip.status,
      placeCoverImage: placeCoverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
      placeHighlight: this.getPlaceHighlight(trip.placeName)
    };

    // 判断当前用户是否已加入
    const openid = app.globalData.openid;
    const hasJoined = trip.participants && trip.participants.some(p => p.userId === openid);

    // 判断当前用户是否为发起人
    const isCreator = trip.creatorId === openid;

    // 脱敏手机号
    let maskedPhone = '';
    if (trip.contactPhone) {
      const phone = trip.contactPhone;
      maskedPhone = phone.substring(0, 3) + '****' + phone.substring(7);
    }

    this.setData({
      trip: processedTrip,
      participants: participants,
      statusText,
      remainCount,
      canJoin,
      joinBtnText,
      hasJoined,
      isCreator,
      maskedPhone,
      loading: false
    });

    wx.hideLoading();
  },

  // 获取地点亮点描述
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

  // 加载模拟数据
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
      creatorRating: 98
    };

    const mockParticipants = [
      { userId: 'p1', nickname: '张伟', avatar: 'https://i.pravatar.cc/100?img=1' },
      { userId: 'p2', nickname: '李明', avatar: 'https://i.pravatar.cc/100?img=5' }
    ];

    const statusText = '招募中';
    const remainCount = 2;
    const canJoin = true;
    const joinBtnText = '申请加入';

    // 脱敏手机号
    let maskedPhone = '';
    if (mockTrip.contactPhone) {
      maskedPhone = mockTrip.contactPhone.substring(0, 3) + '****' + mockTrip.contactPhone.substring(7);
    }

    this.setData({
      trip: mockTrip,
      participants: mockParticipants,
      statusText,
      remainCount,
      canJoin,
      joinBtnText,
      maskedPhone,
      loading: false
    });

    wx.hideLoading();
  },

  // 返回
  onBackTap: function () {
    nav.goBack();
  },

  // 复制手机号
  onCopyPhone: function () {
    const phone = this.data.trip.contactPhone;
    if (phone) {
      wx.setClipboardData({
        data: phone,
        success: () => {
          wx.showToast({ title: '已复制微信号', icon: 'success' });
        }
      });
    }
  },

  // 编辑行程
  onEditTrip: function () {
    const trip = this.data.trip;
    wx.navigateTo({
      url: `/pages/trip-publish/trip-publish?id=${trip._id}`
    });
  },

  // 分享招募
  onShareRecruit: function () {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    });
  },

  // 退出行程
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

            // 返回上一页
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

  // 分享给朋友
  onShareFriends: function () {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    });
  },

  // 申请加入
  onJoinTap: function () {
    auth.saveDeepLink(`/pages/trip-detail/trip-detail?id=${this.data.tripId}`);
    if (!auth.ensureLogin()) {
      return;
    }

    if (!this.data.canJoin) {
      return;
    }

    const trip = this.data.trip;

    // 检查是否已参与
    const openid = app.globalData.openid;
    if (trip.participants && trip.participants.some(p => p.userId === openid)) {
      wx.showToast({ title: '您已参与该行程', icon: 'none' });
      return;
    }

    // 显示申请加入弹窗
    this.setData({
      showApplyModal: true
    });
  },

  // 关闭申请弹窗
  onCloseApplyModal: function () {
    this.setData({ showApplyModal: false });
  },

  // 提交申请成功回调
  onSubmitApplySuccess: function () {
    this.setData({ showApplyModal: false });
  },

  // 点击成员头像
  onMemberTap: function (e) {
    const member = e.currentTarget.dataset.member;
    if (!member) return;

    // 格式化加入时间
    let joinTimeText = '刚刚';
    if (member.joinTime) {
      const now = Date.now();
      const diff = now - member.joinTime;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days > 0) {
        joinTimeText = `${days}天前`;
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours > 0) {
          joinTimeText = `${hours}小时前`;
        } else {
          joinTimeText = '刚刚';
        }
      }
    }

    this.setData({
      showMemberModal: true,
      selectedMember: {
        ...member,
        joinTimeText
      }
    });
  },

  // 关闭成员弹窗
  onCloseMemberModal: function () {
    this.setData({
      showMemberModal: false,
      selectedMember: null
    });
  },

  // 查看资料
  onViewProfile: function () {
    const member = this.data.selectedMember;
    if (member && member.userId) {
      // 关闭弹窗
      this.onCloseMemberModal();
      // 跳转到用户资料页
      wx.navigateTo({
        url: `/pages/user-profile/user-profile?id=${member.userId}`
      });
    }
  },

  // 移除成员
  onRemoveMember: function () {
    this.setData({
      showMemberModal: false,
      showRemoveConfirm: true
    });
  },

  // 关闭移除确认弹窗
  onCloseRemoveConfirm: function () {
    this.setData({
      showRemoveConfirm: false
    });
  },

  // 确认移除成员
  onConfirmRemove: async function () {
    const member = this.data.selectedMember;
    const trip = this.data.trip;

    if (!member || !trip) return;

    wx.showLoading({ title: '处理中...' });

    try {
      await api.tripRemoveMember(trip._id, member.userId);

      wx.hideLoading();
      wx.showToast({ title: '已移除成员', icon: 'success' });

      // 关闭弹窗并刷新数据
      this.setData({
        showRemoveConfirm: false,
        selectedMember: null
      });

      // 重新加载行程详情
      setTimeout(() => {
        this.loadTripDetail(trip._id);
      }, 500);
    } catch (err) {
      wx.hideLoading();
      console.error('移除成员失败', err);
      wx.showToast({ title: err.message || '移除失败，请重试', icon: 'none' });
    }
  },

  // 分享
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
