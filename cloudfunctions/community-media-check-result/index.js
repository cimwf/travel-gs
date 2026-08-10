const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const VALID_SUGGESTIONS = ['pass', 'review', 'risky'];
const RECONCILE_MAX_ATTEMPTS = 3;

function getNotificationId(type, receiverId, sourceId) {
  return crypto.createHash('sha256')
    .update(String(type) + '\n' + String(receiverId) + '\n' + String(sourceId))
    .digest('hex')
    .slice(0, 32);
}

function getPostThumbnail(post) {
  const images = post && Array.isArray(post.images) ? post.images : [];
  const first = images.length > 0 ? images[0] : null;
  if (typeof first === 'string') return first;
  return first && (first.url || first.tempFileURL || '') || '';
}

async function createReviewNotification(transaction, post, decision, now) {
  if (!post.authorId || decision.reviewStatus === 'reviewing') return;
  const typeMap = {
    pass: 'community_review_approved',
    review: 'community_review_pending',
    risky: 'community_review_manual'
  };
  const titleMap = {
    pass: '作品审核通过',
    review: '作品已发布，待复核',
    risky: '作品正在进一步审核'
  };
  const contentMap = {
    pass: '你的图片作品已通过审核并发布',
    review: '你的图片作品已发布，后续将进行人工复核',
    risky: '你的图片作品风险较高，暂不在社区展示'
  };
  const type = typeMap[decision.machineSuggest];
  if (!type) return;
  const sourceId = post._id + ':' + decision.machineSuggest;
  const id = getNotificationId(type, post.authorId, sourceId);
  await transaction.collection('notifications').doc(id).set({
    data: {
      receiverId: post.authorId,
      category: 'system',
      type,
      actorId: '',
      actorName: '',
      actorAvatar: '',
      targetType: decision.reviewStatus === 'approved' ? 'community_post' : 'my_works',
      targetId: post._id,
      sourceType: 'review',
      sourceId,
      title: titleMap[decision.machineSuggest],
      actionText: '',
      content: contentMap[decision.machineSuggest],
      thumbnail: getPostThumbnail(post),
      isRead: false,
      readAt: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  });
}

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

    const decision = getReviewDecision(suggestions, traceIds.length);
    const previousAdminReviewStatus = post.adminReviewStatus || 'not_required';
    const hasAdminDecision = previousAdminReviewStatus === 'approved' ||
      previousAdminReviewStatus === 'rejected';
    const adminReviewStatus = hasAdminDecision
      ? previousAdminReviewStatus
      : (decision.machineSuggest === 'review' || decision.machineSuggest === 'risky'
        ? 'pending'
        : 'not_required');
    const reviewStatus = hasAdminDecision
      ? (previousAdminReviewStatus === 'approved' ? 'approved' : 'rejected')
      : decision.reviewStatus;
    const previousReviewStatus = post.reviewStatus;
    const previousMachineSuggest = post.machineSuggest || 'pending';
    const now = Date.now();
    await postDoc.update({
      data: {
        reviewStatus,
        machineSuggest: decision.machineSuggest,
        adminReviewStatus,
        imageAuditStatus: reviewStatus,
        imageAuditUpdatedAt: now,
        updatedAt: now
      }
    });
    if (reviewStatus !== 'reviewing' &&
      (previousReviewStatus !== reviewStatus || previousMachineSuggest !== decision.machineSuggest)) {
      await createReviewNotification(transaction, post, decision, now);
    }

    return {
      ignored: false,
      postId,
      reviewStatus,
      machineSuggest: decision.machineSuggest
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
