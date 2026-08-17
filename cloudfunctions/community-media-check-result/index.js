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

function getReviewDecision(suggestions, expectedCount) {
  if (suggestions.some((suggest) => suggest === 'risky')) {
    return { reviewStatus: 'manual_review', machineSuggest: 'risky' };
  }
  const completed = suggestions.length === expectedCount &&
    suggestions.every((suggest) => VALID_SUGGESTIONS.includes(suggest));
  if (!completed) {
    return { reviewStatus: 'reviewing', machineSuggest: 'pending' };
  }
  if (suggestions.some((suggest) => suggest === 'review')) {
    return { reviewStatus: 'approved', machineSuggest: 'review' };
  }
  return { reviewStatus: 'approved', machineSuggest: 'pass' };
}

function mergeMachineSuggestions(suggestions) {
  if ((suggestions || []).includes('risky')) return 'risky';
  if ((suggestions || []).includes('review')) return 'review';
  if ((suggestions || []).includes('pending')) return 'pending';
  return 'pass';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistAuditResult(payload) {
  const candidates = [
    { collection: 'community_image_audits', targetType: 'community_post', targetField: 'postId' },
    { collection: 'community_image_audits', targetType: 'community_comment', targetField: 'commentId' },
    { collection: 'trip_log_image_audits', targetType: 'trip_log', targetField: 'logId' }
  ];
  let mapping = null;
  for (const candidate of candidates) {
    try {
      const doc = db.collection(candidate.collection).doc(payload.traceId);
      const result = await doc.get();
      const audit = result.data;
      if (audit && audit[candidate.targetField]) {
        mapping = { ...candidate, doc, audit, targetId: audit[candidate.targetField] };
        break;
      }
    } catch (error) {
      // Try the next supported audit collection.
    }
  }
  if (!mapping) return null;

  const now = Date.now();
  await mapping.doc.update({
    data: {
      status: 'completed',
      suggest: payload.suggest,
      label: payload.label,
      detail: payload.detail,
      updatedAt: now,
      completedAt: mapping.audit.completedAt || now
    }
  });
  console.log('[community/image-audit-callback] audit-saved', JSON.stringify({
    targetType: mapping.targetType,
    targetId: mapping.targetId,
    traceId: payload.traceId,
    suggest: payload.suggest
  }));
  return { ...mapping.audit, targetType: mapping.targetType, targetId: mapping.targetId };
}

async function reconcileComment(commentId, commentTargetType) {
  const isReply = commentTargetType === 'reply';
  const collectionName = isReply ? 'community_comment_replies' : 'community_comments';
  return db.runTransaction(async transaction => {
    const itemDoc = transaction.collection(collectionName).doc(commentId);
    const itemRes = await itemDoc.get();
    const item = itemRes.data;
    if (!item) return { ignored: true, reason: 'COMMENT_NOT_FOUND' };

    const traceIds = Array.isArray(item.imageAuditTraceIds) ? item.imageAuditTraceIds : [];
    const suggestions = [];
    for (const traceId of traceIds) {
      const auditRes = await transaction.collection('community_image_audits').doc(traceId).get();
      suggestions.push(auditRes.data && auditRes.data.suggest || 'pending');
    }
    const decision = getReviewDecision(suggestions, traceIds.length);
    const rejected = decision.machineSuggest === 'risky';
    const now = Date.now();
    const wasActive = item.status === 'active';
    await itemDoc.update({ data: {
      status: rejected ? 'rejected' : item.status,
      reviewStatus: rejected ? 'rejected' : (decision.reviewStatus === 'approved' ? 'approved' : 'reviewing'),
      machineSuggest: decision.machineSuggest,
      imageAuditStatus: rejected ? 'rejected' : decision.reviewStatus,
      rejectedAt: rejected ? (item.rejectedAt || now) : (item.rejectedAt || 0),
      updatedAt: now
    } });

    if (rejected && wasActive) {
      const postDoc = transaction.collection('community_posts').doc(item.postId);
      const postRes = await postDoc.get();
      const post = postRes.data;
      if (post) {
        let removedCount = 1;
        if (isReply) {
          const rootDoc = transaction.collection('community_comments').doc(item.rootCommentId);
          const rootRes = await rootDoc.get();
          const root = rootRes.data;
          if (root && root.status === 'active') {
            await rootDoc.update({ data: {
              replyCount: Math.max(0, (Number(root.replyCount) || 0) - 1),
              updatedAt: now
            } });
          } else {
            // A rejected/deleted root already removed its whole thread from
            // the public count; do not decrement the post a second time.
            removedCount = 0;
          }
        } else {
          removedCount += Math.max(0, Number(item.replyCount) || 0);
        }
        if (removedCount > 0) {
          await postDoc.update({ data: {
            commentCount: Math.max(0, (Number(post.commentCount) || 0) - removedCount),
            updatedAt: now
          } });
        }
      }
    }

    return {
      ignored: false,
      targetType: isReply ? 'community_reply' : 'community_comment',
      commentId,
      reviewStatus: rejected ? 'rejected' : decision.reviewStatus,
      machineSuggest: decision.machineSuggest
    };
  });
}

async function reconcileCommentWithRetry(commentId, commentTargetType) {
  let lastError;
  for (let attempt = 1; attempt <= RECONCILE_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await reconcileComment(commentId, commentTargetType);
      if (result && result.reason === 'COMMENT_NOT_FOUND' && attempt < RECONCILE_MAX_ATTEMPTS) {
        await wait(50 * attempt);
        continue;
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < RECONCILE_MAX_ATTEMPTS) await wait(25 * attempt);
    }
  }
  throw lastError;
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

    const imageDecision = getReviewDecision(suggestions, traceIds.length);
    const machineSuggest = mergeMachineSuggestions([
      post.textMachineSuggest || 'pass',
      imageDecision.machineSuggest
    ]);
    const previousAdminReviewStatus = post.adminReviewStatus || 'not_required';
    const hasAdminDecision = previousAdminReviewStatus === 'approved' ||
      previousAdminReviewStatus === 'rejected';
    const adminReviewStatus = hasAdminDecision
      ? previousAdminReviewStatus
      : (machineSuggest === 'review' || machineSuggest === 'risky'
        ? 'pending'
        : 'not_required');
    const reviewStatus = previousAdminReviewStatus === 'rejected' ? 'rejected' : 'approved';
    const now = Date.now();
    await postDoc.update({
      data: {
        reviewStatus,
        machineSuggest,
        adminReviewStatus,
        imageAuditStatus: imageDecision.machineSuggest === 'pending' ? 'pending' : 'completed',
        imageAuditUpdatedAt: now,
        updatedAt: now
      }
    });
    return {
      ignored: false,
      postId,
      reviewStatus,
      machineSuggest,
      adminReviewStatus
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

async function reconcileTripLog(logId) {
  return db.runTransaction(async transaction => {
    const logDoc = transaction.collection('trip_logs').doc(logId);
    const logRes = await logDoc.get();
    const log = logRes.data;
    if (!log) return { ignored: true, reason: 'TRIP_LOG_NOT_FOUND' };

    const traceIds = Array.isArray(log.imageAuditTraceIds) ? log.imageAuditTraceIds : [];
    const suggestions = [];
    for (const traceId of traceIds) {
      const itemRes = await transaction.collection('trip_log_image_audits').doc(traceId).get();
      suggestions.push(itemRes.data && itemRes.data.suggest || 'pending');
    }
    const imageDecision = getReviewDecision(suggestions, traceIds.length);
    const machineSuggest = mergeMachineSuggestions([
      log.textMachineSuggest || 'pass',
      imageDecision.machineSuggest
    ]);
    const previousAdminReviewStatus = log.adminReviewStatus || 'not_required';
    const hasAdminDecision = ['approved', 'rejected'].includes(previousAdminReviewStatus);
    const adminReviewStatus = hasAdminDecision
      ? previousAdminReviewStatus
      : (['review', 'risky'].includes(machineSuggest) ? 'pending' : 'not_required');
    const reviewStatus = previousAdminReviewStatus === 'rejected' ? 'rejected' : 'approved';
    const now = Date.now();
    await logDoc.update({ data: {
      reviewStatus,
      machineSuggest,
      adminReviewStatus,
      imageAuditStatus: imageDecision.machineSuggest === 'pending' ? 'pending' : 'completed',
      imageAuditUpdatedAt: now,
      updatedAt: now
    } });
    return { ignored: false, targetType: 'trip_log', logId, reviewStatus, machineSuggest, adminReviewStatus };
  });
}

async function reconcileTripLogWithRetry(logId) {
  let lastError;
  for (let attempt = 1; attempt <= RECONCILE_MAX_ATTEMPTS; attempt++) {
    try {
      return await reconcileTripLog(logId);
    } catch (error) {
      lastError = error;
      console.warn('[trip-log/image-audit-callback] reconcile-conflict', JSON.stringify({
        logId,
        attempt,
        error: error.message || String(error)
      }));
      if (attempt < RECONCILE_MAX_ATTEMPTS) await wait(25 * attempt);
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

    const result = audit.targetType === 'trip_log'
      ? await reconcileTripLogWithRetry(audit.targetId)
      : audit.targetType === 'community_comment'
        ? await reconcileCommentWithRetry(audit.targetId, audit.commentTargetType)
        : await reconcilePostWithRetry(audit.targetId);
    console.log('[community/image-audit-callback] completed', JSON.stringify(result));
    return { success: true, ...result };
  } catch (error) {
    console.error('处理图片审核回调失败:', error);
    // Throw so the invocation is visibly failed and can be retried/alerted.
    throw error;
  }
};
