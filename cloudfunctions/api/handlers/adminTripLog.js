const { db, _, cloud } = require('../utils/shared');

const LOGS_COLLECTION = 'trip_logs';
const NOTIFICATIONS_COLLECTION = 'notifications';
const ADMIN_COLLECTION = 'admin_users';
const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
const MACHINE_SUGGESTS = ['pass', 'review', 'risky'];

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
    throw new Error('无旅行记录审核权限');
  }
  return admin;
}

async function resolvePublisherProfiles(logs) {
  const ids = [...new Set((logs || []).map(item => item.publisherId).filter(Boolean))];
  if (!ids.length) return;
  const result = await db.collection('users').where({ openid: _.in(ids) }).get();
  const profiles = {};
  (result.data || []).forEach(user => { if (user.openid) profiles[user.openid] = user; });
  logs.forEach(log => {
    const profile = profiles[log.publisherId];
    if (!profile) return;
    if (profile.nickname) log.publisherName = profile.nickname;
    if (profile.avatar) log.publisherAvatar = profile.avatar;
  });
}

async function resolveCloudAvatars(logs) {
  const ids = [...new Set((logs || []).map(item => item.publisherAvatar)
    .filter(value => typeof value === 'string' && value.startsWith('cloud://')))];
  if (!ids.length) return;
  const result = await cloud.getTempFileURL({ fileList: ids });
  const map = {};
  (result.fileList || []).forEach(item => { if (item.fileID && item.tempFileURL) map[item.fileID] = item.tempFileURL; });
  logs.forEach(log => { if (map[log.publisherAvatar]) log.publisherAvatar = map[log.publisherAvatar]; });
}

function getThumbnail(log) {
  const first = Array.isArray(log.images) ? log.images[0] : null;
  return typeof first === 'string' ? first : (first && (first.url || first.tempFileURL) || '');
}

async function saveResultNotification(log, decision) {
  const now = Date.now();
  const type = decision === 'approved' ? 'trip_log_review_approved' : 'trip_log_review_rejected';
  const oppositeType = decision === 'approved' ? 'trip_log_review_rejected' : 'trip_log_review_approved';
  const sourceId = log._id + ':admin';
  const payload = {
    receiverId: log.publisherId,
    category: 'system',
    type,
    actorId: '', actorName: '', actorAvatar: '',
    targetType: 'trip',
    targetId: log.tripId,
    sourceType: 'trip_log_review',
    sourceId,
    title: decision === 'approved' ? '旅行记录复核通过' : '旅行记录复核未通过',
    actionText: '',
    content: decision === 'approved' ? '你的旅行记录已通过人工复核并继续公开展示' : '你的旅行记录未通过人工复核',
    thumbnail: getThumbnail(log),
    isRead: false, readAt: 0, status: 'active', createdAt: now, updatedAt: now
  };
  await db.collection(NOTIFICATIONS_COLLECTION)
    .where({ receiverId: log.publisherId, type: oppositeType, sourceId }).remove();
  const existing = await db.collection(NOTIFICATIONS_COLLECTION)
    .where({ receiverId: log.publisherId, type, sourceId }).limit(1).get();
  if (existing.data && existing.data[0] && existing.data[0]._id) {
    await db.collection(NOTIFICATIONS_COLLECTION).doc(existing.data[0]._id).update({ data: payload });
  } else {
    await db.collection(NOTIFICATIONS_COLLECTION).add({ data: payload });
  }
}

async function adminTripLogReviewList(data = {}) {
  try {
    await requireAdmin(String(data.adminId || ''));
    const page = Math.max(1, Number(data.page) || 1);
    const pageSize = Math.max(1, Math.min(Number(data.pageSize) || 10, 50));
    const reviewStatus = REVIEW_STATUSES.includes(data.reviewStatus) ? data.reviewStatus : 'pending';
    const machineSuggest = data.machineSuggest === 'all' || MACHINE_SUGGESTS.includes(data.machineSuggest)
      ? data.machineSuggest : 'all';
    const condition = { status: 'active' };
    if (reviewStatus === 'approved') condition.adminReviewStatus = _.in(['not_required', 'approved']);
    else condition.adminReviewStatus = reviewStatus;
    condition.machineSuggest = machineSuggest === 'all' ? _.in(MACHINE_SUGGESTS) : machineSuggest;
    const query = db.collection(LOGS_COLLECTION).where(condition);
    const results = await Promise.all([
      query.count(),
      db.collection(LOGS_COLLECTION).where(condition)
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
    ]);
    const logs = results[1].data || [];
    try {
      await resolvePublisherProfiles(logs);
      await resolveCloudAvatars(logs);
    } catch (error) {
      console.warn('admin trip log profile resolution failed:', error.message || error);
    }
    return { success: true, logs, total: results[0].total || 0, page, pageSize };
  } catch (error) {
    console.error('admin trip log review list failed:', error);
    return { success: false, error: error.message || '旅行记录审核列表加载失败' };
  }
}

async function adminTripLogReviewUpdate(data = {}) {
  try {
    const admin = await requireAdmin(String(data.adminId || ''));
    const logId = String(data.logId || '');
    const decision = data.decision;
    if (!logId) throw new Error('旅行记录ID不能为空');
    if (!['approved', 'rejected'].includes(decision)) throw new Error('审核结论无效');
    const result = await db.collection(LOGS_COLLECTION).doc(logId).get();
    const log = result && result.data;
    if (!log || log.status !== 'active') throw new Error('旅行记录不存在或已删除');
    const now = Date.now();
    await db.collection(LOGS_COLLECTION).doc(logId).update({ data: {
      reviewStatus: decision,
      imageAuditStatus: decision,
      adminReviewStatus: decision,
      adminReviewRemark: String(data.remark || '').trim().slice(0, 200),
      adminReviewedAt: now,
      adminReviewerName: String(data.reviewerName || admin.nickname || admin.username || '管理员'),
      updatedAt: now
    } });
    try {
      await saveResultNotification(log, decision);
    } catch (error) {
      console.error('admin trip log review notification failed:', error);
      return { success: true, message: decision === 'approved' ? '已审核通过，但通知写入失败' : '已审核不通过，但通知写入失败' };
    }
    return { success: true, message: decision === 'approved' ? '已审核通过' : '已审核不通过' };
  } catch (error) {
    console.error('admin trip log review update failed:', error);
    return { success: false, error: error.message || '旅行记录审核操作失败' };
  }
}

module.exports = { adminTripLogReviewList, adminTripLogReviewUpdate };
