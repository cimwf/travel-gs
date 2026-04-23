/**
 * 导航工具模块
 */

// 首页路径
const HOME_PAGE = '/pages/trip-list/trip-list';
const REGISTER_PAGE = '/pages/register/register';

/**
 * 返回上一页，如果没有上一页则跳转到首页
 */
function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    wx.navigateBack();
  } else {
    goHome();
  }
}

/**
 * 跳转到首页
 */
function goHome() {
  wx.switchTab({ url: HOME_PAGE });
}

/**
 * 跳转到注册页
 * @param {string} redirectUrl - 注册成功后的回跳地址
 */
function goToRegister(redirectUrl = '') {
  if (redirectUrl) {
    wx.setStorageSync('pendingRedirect', redirectUrl);
  }
  wx.navigateTo({ url: REGISTER_PAGE });
}

/**
 * 检查是否有上一页
 * @returns {boolean}
 */
function hasPreviousPage() {
  const pages = getCurrentPages();
  return pages.length > 1;
}

module.exports = {
  goBack,
  goHome,
  goToRegister,
  hasPreviousPage,
  HOME_PAGE,
  REGISTER_PAGE
};
