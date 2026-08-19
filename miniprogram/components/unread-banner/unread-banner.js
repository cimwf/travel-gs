const app = getApp();

const CUSTOM_NAV_ROUTES = [
  'pages/profile/profile',
  'pages/auth/auth',
  'pages/trip-publish-success/trip-publish-success',
  'pages/place-detail/place-detail'
];

Component({
  data: {
    visible: false,
    entered: false,
    count: 0,
    topOffset: 12
  },

  lifetimes: {
    attached: function () {
      this._pageVisible = false;
      this._unsubscribe = app.subscribeUnreadBanner((banner) => {
        if (!this._pageVisible) return;
        this.showBanner(banner);
      });
    },

    detached: function () {
      if (this._unsubscribe) this._unsubscribe();
      clearTimeout(this._autoHideTimer);
      clearTimeout(this._removeTimer);
    }
  },

  pageLifetimes: {
    show: function () {
      this._pageVisible = true;
      if (app.globalData.unreadBanner) this.showBanner(app.globalData.unreadBanner);
    },

    hide: function () {
      this._pageVisible = false;
      clearTimeout(this._autoHideTimer);
      clearTimeout(this._removeTimer);
      if (this.data.visible) app.clearUnreadBanner();
      this.setData({ visible: false, entered: false });
    }
  },

  methods: {
    getCurrentRoute: function () {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      return page && page.route || '';
    },

    getTopOffset: function (route) {
      if (CUSTOM_NAV_ROUTES.indexOf(route) === -1) return 12;
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      return (Number(windowInfo.statusBarHeight) || 20) + 52;
    },

    showBanner: function (banner) {
      const route = this.getCurrentRoute();
      if (!banner || !banner.count || route === 'pages/message-center/message-center') {
        if (route === 'pages/message-center/message-center') app.clearUnreadBanner();
        return;
      }

      clearTimeout(this._autoHideTimer);
      clearTimeout(this._removeTimer);
      this.setData({
        visible: true,
        entered: false,
        count: banner.count,
        topOffset: this.getTopOffset(route)
      });
      wx.nextTick(() => this.setData({ entered: true }));
      this._autoHideTimer = setTimeout(() => this.hideBanner(), 4000);
    },

    hideBanner: function () {
      clearTimeout(this._autoHideTimer);
      this.setData({ entered: false });
      this._removeTimer = setTimeout(() => {
        this.setData({ visible: false });
        app.clearUnreadBanner();
      }, 220);
    },

    onBannerTap: function () {
      this.hideBanner();
      const route = this.getCurrentRoute();
      if (route === 'pages/message-center/message-center') return;
      wx.navigateTo({ url: '/pages/message-center/message-center' });
    }
  }
});
