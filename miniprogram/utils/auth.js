/**
 * 登录工具模块
 */

// 登录有效期：15天（毫秒）
const LOGIN_EXPIRY = 15 * 24 * 60 * 60 * 1000;

/**
 * 获取 app 实例
 */
function getAppInstance() {
  return getApp();
}

/**
 * 检查用户是否需要登录
 * @param {boolean} forceCheck - 是否强制检查（忽略15天机制）
 * @returns {boolean} 是否需要登录
 */
function checkNeedLogin(forceCheck = false) {
  const app = getAppInstance();
  const isLoggedIn = app && app.globalData && app.globalData.isLoggedIn;
  const userInfo = app && app.globalData && app.globalData.userInfo;
  
  // 如果未登录，需要登录
  if (!isLoggedIn || !userInfo) {
    return true;
  }
  
  // 强制检查（比如从设置页面）
  if (forceCheck) {
    return true;
  }
  
  // 检查是否超过15天未登录
  const lastLoginTime = wx.getStorageSync('lastLoginTime') || 0;
  const now = Date.now();
  
  if (now - lastLoginTime > LOGIN_EXPIRY) {
    // 超过15天，需要重新登录
    console.log('登录已过期，需要重新登录');
    return true;
  }
  
  return false;
}

/**
 * 执行登录成功后的操作
 * @param {Object} userInfo - 用户信息
 */
function handleLoginSuccess(userInfo) {
  const app = getAppInstance();
  
  // 保存到全局
  if (app && app.globalData) {
    app.globalData.userInfo = userInfo;
    app.globalData.isLoggedIn = true;
  }
  
  // 保存到本地
  wx.setStorageSync('userInfo', userInfo);
  wx.setStorageSync('lastLoginTime', Date.now());
  
  console.log('登录成功，时间戳:', Date.now());
  
  // 检查是否有待跳转的页面
  const pendingRedirect = wx.getStorageSync('pendingRedirect');
  if (pendingRedirect) {
    wx.removeStorageSync('pendingRedirect');
    // 跳转回之前要去的页面
    wx.redirectTo({
      url: pendingRedirect,
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  }
}

/**
 * 跳转到登录页面
 * @param {string} redirectUrl - 登录成功后的回跳地址
 */
function goToLogin(redirectUrl = '') {
  // 记录要跳转的页面
  if (redirectUrl) {
    wx.setStorageSync('pendingRedirect', redirectUrl);
  }
  wx.redirectTo({
    url: '/pages/auth/auth'
  });
}

/**
 * 页面需要登录的检查
 * 在需要登录的页面的 onShow 或点击事件中调用
 * @param {Object} pageInstance - page 实例
 * @param {string} redirectUrl - 可选，指定回跳地址
 */
function requireLogin(pageInstance, redirectUrl) {
  if (checkNeedLogin()) {
    // 记录要跳转的页面，登录成功后再跳转
    const targetUrl = redirectUrl || pageInstance.route;
    wx.setStorageSync('pendingRedirect', targetUrl);
    goToLogin();
    return false;
  }
  return true;
}

/**
 * 清理登录状态（退出登录）
 * 注意：本项目不提供退出登录入口，此函数保留备用
 */
function clearLoginStatus() {
  const app = getAppInstance();
  
  wx.removeStorageSync('userInfo');
  wx.removeStorageSync('lastLoginTime');
  wx.removeStorageSync('pendingRedirect');
  
  if (app && app.globalData) {
    app.globalData.userInfo = null;
    app.globalData.isLoggedIn = false;
  }
}

module.exports = {
  checkNeedLogin,
  handleLoginSuccess,
  goToLogin,
  requireLogin,
  clearLoginStatus,
  LOGIN_EXPIRY
};