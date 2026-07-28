const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const VALID_SUGGESTIONS = ['pass', 'review', 'risky'];
const RECONCILE_MAX_ATTEMPTS = 3;

function normalizeEvent(event) {
  const result = event && event.result || {};
  return {
    traceId: String(event && (event.trace_id || event.traceId) || ''),
    suggest: String(result.suggest || ''),
    label: result.label || 0,
    detail: Array.isArray(event && event.detail) ? event.detail : []
  };
}

function getReviewStatus(suggestions, expectedCount) {
  if (suggestions.some((suggest) => suggest === 'risky' || suggest === 'review')) {
    return 'manual_review';
  }
  if (suggestions.length === expectedCount &&
      suggestions.every((suggest) => suggest === 'pass')) {
    return 'approved';
  }
  return 'reviewing';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistAuditResult(payload) {
  const auditDoc = db.collection('community_image_audits').doc(payload.traceId);
  const auditRes = await auditDoc.get();
  const audit = auditRes.data;
  if (!audit || !audit.postId) {
    return null;
  }

  const now = Date.now();
  await auditDoc.update({
    data: {
      status: 'completed',
      suggest: payload.suggest,
      label: payload.label,
      detail: payload.detail,
      updatedAt: now,
      completedAt: audit.completedAt || now
    }
  });
  console.log('[community/image-audit-callback] audit-saved', JSON.stringify({
    postId: audit.postId,
    traceId: payload.traceId,
    suggest: payload.suggest
  }));
  return audit;
}

async function reconcilePost(postId) {
  return db.runTransaction(async (transaction) => {
    const postDoc = transaction.collection('community_posts').doc(postId);
    const postRes = await postDoc.get();
    const post = postRes.data;
    if (!post) {
      return { ignored: true, reason: 'POST_NOT_FOUND' };
    }

    const traceIds = Array.isArray(post.imageAuditTraceIds)
      ? post.imageAuditTraceIds
      : [];
    const suggestions = [];
    for (let i = 0; i < traceIds.length; i++) {
      const itemRes = await transaction
        .collection('community_image_audits')
        .doc(traceIds[i])
        .get();
      suggestions.push(itemRes.data && itemRes.data.suggest || 'pending');
    }

    const reviewStatus = getReviewStatus(suggestions, traceIds.length);
    const now = Date.now();
    await postDoc.update({
      data: {
        reviewStatus,
        imageAuditStatus: reviewStatus,
        imageAuditUpdatedAt: now,
        updatedAt: now
      }
    });

    return {
      ignored: false,
      postId,
      reviewStatus
    };
  });
}

async function reconcilePostWithRetry(postId) {
  let lastError;
  for (let attempt = 1; attempt <= RECONCILE_MAX_ATTEMPTS; attempt++) {
    try {
      return await reconcilePost(postId);
    } catch (error) {
      lastError = error;
      console.warn('[community/image-audit-callback] reconcile-conflict', JSON.stringify({
        postId,
        attempt,
        error: error.message || String(error)
      }));
      if (attempt < RECONCILE_MAX_ATTEMPTS) {
        await wait(25 * attempt);
      }
    }
  }
  throw lastError;
}

exports.main = async (event) => {
  const payload = normalizeEvent(event);
  console.log('[community/image-audit-callback] received', JSON.stringify({
    traceId: payload.traceId,
    suggest: payload.suggest
  }));
  if (!payload.traceId || !VALID_SUGGESTIONS.includes(payload.suggest)) {
    console.error('无效的图片审核回调:', JSON.stringify(event || {}));
    return { success: false, error: 'INVALID_MEDIA_CHECK_CALLBACK' };
  }

  try {
    // Persist each image result independently first. Concurrent callbacks must
    // never lose their own result because they conflict while updating one post.
    const audit = await persistAuditResult(payload);
    if (!audit) {
      return { success: true, ignored: true, reason: 'AUDIT_MAPPING_NOT_FOUND' };
    }

    const result = await reconcilePostWithRetry(audit.postId);
    console.log('[community/image-audit-callback] completed', JSON.stringify(result));
    return { success: true, ...result };
  } catch (error) {
    console.error('处理图片审核回调失败:', error);
    // Throw so the invocation is visibly failed and can be retried/alerted.
    throw error;
  }
};
