// api.js - 云函数调用封装

/**
 * 统一调用云函数
 * @param {string} action 操作类型
 * @param {object} data 参数
 * @returns {Promise} 结果
 */
function callApi(action, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'api',
      data: { action, data }
    }).then(res => {
      if (res.result.success) {
        resolve(res.result);
      } else {
        reject(new Error(res.result.error || '操作失败'));
      }
    }).catch(err => {
      reject(err);
    });
  });
}

/**
 * 记录用户行为事件（用于转化率统计）
 * @param {string} eventType 事件类型
 */
async function trackEvent(eventType) {
  try {
    // 先获取 openid
    const loginRes = await wx.cloud.callFunction({ name: 'login' });
    const openid = loginRes.result.openid;

    if (!openid) return;

    await wx.cloud.callFunction({
      name: 'api',
      data: {
        action: 'auth/trackEvent',
        data: { eventType, openid }
      }
    });
  } catch (err) {
    console.warn('记录事件失败:', err);
  }
}

// ========== 用户相关 ==========

/**
 * 用户登录
 */
function userLogin(data) {
  return callApi('user/login', data);
}

/**
 * 更新用户信息
 */
function userUpdate(data) {
  return callApi('user/update', data);
}

/**
 * 获取用户信息
 */
function userGet(userId) {
  return callApi('user/get', { userId });
}

// ========== 地点相关 ==========

/**
 * 获取地点列表
 */
function placeList(data = {}) {
  return callApi('place/list', data);
}

/**
 * 获取地点详情
 */
function placeGet(placeId) {
  return callApi('place/get', { placeId });
}

/**
 * 搜索地点
 */
function placeSearch(keyword) {
  return callApi('place/search', { keyword });
}

/**
 * 记录地点浏览量
 */
function placeView(placeId) {
  return callApi('place/view', { placeId });
}

// ========== 行程相关 ==========

/**
 * 创建行程
 */
function tripCreate(data) {
  return callApi('trip/create', data);
}

/**
 * 获取行程列表
 */
function tripList(data = {}) {
  return callApi('trip/list', data);
}

/**
 * 获取行程详情
 */
function tripGet(tripId) {
  return callApi('trip/get', { tripId });
}

/**
 * 记录行程浏览量
 */
function tripView(tripId) {
  return callApi('trip/view', { tripId });
}

/**
 * 加入行程
 */
function tripJoin(tripId) {
  return callApi('trip/join', { tripId });
}

/**
 * 退出行程
 */
function tripQuit(tripId) {
  return callApi('trip/quit', { tripId });
}

/**
 * 移除成员
 */
function tripRemoveMember(tripId, memberId) {
  return callApi('trip/removeMember', { tripId, memberId });
}

/**
 * 更新行程状态
 */
function tripUpdateStatus(tripId, status) {
  return callApi('trip/updateStatus', { tripId, status });
}

/**
 * 删除行程
 */
function tripDelete(tripId) {
  return callApi('trip/delete', { tripId });
}

/**
 * 获取我的行程
 */
function tripMy() {
  return callApi('trip/my', {});
}

// ========== 申请相关 ==========

/**
 * 创建申请
 */
function applyCreate(data) {
  return callApi('apply/create', data);
}

/**
 * 获取申请列表
 */
function applyList(type = 'received') {
  return callApi('apply/list', { type });
}

/**
 * 处理申请
 */
function applyHandle(applyId, accept) {
  return callApi('apply/handle', { applyId, accept });
}

/**
 * 获取行程通知列表
 */
function applyNotifications() {
  return callApi('apply/notifications', {});
}

/**
 * 删除申请通知
 */
function applyDelete(applyId) {
  return callApi('apply/delete', { applyId });
}

/**
 * 取消申请
 */
function applyCancel(applyId) {
  return callApi('apply/cancel', { applyId });
}

// ========== 想去相关 ==========

/**
 * 切换想去状态
 */
function wantToggle(placeId) {
  return callApi('want/toggle', { placeId });
}

/**
 * 获取想去列表
 */
function wantList() {
  return callApi('want/list', {});
}

// ========== 消息相关 ==========

/**
 * 发送消息
 */
function messageSend(data) {
  return callApi('message/send', data);
}

/**
 * 获取消息列表
 */
function messageList(conversationId, page = 1) {
  return callApi('message/list', { conversationId, page });
}

/**
 * 标记消息已读
 */
function messageRead(messageId) {
  return callApi('message/read', { messageId });
}

// ========== 评论相关 ==========

/**
 * 创建评论
 */
function commentCreate(data) {
  return callApi('comment/create', data);
}

/**
 * 获取评论列表
 */
function commentList(placeId) {
  return callApi('comment/list', { placeId });
}

// ========== Banner相关 ==========

/**
 * 获取Banner列表
 */
function bannerList() {
  return callApi('banner/list', {});
}

// ========== 导出 ==========

module.exports = {
  // 用户
  userLogin,
  userUpdate,
  userGet,

  // 地点
  placeList,
  placeGet,
  placeSearch,
  placeView,

  // 行程
  tripCreate,
  tripList,
  tripGet,
  tripView,
  tripJoin,
  tripQuit,
  tripRemoveMember,
  tripUpdateStatus,
  tripDelete,
  tripMy,

  // 申请
  applyCreate,
  applyList,
  applyHandle,
  applyNotifications,
  applyDelete,
  applyCancel,

  // 想去
  wantToggle,
  wantList,

  // 消息
  messageSend,
  messageList,
  messageRead,

  // 评论
  commentCreate,
  commentList,

  // Banner
  bannerList,

  // 统计
  trackEvent
};
