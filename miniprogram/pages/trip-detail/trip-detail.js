// pages/trip-detail/trip-detail.js
const app = getApp();
const api = require('../../utils/api.js');

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

  onLoad: function (options) {
    // 获取状态栏高度
    const windowInfo = wx.getWindowInfo();
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight,
      userInfo: app.globalData.userInfo
    });

    const tripId = options.id || '';
    this.setData({ tripId });

    if (tripId) {
      this.loadTripDetail(tripId);
      this.recordView(tripId);
    }
  },

  onShow: function () {
    this.setData({ userInfo: app.globalData.userInfo });
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
    this.setData({ loading: true });

    // 尝试从数据库加载
    if (wx.cloud) {
      try {
        const db = wx.cloud.database();
        const res = await db.collection('trips').doc(tripId).get();

        if (res.data) {
          const trip = res.data;
          await this.processTripData(trip);
          return;
        }
      } catch (err) {
        console.warn('加载行程详情失败', err);
      }
    }

    // 使用mock数据
    this.loadMockTripDetail();
  },

  // 处理行程数据
  processTripData: async function (trip) {
    const db = wx.cloud ? wx.cloud.database() : null;

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

    // 获取地点图片（从 places 数据库获取）
    let placeImage = '';
    if (trip.placeId) {
      try {
        const placeRes = await db.collection('places').doc(trip.placeId).get();
        if (placeRes.data && placeRes.data.images && placeRes.data.images.length > 0) {
          placeImage = placeRes.data.images[0];
        }
      } catch (err) {
        console.warn('获取地点图片失败', err);
      }
    }

    // 处理发起人头像（云存储链接）
    let creatorAvatar = trip.creatorAvatar || '';
    if (creatorAvatar && creatorAvatar.startsWith('cloud://') && wx.cloud) {
      try {
        const urlRes = await wx.cloud.getTempFileURL({
          fileList: [creatorAvatar]
        });
        if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
          creatorAvatar = urlRes.fileList[0].tempFileURL;
        }
      } catch (err) {
        console.warn('获取发起人头像链接失败', err);
      }
    }

    // 处理参与者头像（云存储链接）
    const participants = (trip.participants || []).map(p => ({
      ...p,
      avatar: p.avatar || ''
    }));

    const fileIDs = participants
      .filter(p => p.avatar && p.avatar.startsWith('cloud://'))
      .map(p => p.avatar);

    if (fileIDs.length > 0 && wx.cloud) {
      try {
        const urlRes = await wx.cloud.getTempFileURL({
          fileList: fileIDs
        });
        if (urlRes.fileList) {
          const avatarMap = {};
          urlRes.fileList.forEach(item => {
            if (item.tempFileURL) {
              avatarMap[item.fileID] = item.tempFileURL;
            }
          });
          participants.forEach(p => {
            if (p.avatar && avatarMap[p.avatar]) {
              p.avatar = avatarMap[p.avatar];
            }
          });
        }
      } catch (err) {
        console.warn('获取参与者头像链接失败', err);
      }
    }

    const processedTrip = {
      ...trip,
      creatorAvatar,
      dateText,
      totalCount,
      status: remainCount <= 0 ? 'full' : trip.status,
      placeImage: placeImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
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
      placeImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
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
  },

  // 返回
  onBackTap: function () {
    wx.navigateBack();
  },

  // 更多操作
  onMoreTap: function () {
    wx.showActionSheet({
      itemList: ['分享行程', '举报行程'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage']
          });
        } else if (res.tapIndex === 1) {
          wx.showToast({ title: '举报成功', icon: 'success' });
        }
      }
    });
  },

  // 关注发起人
  onFollowTap: function () {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showToast({ title: '关注成功', icon: 'success' });
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

          const openid = app.globalData.openid;

          try {
            const db = wx.cloud.database();

            // 从参与者列表中移除当前用户
            const newParticipants = trip.participants.filter(p => p.userId !== openid);

            await db.collection('trips').doc(trip._id).update({
              data: {
                participants: newParticipants,
                currentCount: db.command.inc(-1),
                needCount: db.command.inc(1)
              }
            });

            wx.hideLoading();
            wx.showToast({ title: '已退出行程', icon: 'success' });

            // 返回上一页
            setTimeout(() => {
              wx.navigateBack();
            }, 1000);
          } catch (err) {
            wx.hideLoading();
            console.error('退出行程失败', err);
            wx.showToast({ title: '退出失败，请重试', icon: 'none' });
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
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
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
      const db = wx.cloud.database();

      // 从参与者列表中移除该成员
      const newParticipants = trip.participants.filter(p => p.userId !== member.userId);

      await db.collection('trips').doc(trip._id).update({
        data: {
          participants: newParticipants,
          currentCount: db.command.inc(-1),
          needCount: db.command.inc(1)
        }
      });

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
      wx.showToast({ title: '移除失败，请重试', icon: 'none' });
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
