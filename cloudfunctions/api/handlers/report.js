const { db } = require('../utils/shared');
const tripMedia = require('./tripMedia');

const ALLOWED_TARGET_TYPES = ['community_post', 'trip_log'];
const ALLOWED_REASONS = [
  '违法违规', '色情低俗', '暴力血腥', '虚假诈骗',
  '广告营销', '侵犯隐私', '人身攻击', '其他'
];

async function getTarget(targetType, targetId) {
  const collection = targetType === 'community_post' ? 'community_posts' : 'trip_logs';
  let result;
  try { result = await db.collection(collection).doc(targetId).get(); }
  catch (err) { return null; }
  return result && result.data || null;
}

async function reportCreate(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    const targetType = String(data && data.targetType || '').trim();
    const targetId = String(data && data.targetId || '').trim();
    const reason = String(data && data.reason || '').trim();
    const description = String(data && data.description || '').trim();
    const sessionId = String(data && data.sessionId || '').trim();
    const submittedMedia = Array.isArray(data && data.images) ? data.images : [];

    if (!ALLOWED_TARGET_TYPES.includes(targetType) || !targetId) {
      return { success: false, error: '举报对象无效' };
    }
    if (!ALLOWED_REASONS.includes(reason)) {
      return { success: false, error: '请选择举报原因' };
    }
    if (description.length > 200) return { success: false, error: '补充说明不能超过200字' };
    if (submittedMedia.length > 3) return { success: false, error: '最多上传3张图片' };

    const target = await getTarget(targetType, targetId);
    if (!target || target.status !== 'active') return { success: false, error: '举报内容不存在或已删除' };
    const authorId = targetType === 'community_post' ? target.authorId : target.publisherId;
    if (authorId === openid) return { success: false, error: '不能举报自己发布的内容' };

    const duplicate = await db.collection('reports').where({
      reporterId: openid,
      targetType,
      targetId,
      status: 'pending'
    }).limit(1).get();
    if (duplicate.data && duplicate.data.length > 0) {
      return { success: false, error: '你已举报过该内容，请等待处理' };
    }

    let images = [];
    if (submittedMedia.length > 0) {
      const verified = await tripMedia.verifyUploadSession(openid, {
        sessionId,
        tripId: '',
        purpose: 'report',
        media: submittedMedia
      });
      images = verified.media;
    }

    const now = Date.now();
    const report = {
      reporterId: openid,
      targetType,
      targetId,
      targetAuthorId: authorId || '',
      targetTripId: targetType === 'trip_log' ? (target.tripId || '') : '',
      targetDataEnv: target.dataEnv || '',
      reason,
      description,
      images,
      status: 'pending',
      result: '',
      handledBy: '',
      handledAt: 0,
      createdAt: now,
      updatedAt: now
    };
    const result = await db.collection('reports').add({ data: report });
    if (sessionId) await tripMedia.consumeUploadSession(sessionId);
    return { success: true, reportId: result._id };
  } catch (err) {
    console.error('report/create failed:', err);
    return { success: false, error: err.message || '举报提交失败，请重试' };
  }
}

module.exports = { reportCreate };
