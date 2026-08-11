const { db, _ } = require('../utils/shared');
const crypto = require('crypto');

const ACTIVE_STATUS = 'active';
const CATEGORIES = ['trip', 'interaction', 'system'];

function getNotificationId(type, receiverId, sourceId) {
  return crypto.createHash('sha256')
    .update(String(type) + '\n' + String(receiverId) + '\n' + String(sourceId))
    .digest('hex')
    .slice(0, 32);
}

function isDocumentNotFoundError(error) {
  const code = error && (error.errCode || error.code);
  const message = String(error && (error.message || error.errMsg) || '').toLowerCase();
  return code === -502002 || code === 'DATABASE_DOCUMENT_NOT_EXIST' ||
    message.indexOf('not exist') !== -1 || message.indexOf('not found') !== -1;
}

async function setNotification(client, payload) {
  if (!payload || !payload.receiverId || !payload.type || !payload.sourceId) return '';
  const now = Number(payload.createdAt) || Date.now();
  const id = getNotificationId(payload.type, payload.receiverId, payload.sourceId);
  await client.collection('notifications').doc(id).set({
    data: {
      receiverId: payload.receiverId,
      category: payload.category || 'system',
      type: payload.type,
      actorId: payload.actorId || '',
      actorName: payload.actorName || '',
      actorAvatar: payload.actorAvatar || '',
      targetType: payload.targetType || '',
      targetId: payload.targetId || '',
      sourceType: payload.sourceType || '',
      sourceId: payload.sourceId,
      title: payload.title || '',
      actionText: payload.actionText || '',
      content: payload.content || '',
      thumbnail: payload.thumbnail || '',
      isRead: false,
      readAt: 0,
      status: ACTIVE_STATUS,
      createdAt: now,
      updatedAt: now
    }
  });
  return id;
}

async function removeNotification(client, type, receiverId, sourceId) {
  if (!type || !receiverId || !sourceId) return;
  const id = getNotificationId(type, receiverId, sourceId);
  try {
    await client.collection('notifications').doc(id).remove();
  } catch (err) {
    if (!isDocumentNotFoundError(err)) throw err;
  }
}

function normalizePageSize(value) {
  return Math.max(1, Math.min(Number(value) || 20, 50));
}

function normalizeCategory(value) {
  const category = String(value || '').trim();
  if (!category) return '';
  if (CATEGORIES.indexOf(category) === -1) {
    throw new Error('消息分类参数不正确');
  }
  return category;
}

function buildBaseCondition(openid, category) {
  const condition = {
    receiverId: openid,
    status: ACTIVE_STATUS
  };
  if (category) condition.category = category;
  return condition;
}

function buildListCondition(openid, category, cursor, cursorId) {
  const base = buildBaseCondition(openid, category);
  if (!cursor) return base;

  const older = { createdAt: _.lt(cursor) };
  const sameTimeOlderId = {
    createdAt: _.eq(cursor),
    _id: _.lt(cursorId)
  };
  return _.and([base, _.or([older, sameTimeOlderId])]);
}

async function getUnreadCounts(openid) {
  const allCondition = Object.assign(buildBaseCondition(openid, ''), { isRead: false });
  const tripCondition = Object.assign(buildBaseCondition(openid, 'trip'), { isRead: false });
  const interactionCondition = Object.assign(buildBaseCondition(openid, 'interaction'), { isRead: false });

  const results = await Promise.all([
    db.collection('notifications').where(allCondition).count(),
    db.collection('notifications').where(tripCondition).count(),
    db.collection('notifications').where(interactionCondition).count()
  ]);

  return {
    all: Number(results[0] && results[0].total) || 0,
    trip: Number(results[1] && results[1].total) || 0,
    interaction: Number(results[2] && results[2].total) || 0
  };
}

async function enrichTripApplications(openid, notifications) {
  const applicationItems = (notifications || []).filter(item =>
    item.type === 'trip_apply_received' && item.targetId
  );
  if (applicationItems.length === 0) return;

  await Promise.all(applicationItems.map(async item => {
    try {
      const result = await db.collection('applies').doc(item.targetId).get();
      const apply = result && result.data;
      if (!apply || apply.ownerId !== openid || apply.toUserId !== openid) {
        item.applyId = '';
        item.applyStatus = 'unavailable';
        return;
      }
      item.applyId = apply._id || item.targetId;
      item.applyStatus = apply.status || 'pending';
      item.tripId = apply.tripId || '';
      item.tripTitle = apply.tripTitle || apply.placeName || item.content || '行程';
    } catch (err) {
      console.warn('加载行程申请状态失败:', err.message || err);
      item.applyId = '';
      item.applyStatus = 'unavailable';
    }
  }));
}

async function notificationList(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };

    const category = normalizeCategory(data && data.category);
    const pageSize = normalizePageSize(data && data.pageSize);
    const cursor = Math.max(0, Number(data && data.cursor) || 0);
    const cursorId = String(data && data.cursorId || '');
    if (cursor && !cursorId) {
      return { success: false, error: '消息分页参数不完整' };
    }

    const query = db.collection('notifications')
      .where(buildListCondition(openid, category, cursor, cursorId))
      .orderBy('createdAt', 'desc')
      .orderBy('_id', 'desc')
      .limit(pageSize + 1);

    const results = await Promise.all([
      query.get(),
      getUnreadCounts(openid)
    ]);
    let notifications = (results[0].data || []).slice();
    const hasMore = notifications.length > pageSize;
    if (hasMore) notifications = notifications.slice(0, pageSize);
    await enrichTripApplications(openid, notifications);
    const last = notifications.length > 0 ? notifications[notifications.length - 1] : null;

    return {
      success: true,
      notifications: notifications,
      unreadCounts: results[1],
      hasMore: hasMore,
      nextCursor: last ? Number(last.createdAt) || 0 : 0,
      nextCursorId: last ? String(last._id || '') : ''
    };
  } catch (err) {
    console.error('notification/list failed:', err);
    return { success: false, error: err.message || '消息加载失败，请重试' };
  }
}

async function notificationUnreadCount(openid) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    const counts = await getUnreadCounts(openid);
    return { success: true, count: counts.all, counts: counts };
  } catch (err) {
    console.error('notification/unreadCount failed:', err);
    return { success: false, error: err.message || '未读消息数量加载失败' };
  }
}

async function notificationMarkRead(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    const notificationId = String(data && data.notificationId || '').trim();
    if (!notificationId) return { success: false, error: '消息ID不能为空' };

    const result = await db.collection('notifications').doc(notificationId).get();
    const notification = result && result.data;
    if (!notification || notification.receiverId !== openid || notification.status !== ACTIVE_STATUS) {
      return { success: false, error: '消息不存在或无权操作' };
    }

    if (!notification.isRead) {
      const now = Date.now();
      await db.collection('notifications').doc(notificationId).update({
        data: { isRead: true, readAt: now, updatedAt: now }
      });
    }
    return { success: true };
  } catch (err) {
    console.error('notification/markRead failed:', err);
    return { success: false, error: err.message || '标记消息已读失败' };
  }
}

async function notificationMarkAllRead(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    const category = normalizeCategory(data && data.category);
    const condition = Object.assign(buildBaseCondition(openid, category), { isRead: false });
    const now = Date.now();
    await db.collection('notifications').where(condition).update({
      data: { isRead: true, readAt: now, updatedAt: now }
    });
    return { success: true };
  } catch (err) {
    console.error('notification/markAllRead failed:', err);
    return { success: false, error: err.message || '全部已读操作失败' };
  }
}

module.exports = {
  getNotificationId,
  setNotification,
  removeNotification,
  notificationList,
  notificationUnreadCount,
  notificationMarkRead,
  notificationMarkAllRead
};
