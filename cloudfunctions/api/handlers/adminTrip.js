const { db, _, cloud } = require('../utils/shared');

const TRIPS_COLLECTION = 'trips';
const NOTIFICATIONS_COLLECTION = 'notifications';
const ADMIN_COLLECTION = 'admin_users';
const REVIEW_STATUSES = ['all', 'approved', 'rejected'];

async function requireAdmin(adminId) {
  if (!adminId) throw new Error('管理员身份已失效，请重新登录');
  let result;
  try {
    result = await db.collection(ADMIN_COLLECTION).doc(adminId).get();
  } catch (error) {
    throw new Error('管理员身份不存在，请重新登录');
  }
  const admin = result && result.data;
  if (!admin || !['admin', 'operator'].includes(admin.role || 'admin')) {
    throw new Error('无行程审核权限');
  }
  return admin;
}

async function resolveCreatorProfiles(trips) {
  const creatorIds = [];
  trips.forEach((trip) => {
    if (trip.creatorId && !creatorIds.includes(trip.creatorId)) creatorIds.push(trip.creatorId);
  });
  if (creatorIds.length === 0) return;
  const result = await db.collection('users').where({ openid: _.in(creatorIds) }).get();
  const profiles = {};
  (result.data || []).forEach((user) => { if (user.openid) profiles[user.openid] = user; });
  trips.forEach((trip) => {
    const profile = profiles[trip.creatorId];
    if (!profile) return;
    if (profile.nickname) trip.creatorName = profile.nickname;
    if (profile.avatar) trip.creatorAvatar = profile.avatar;
  });
}

async function resolveCloudUrls(trips) {
  const fileIds = [];
  function collect(value) {
    if (typeof value === 'string' && value.startsWith('cloud://') && !fileIds.includes(value)) fileIds.push(value);
  }
  trips.forEach((trip) => {
    collect(trip.creatorAvatar);
    collect(trip.customCoverImage);
    (trip.coverImages || []).forEach(collect);
  });
  if (fileIds.length === 0) return;
  const result = await cloud.getTempFileURL({ fileList: fileIds });
  const urlMap = {};
  (result.fileList || []).forEach((file) => {
    if (file.fileID && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL;
  });
  trips.forEach((trip) => {
    if (urlMap[trip.creatorAvatar]) trip.creatorAvatar = urlMap[trip.creatorAvatar];
    if (urlMap[trip.customCoverImage]) trip.customCoverImageUrl = urlMap[trip.customCoverImage];
    trip.coverImageUrls = (trip.coverImages || []).map((item) => urlMap[item] || item).filter(Boolean);
  });
}

function getThumbnail(trip) {
  return (trip.customCoverImageObject && trip.customCoverImageObject.url) ||
    trip.customCoverImageUrl || trip.customCoverImage ||
    (trip.coverImageObjects && trip.coverImageObjects[0] && trip.coverImageObjects[0].url) ||
    (trip.coverImageUrls && trip.coverImageUrls[0]) ||
    (trip.coverImages && trip.coverImages[0]) || '';
}

async function saveResultNotification(trip, decision) {
  const now = Date.now();
  const type = decision === 'approved' ? 'trip_review_approved' : 'trip_review_rejected';
  const oppositeType = decision === 'approved' ? 'trip_review_rejected' : 'trip_review_approved';
  const sourceId = trip._id + ':admin';
  const payload = {
    receiverId: trip.creatorId,
    category: 'system',
    type,
    actorId: '',
    actorName: '',
    actorAvatar: '',
    targetType: 'trip',
    targetId: trip._id,
    sourceType: 'review',
    sourceId,
    title: decision === 'approved' ? '行程已恢复展示' : '行程审核不通过',
    actionText: '',
    content: decision === 'approved'
      ? '你的行程已恢复公开展示'
      : '你的行程已停止公开展示，可查看审核说明',
    thumbnail: getThumbnail(trip),
    isRead: false,
    readAt: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
  await db.collection(NOTIFICATIONS_COLLECTION)
    .where({ receiverId: trip.creatorId, type: oppositeType, sourceId }).remove();
  const existing = await db.collection(NOTIFICATIONS_COLLECTION)
    .where({ receiverId: trip.creatorId, type, sourceId }).limit(1).get();
  if (existing.data && existing.data[0] && existing.data[0]._id) {
    await db.collection(NOTIFICATIONS_COLLECTION).doc(existing.data[0]._id).update({ data: payload });
  } else {
    await db.collection(NOTIFICATIONS_COLLECTION).add({ data: payload });
  }
}

async function adminTripReviewList(data = {}) {
  try {
    await requireAdmin(String(data.adminId || ''));
    const page = Math.max(1, Number(data.page) || 1);
    const pageSize = Math.max(1, Math.min(Number(data.pageSize) || 10, 50));
    const reviewStatus = REVIEW_STATUSES.includes(data.reviewStatus) ? data.reviewStatus : 'all';
    let condition = {};
    if (reviewStatus === 'approved') {
      condition = _.or([
        { reviewStatus: 'approved' },
        { reviewStatus: _.exists(false) }
      ]);
    } else if (reviewStatus === 'rejected') {
      condition = { reviewStatus: 'rejected' };
    }
    const collection = db.collection(TRIPS_COLLECTION);
    const countQuery = reviewStatus === 'all' ? collection : collection.where(condition);
    const listQuery = reviewStatus === 'all' ? db.collection(TRIPS_COLLECTION) : db.collection(TRIPS_COLLECTION).where(condition);
    const results = await Promise.all([
      countQuery.count(),
      listQuery.orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
    ]);
    const trips = results[1].data || [];
    try {
      await resolveCreatorProfiles(trips);
      await resolveCloudUrls(trips);
    } catch (profileError) {
      console.warn('admin trip profile resolution failed:', profileError);
    }
    trips.forEach((trip) => {
      if (!trip.reviewStatus) trip.reviewStatus = 'approved';
    });
    return { success: true, trips, total: results[0].total || 0, page, pageSize };
  } catch (error) {
    console.error('admin trip review list failed:', error);
    return { success: false, error: error.message || '行程审核列表加载失败' };
  }
}

async function adminTripReviewUpdate(data = {}) {
  try {
    const admin = await requireAdmin(String(data.adminId || ''));
    const tripId = String(data.tripId || '');
    const decision = data.decision;
    if (!tripId) throw new Error('行程ID不能为空');
    if (decision !== 'approved' && decision !== 'rejected') throw new Error('审核结论无效');
    const result = await db.collection(TRIPS_COLLECTION).doc(tripId).get();
    const trip = result && result.data;
    if (!trip) throw new Error('行程不存在或已删除');
    const now = Date.now();
    await db.collection(TRIPS_COLLECTION).doc(tripId).update({
      data: {
        reviewStatus: decision,
        adminReviewRemark: String(data.remark || '').trim().slice(0, 200),
        adminReviewedAt: now,
        adminReviewerName: String(data.reviewerName || admin.nickname || admin.username || '管理员'),
        updatedAt: now
      }
    });
    try {
      await saveResultNotification(trip, decision);
    } catch (notificationError) {
      console.error('admin trip review notification failed:', notificationError);
      return { success: true, message: decision === 'approved' ? '已恢复展示，但用户通知写入失败' : '已停止展示，但用户通知写入失败' };
    }
    return { success: true, message: decision === 'approved' ? '已恢复公开展示' : '已审核不通过' };
  } catch (error) {
    console.error('admin trip review update failed:', error);
    return { success: false, error: error.message || '行程审核操作失败' };
  }
}

module.exports = { adminTripReviewList, adminTripReviewUpdate };
