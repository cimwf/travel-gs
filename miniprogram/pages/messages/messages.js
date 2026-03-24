// pages/messages/messages.js
const app = getApp();
const auth = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    currentTab: 'all',
    
    // 未读计数
    unreadCount: 0,
    notificationsUnread: 0,
    chatsUnread: 0,
    
    // 快捷入口计数
    tripNoticesCount: 0,
    applyNoticesCount: 0,
    systemNoticesCount: 0,
    myGroupsCount: 0,
    
    // 数据
    notifications: [],
    conversations: [],
    
    // 搜索
    showSearch: false,
    searchKeyword: '',
    searchResults: []
  },

  onLoad: function (options) {
    // 从参数获取初始tab
    if (options.tab) {
      this.setData({ currentTab: options.tab });
    }
  },

  onShow: function () {
    // 每次显示时检查登录状态
    this.checkLogin();
  },

  // 检查登录状态
  checkLogin: function () {
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });

    if (isLoggedIn) {
      this.loadData();
    }
  },

  // 加载数据
  loadData: function () {
    this.setData({ loading: true });

    // 模拟数据 - 实际项目中替换为API调用
    setTimeout(() => {
      const notifications = [
        { 
          _id: '1', 
          type: 'apply', 
          title: '行程申请', 
          content: '小明申请加入你的「颐和园一日游」行程，点击查看详情', 
          time: '刚刚', 
          read: false,
          handled: false
        },
        { 
          _id: '2', 
          type: 'trip', 
          title: '行程提醒', 
          content: '你的「长城」行程将于明天上午9:00出发，记得准时参加', 
          time: '1小时前', 
          read: false,
          handled: false
        },
        { 
          _id: '3', 
          type: 'apply', 
          title: '行程申请', 
          content: '小红申请加入你的「故宫博物院」行程', 
          time: '2小时前', 
          read: true,
          handled: true
        },
        { 
          _id: '4', 
          type: 'system', 
          title: '系统通知', 
          content: '欢迎使用北京去哪玩，开启你的周边之旅', 
          time: '昨天', 
          read: true,
          handled: false
        },
        { 
          _id: '5', 
          type: 'trip', 
          title: '行程更新', 
          content: '「南锣鼓巷」行程已更新，新增了3个打卡点', 
          time: '昨天', 
          read: true,
          handled: false
        }
      ];

      const conversations = [
        { 
          _id: '1', 
          name: '颐和园行程群', 
          avatarText: '颐',
          avatarBg: 'linear-gradient(135deg, #667eea, #764ba2)', 
          lastMessage: '明天见！大家记得带水', 
          lastMessageType: 'text',
          lastTime: '10:30', 
          unreadCount: 2,
          isGroup: true,
          online: false
        },
        { 
          _id: '2', 
          name: '小红', 
          avatarText: '红',
          avatarBg: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', 
          lastMessage: '好的，没问题，那我们后天见', 
          lastMessageType: 'text',
          lastTime: '昨天', 
          unreadCount: 0,
          isGroup: false,
          online: true
        },
        { 
          _id: '3', 
          name: '户外小王', 
          avatarText: '王',
          avatarBg: 'linear-gradient(135deg, #56AB2F, #A8E6CF)', 
          lastMessage: '[图片]', 
          lastMessageType: 'image',
          lastTime: '周三', 
          unreadCount: 1,
          isGroup: false,
          online: false
        },
        { 
          _id: '4', 
          name: '长城小分队', 
          avatarText: '长',
          avatarBg: 'linear-gradient(135deg, #4facfe, #00f2fe)', 
          lastMessage: '集合地点已发送', 
          lastMessageType: 'location',
          lastTime: '周二', 
          unreadCount: 0,
          isGroup: true,
          online: false
        },
        { 
          _id: '5', 
          name: '旅行达人李哥', 
          avatarText: '李',
          avatarBg: 'linear-gradient(135deg, #f093fb, #f5576c)', 
          lastMessage: '推荐你去这个景点，超级好看', 
          lastMessageType: 'trip',
          lastTime: '周一', 
          unreadCount: 0,
          isGroup: false,
          online: false
        }
      ];

      // 计算未读数
      const notificationsUnread = notifications.filter(n => !n.read).length;
      const chatsUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
      const unreadCount = notificationsUnread + chatsUnread;

      // 分类计数
      const tripNoticesCount = notifications.filter(n => n.type === 'trip' && !n.read).length;
      const applyNoticesCount = notifications.filter(n => n.type === 'apply' && !n.read).length;
      const systemNoticesCount = notifications.filter(n => n.type === 'system' && !n.read).length;
      const myGroupsCount = conversations.filter(c => c.isGroup && c.unreadCount > 0).length;

      this.setData({
        loading: false,
        notifications,
        conversations,
        unreadCount,
        notificationsUnread,
        chatsUnread,
        tripNoticesCount,
        applyNoticesCount,
        systemNoticesCount,
        myGroupsCount
      });
    }, 300);
  },

  // 切换标签
  onSwitchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  // 点击登录按钮
  onTapLogin: function () {
    auth.goToLogin('/pages/messages/messages');
  },

  // 点击搜索
  onTapSearch: function () {
    this.setData({ showSearch: true });
  },

  // 关闭搜索
  onCloseSearch: function () {
    this.setData({ 
      showSearch: false, 
      searchKeyword: '', 
      searchResults: [] 
    });
  },

  // 搜索输入
  onSearchInput: function (e) {
    const keyword = e.detail.value.trim();
    this.setData({ searchKeyword: keyword });
    
    if (keyword) {
      // 模拟搜索
      const results = [
        ...this.data.notifications.filter(n => 
          n.title.includes(keyword) || n.content.includes(keyword)
        ).map(n => ({ ...n, type: 'notification', name: n.title })),
        ...this.data.conversations.filter(c => 
          c.name.includes(keyword) || c.lastMessage.includes(keyword)
        ).map(c => ({ ...c, type: 'conversation', name: c.name }))
      ];
      this.setData({ searchResults: results });
    } else {
      this.setData({ searchResults: [] });
    }
  },

  // 清除搜索
  onClearSearch: function () {
    this.setData({ searchKeyword: '', searchResults: [] });
  },

  // 点击设置
  onTapSettings: function () {
    wx.showToast({ title: '设置功能开发中', icon: 'none' });
  },

  // 快捷入口点击
  onTapTripNotices: function () {
    this.setData({ currentTab: 'notifications' });
  },

  onTapApplyNotices: function () {
    this.setData({ currentTab: 'notifications' });
  },

  onTapSystemNotices: function () {
    this.setData({ currentTab: 'notifications' });
  },

  onTapMyGroups: function () {
    this.setData({ currentTab: 'chats' });
  },

  // 全部已读
  onReadAllNotifications: function () {
    const notifications = this.data.notifications.map(n => ({ ...n, read: true }));
    const notificationsUnread = 0;
    const unreadCount = notificationsUnread + this.data.chatsUnread;
    
    this.setData({ 
      notifications, 
      notificationsUnread, 
      unreadCount,
      tripNoticesCount: 0,
      applyNoticesCount: 0,
      systemNoticesCount: 0
    });
    
    wx.showToast({ title: '已全部标记为已读', icon: 'success' });
  },

  // 点击通知
  onTapNotification: function (e) {
    const id = e.currentTarget.dataset.id;
    const notification = this.data.notifications.find(n => n._id === id);
    
    if (notification) {
      // 标记已读
      const notifications = this.data.notifications.map(n => 
        n._id === id ? { ...n, read: true } : n
      );
      const notificationsUnread = notifications.filter(n => !n.read).length;
      this.setData({ 
        notifications, 
        notificationsUnread,
        unreadCount: notificationsUnread + this.data.chatsUnread
      });

      // 根据类型跳转
      if (notification.type === 'apply' && !notification.handled) {
        // 申请类型，已显示操作按钮，不需要弹窗
        return;
      }
      
      if (notification.type === 'trip') {
        wx.navigateTo({ url: '/pages/trip-detail/trip-detail?id=' + id });
      }
    }
  },

  // 同意申请
  onAcceptApply: function (e) {
    const id = e.currentTarget.dataset.id;
    
    // 更新状态
    const notifications = this.data.notifications.map(n => 
      n._id === id ? { ...n, handled: true, read: true } : n
    );
    
    const applyNoticesCount = notifications.filter(n => n.type === 'apply' && !n.read).length;
    const notificationsUnread = notifications.filter(n => !n.read).length;
    
    this.setData({ 
      notifications, 
      applyNoticesCount,
      notificationsUnread,
      unreadCount: notificationsUnread + this.data.chatsUnread
    });
    
    wx.showToast({ title: '已同意申请', icon: 'success' });
  },

  // 拒绝申请
  onRejectApply: function (e) {
    const id = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认拒绝',
      content: '确定要拒绝这个申请吗？',
      success: (res) => {
        if (res.confirm) {
          const notifications = this.data.notifications.map(n => 
            n._id === id ? { ...n, handled: true, read: true } : n
          );
          
          const applyNoticesCount = notifications.filter(n => n.type === 'apply' && !n.read).length;
          const notificationsUnread = notifications.filter(n => !n.read).length;
          
          this.setData({ 
            notifications, 
            applyNoticesCount,
            notificationsUnread,
            unreadCount: notificationsUnread + this.data.chatsUnread
          });
          
          wx.showToast({ title: '已拒绝', icon: 'none' });
        }
      }
    });
  },

  // 点击会话
  onTapConversation: function (e) {
    const id = e.currentTarget.dataset.id;
    const conversation = this.data.conversations.find(c => c._id === id);
    
    if (conversation) {
      // 清除未读
      const conversations = this.data.conversations.map(c => 
        c._id === id ? { ...c, unreadCount: 0 } : c
      );
      const chatsUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
      
      this.setData({ 
        conversations, 
        chatsUnread,
        unreadCount: this.data.notificationsUnread + chatsUnread,
        myGroupsCount: conversations.filter(c => c.isGroup && c.unreadCount > 0).length
      });
      
      // 跳转聊天页面
      wx.showToast({ title: '聊天功能开发中', icon: 'none' });
      // wx.navigateTo({ url: '/pages/chat/chat?id=' + id });
    }
  },

  // 发起新聊天
  onStartNewChat: function () {
    wx.showToast({ title: '发起新聊天功能开发中', icon: 'none' });
  },

  // 发现行程
  onExploreTrips: function () {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadData();
    wx.stopPullDownRefresh();
  }
});
