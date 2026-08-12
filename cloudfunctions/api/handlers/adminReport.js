const { db, _, cloud } = require('../utils/shared');

const ADMIN_COLLECTION = 'admin_users';
const REPORT_COLLECTION = 'reports';
const REPORT_STATUSES = ['pending', 'processed', 'ignored'];
const TARGET_TYPES = ['community_post', 'trip_log'];

async function requireAdmin(adminId) {
  if (!adminId) throw new Error('管理员身份已失效，请重新登录');
  let result;
  try { result = await db.collection(ADMIN_COLLECTION).doc(adminId).get(); }
  catch (error) { throw new Error('管理员身份不存在，请重新登录'); }
  const admin = result && result.data;
  if (!admin || !['admin', 'operator'].includes(admin.role || 'admin')) {
    throw new Error('无举报管理权限');
  }
  return admin;
}

async function resolveUsers(reports) {
  const ids = [...new Set((reports || []).flatMap(item => [item.reporterId, item.targetAuthorId]).filter(Boolean))];
  if (!ids.length) return;
  const result = await db.collection('users').where({ openid: _.in(ids) }).get();
  const users = {};
  (result.data || []).forEach(user => { if (user.openid) users[user.openid] = user; });
  reports.forEach(report => {
    const reporter = users[report.reporterId];
    const author = users[report.targetAuthorId];
    report.reporterName = reporter && reporter.nickname || '用户';
    report.reporterAvatar = reporter && reporter.avatar || '';
    report.targetAuthorName = author && author.nickname || '旅行者';
    report.targetAuthorAvatar = author && author.avatar || '';
  });
}

async function resolveTargets(reports) {
  await Promise.all((reports || []).map(async report => {
    const collection = report.targetType === 'community_post' ? 'community_posts' : 'trip_logs';
    try {
      const result = await db.collection(collection).doc(report.targetId).get();
      report.target = result && result.data ? { _id: report.targetId, ...result.data } : null;
    } catch (error) {
      report.target = null;
    }
  }));
}

async function resolveCloudAvatars(reports) {
  const fileIds = [...new Set((reports || []).flatMap(item => [item.reporterAvatar, item.targetAuthorAvatar])
    .filter(value => typeof value === 'string' && value.startsWith('cloud://')))];
  if (!fileIds.length) return;
  const result = await cloud.getTempFileURL({ fileList: fileIds });
  const urls = {};
  (result.fileList || []).forEach(item => { if (item.fileID && item.tempFileURL) urls[item.fileID] = item.tempFileURL; });
  reports.forEach(report => {
    if (urls[report.reporterAvatar]) report.reporterAvatar = urls[report.reporterAvatar];
    if (urls[report.targetAuthorAvatar]) report.targetAuthorAvatar = urls[report.targetAuthorAvatar];
  });
}

async function adminReportList(data = {}) {
  try {
    await requireAdmin(String(data.adminId || ''));
    const page = Math.max(1, Number(data.page) || 1);
    const pageSize = Math.max(1, Math.min(Number(data.pageSize) || 10, 50));
    const status = data.status === 'all' || REPORT_STATUSES.includes(data.status) ? data.status : 'pending';
    const targetType = data.targetType === 'all' || TARGET_TYPES.includes(data.targetType) ? data.targetType : 'all';
    const condition = {};
    if (status !== 'all') condition.status = status;
    if (targetType !== 'all') condition.targetType = targetType;
    const results = await Promise.all([
      db.collection(REPORT_COLLECTION).where(condition).count(),
      db.collection(REPORT_COLLECTION).where(condition).orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize).limit(pageSize).get()
    ]);
    const reports = results[1].data || [];
    await Promise.all([resolveUsers(reports), resolveTargets(reports)]);
    try { await resolveCloudAvatars(reports); }
    catch (error) { console.warn('admin report avatar resolution failed:', error.message || error); }
    return { success: true, reports, total: results[0].total || 0, page, pageSize };
  } catch (error) {
    console.error('admin report list failed:', error);
    return { success: false, error: error.message || '举报列表加载失败' };
  }
}

async function adminReportUpdate(data = {}) {
  try {
    const admin = await requireAdmin(String(data.adminId || ''));
    const reportId = String(data.reportId || '');
    const status = String(data.status || '');
    if (!reportId) throw new Error('举报ID不能为空');
    if (!['processed', 'ignored'].includes(status)) throw new Error('处理状态无效');
    const result = await db.collection(REPORT_COLLECTION).doc(reportId).get();
    if (!result || !result.data) throw new Error('举报记录不存在');
    const now = Date.now();
    await db.collection(REPORT_COLLECTION).doc(reportId).update({ data: {
      status,
      handleRemark: String(data.remark || '').trim().slice(0, 200),
      handledBy: String(data.adminId || ''),
      handledByName: String(data.reviewerName || admin.nickname || admin.username || '管理员'),
      handledAt: now,
      updatedAt: now
    } });
    // 举报是内部待办，不写入 notifications，也不改变作品审核状态。
    return { success: true, message: status === 'processed' ? '已标记处理' : '已忽略举报' };
  } catch (error) {
    console.error('admin report update failed:', error);
    return { success: false, error: error.message || '举报处理失败' };
  }
}

module.exports = { adminReportList, adminReportUpdate };
