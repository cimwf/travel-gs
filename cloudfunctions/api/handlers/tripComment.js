const { db, _, cloud } = require('../utils/shared');
const { setNotification } = require('./notification');
const tripMedia = require('./tripMedia');

const MAX_COMMENT_LENGTH = 300;
const MAX_COMMENT_IMAGES = 3;

function generateCommentId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14);
}

function isDocumentNotFoundError(error) {
  const code = error && (error.errCode || error.code);
  const message = String(error && (error.message || error.errMsg) || '').toLowerCase();
  return code === -502002 || code === 'DATABASE_DOCUMENT_NOT_EXIST' ||
    message.indexOf('not exist') !== -1 || message.indexOf('not found') !== -1 ||
    message.indexOf('不存在') !== -1;
}

async function getCurrentUser(openid) {
  if (!openid) throw new Error('请先登录');
  const res = await db.collection('users').where({ openid }).limit(1).get();
  if (!res.data || res.data.length === 0) throw new Error('用户未注册');
  return res.data[0];
}

async function securityCheck(openid, content) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      version: 2,
      scene: 4,
      openid,
      content
    });
    const suggest = result && result.result && result.result.suggest;
    return { ok: suggest === 'pass', unavailable: false };
  } catch (error) {
    console.warn('trip comment msgSecCheck failed:', error.message || error);
    return { ok: false, unavailable: error && error.errCode === -604101 };
  }
}

async function submitImageAudits(openid, commentId, targetType, images) {
  return Promise.all(images.map(async image => {
    const response = await cloud.openapi.security.mediaCheckAsync({
      version: 2,
      scene: 4,
      openid,
      mediaType: 2,
      mediaUrl: image.url
    });
    const traceId = response && (response.traceId || response.trace_id);
    if (!traceId) throw new Error('评论图片安全检测未返回 traceId');
    const now = Date.now();
    await db.collection('trip_comment_image_audits').doc(traceId).set({
      data: {
        traceId,
        commentId,
        commentTargetType: targetType,
        imageKey: image.key,
        imageUrl: image.url,
        status: 'pending',
        suggest: 'pending',
        label: 0,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000
      }
    });
    return { traceId, imageKey: image.key };
  }));
}

async function resolveAvatarUrls(items) {
  const fileIds = [];
  (items || []).forEach(item => {
    if (item.authorAvatar && item.authorAvatar.startsWith('cloud://')) fileIds.push(item.authorAvatar);
  });
  if (fileIds.length === 0) return;
  try {
    const result = await cloud.getTempFileURL({ fileList: fileIds });
    const map = {};
    (result.fileList || []).forEach(file => {
      if (file.tempFileURL) map[file.fileID] = file.tempFileURL;
    });
    items.forEach(item => {
      if (map[item.authorAvatar]) item.authorAvatar = map[item.authorAvatar];
    });
  } catch (error) {
    console.warn('解析行程评论头像失败:', error.message || error);
  }
}

function getTripThumbnail(trip) {
  const images = Array.isArray(trip.coverImageUrls) ? trip.coverImageUrls : [];
  const first = images[0];
  if (typeof first === 'string') return first;
  return first && (first.url || first.tempFileURL) || trip.placeCoverImage || trip.placeImage || '';
}

async function getTrip(tripId) {
  try {
    const result = await db.collection('trips').doc(tripId).get();
    return result && result.data;
  } catch (error) {
    if (isDocumentNotFoundError(error)) return null;
    throw error;
  }
}

async function queryReplies(tripId, rootCommentId, data) {
  const pageSize = Math.max(1, Math.min(Number(data && data.pageSize) || 20, 50));
  const cursor = Number(data && data.cursor) || 0;
  const cursorId = String(data && data.cursorId || '');
  let condition = { tripId, rootCommentId, status: 'active' };
  if (cursor > 0) {
    const cursorCondition = cursorId
      ? _.or([
        { createdAt: _.gt(cursor) },
        { createdAt: _.eq(cursor), _id: _.gt(cursorId) }
      ])
      : { createdAt: _.gt(cursor) };
    condition = _.and([condition, cursorCondition]);
  }
  const result = await db.collection('trip_comment_replies')
    .where(condition)
    .orderBy('createdAt', 'asc')
    .orderBy('_id', 'asc')
    .limit(pageSize + 1)
    .get();
  let replies = result.data || [];
  const hasMore = replies.length > pageSize;
  if (hasMore) replies = replies.slice(0, pageSize);
  await resolveAvatarUrls(replies);
  const last = replies[replies.length - 1];
  return {
    replies,
    hasMore,
    nextCursor: last ? last.createdAt : 0,
    nextCursorId: last ? last._id : ''
  };
}

async function tripCommentList(openid, data) {
  try {
    const tripId = String(data && data.tripId || '').trim();
    if (!tripId) return { success: false, error: '行程 ID 不能为空' };
    const trip = await getTrip(tripId);
    if (!trip) return { success: false, error: '行程不存在' };

    const pageSize = Math.max(1, Math.min(Number(data && data.pageSize) || 20, 50));
    const cursor = Number(data && data.cursor) || 0;
    const cursorId = String(data && data.cursorId || '');
    let condition = { tripId, status: 'active' };
    if (cursor > 0) {
      const cursorCondition = cursorId
        ? _.or([
          { createdAt: _.lt(cursor) },
          { createdAt: _.eq(cursor), _id: _.lt(cursorId) }
        ])
        : { createdAt: _.lt(cursor) };
      condition = _.and([condition, cursorCondition]);
    }
    const result = await db.collection('trip_comments')
      .where(condition)
      .orderBy('createdAt', 'desc')
      .orderBy('_id', 'desc')
      .limit(pageSize + 1)
      .get();
    let comments = result.data || [];
    const hasMore = comments.length > pageSize;
    if (hasMore) comments = comments.slice(0, pageSize);
    await resolveAvatarUrls(comments);
    await Promise.all(comments.map(async comment => {
      comment.replyCount = Math.max(0, Number(comment.replyCount) || 0);
      comment.replies = [];
      comment.repliesHasMore = false;
      comment.nextReplyCursor = 0;
      comment.nextReplyCursorId = '';
      if (!comment.replyCount) return;
      try {
        const preview = await queryReplies(tripId, comment._id, { pageSize: 3 });
        comment.replies = preview.replies;
        comment.repliesHasMore = preview.hasMore;
        comment.nextReplyCursor = preview.nextCursor;
        comment.nextReplyCursorId = preview.nextCursorId;
      } catch (error) {
        comment.repliesHasMore = true;
      }
    }));
    const last = comments[comments.length - 1];
    return {
      success: true,
      comments,
      hasMore,
      nextCursor: last ? last.createdAt : 0,
      nextCursorId: last ? last._id : '',
      commentCount: Math.max(0, Number(trip.commentCount) || 0)
    };
  } catch (error) {
    console.error('tripComment/list failed:', error);
    return { success: false, error: error.message || '评论加载失败，请重试' };
  }
}

async function tripReplyList(openid, data) {
  try {
    const tripId = String(data && data.tripId || '').trim();
    const rootCommentId = String(data && data.rootCommentId || '').trim();
    if (!tripId || !rootCommentId) return { success: false, error: '回复信息不完整' };
    const trip = await getTrip(tripId);
    let root = null;
    try { root = (await db.collection('trip_comments').doc(rootCommentId).get()).data; } catch (error) {}
    if (!trip || !root || root.tripId !== tripId || root.status !== 'active') {
      return { success: false, error: '评论不存在或已删除' };
    }
    const page = await queryReplies(tripId, rootCommentId, data);
    return Object.assign({
      success: true,
      replyCount: Math.max(0, Number(root.replyCount) || 0)
    }, page);
  } catch (error) {
    console.error('tripComment/replyList failed:', error);
    return { success: false, error: error.message || '回复加载失败，请重试' };
  }
}

async function tripCommentCreate(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    const tripId = String(data && data.tripId || '').trim();
    const content = String(data && data.content || '').trim();
    const uploadSessionId = String(data && data.uploadSessionId || '').trim();
    const images = Array.isArray(data && data.images) ? data.images : [];
    const replyToId = String(data && data.replyToId || '').trim();
    const replyToType = String(data && data.replyToType || '').trim();
    const isReply = !!replyToId;
    if (!tripId) return { success: false, error: '行程 ID 不能为空' };
    if (!content && images.length === 0) return { success: false, error: '评论内容不能为空，或请选择图片' };
    if (content.length > MAX_COMMENT_LENGTH) return { success: false, error: '评论不能超过 300 字' };
    if (images.length > MAX_COMMENT_IMAGES) return { success: false, error: '评论图片不能超过 3 张' };
    if (isReply && ['comment', 'reply'].indexOf(replyToType) === -1) {
      return { success: false, error: '回复目标无效' };
    }
    const trip = await getTrip(tripId);
    if (!trip) return { success: false, error: '行程不存在' };
    if (content) {
      const check = await securityCheck(openid, content);
      if (!check.ok) {
        return {
          success: false,
          error: check.unavailable ? '内容安全检测服务暂不可用，请稍后重试' : '评论未通过安全检测，请修改后重试'
        };
      }
    }
    const user = await getCurrentUser(openid);
    const now = Date.now();
    let validatedImages = [];
    if (images.length > 0) {
      const verified = await tripMedia.verifyUploadSession(openid, {
        sessionId: uploadSessionId,
        tripId,
        purpose: 'comment',
        media: images
      });
      validatedImages = verified.media;
    }
    const fixedCommentId = generateCommentId(isReply ? 'trip_reply' : 'trip_comment');
    let imageAudits = [];
    if (validatedImages.length > 0) {
      try {
        imageAudits = await submitImageAudits(
          openid,
          fixedCommentId,
          isReply ? 'reply' : 'comment',
          validatedImages
        );
      } catch (auditError) {
        console.error('提交行程评论图片安全检测失败:', auditError);
        return {
          success: false,
          error: '图片安全检测服务暂不可用，请稍后重试',
          errorCode: 'IMAGE_SECURITY_CHECK_FAILED'
        };
      }
    }
    const base = {
      tripId,
      tripCreatorId: trip.creatorId,
      authorId: openid,
      authorName: user.nickname || '旅行者',
      authorAvatar: user.avatar || '',
      content,
      images: validatedImages,
      imageCount: validatedImages.length,
      imageAuditTraceIds: imageAudits.map(audit => audit.traceId),
      imageAuditStatus: validatedImages.length > 0 ? 'pending' : 'not_required',
      machineSuggest: validatedImages.length > 0 ? 'pending' : 'pass',
      reviewStatus: 'approved',
      likeCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: 0
    };
    const result = await db.runTransaction(async transaction => {
      const tripDoc = transaction.collection('trips').doc(tripId);
      const currentTrip = (await tripDoc.get()).data;
      if (!currentTrip) throw new Error('行程不存在');
      let uploadSessionDoc = null;
      if (validatedImages.length > 0) {
        uploadSessionDoc = transaction.collection('trip_media_upload_sessions').doc(uploadSessionId);
        const session = (await uploadSessionDoc.get()).data;
        if (!session || session.ownerId !== openid || session.tripId !== tripId ||
          session.purpose !== 'comment' || session.status !== 'uploading') {
          throw new Error('评论图片上传会话已经使用或不可用');
        }
        if (Number(session.expiresAt) <= Date.now()) throw new Error('评论图片上传会话已过期');
      }
      let createdData;
      let addResult;
      let rootCommentId = '';
      let rootReplyCount = 0;
      if (isReply) {
        const targetCollection = replyToType === 'reply' ? 'trip_comment_replies' : 'trip_comments';
        let target = null;
        try { target = (await transaction.collection(targetCollection).doc(replyToId).get()).data; } catch (error) {}
        if (!target || target.tripId !== tripId || target.status !== 'active') {
          throw new Error('回复目标不存在或已删除');
        }
        rootCommentId = replyToType === 'reply' ? target.rootCommentId : target._id;
        const rootDoc = transaction.collection('trip_comments').doc(rootCommentId);
        const root = replyToType === 'comment' ? target : (await rootDoc.get()).data;
        if (!root || root.tripId !== tripId || root.status !== 'active') throw new Error('主评论不存在或已删除');
        createdData = Object.assign({}, base, {
          rootCommentId,
          parentReplyId: replyToType === 'reply' ? target._id : '',
          replyToId: target._id,
          replyToType,
          replyToUserId: target.authorId,
          replyToUserName: target.authorName || '旅行者',
          isReply: true
        });
        if (validatedImages.length > 0) {
          await transaction.collection('trip_comment_replies').doc(fixedCommentId).set({ data: createdData });
          addResult = { _id: fixedCommentId };
        } else {
          addResult = await transaction.collection('trip_comment_replies').add({ data: createdData });
        }
        rootReplyCount = Math.max(0, Number(root.replyCount) || 0) + 1;
        await rootDoc.update({ data: { replyCount: rootReplyCount, updatedAt: now } });
      } else {
        createdData = Object.assign({}, base, { replyCount: 0, isReply: false });
        if (validatedImages.length > 0) {
          await transaction.collection('trip_comments').doc(fixedCommentId).set({ data: createdData });
          addResult = { _id: fixedCommentId };
        } else {
          addResult = await transaction.collection('trip_comments').add({ data: createdData });
        }
      }
      if (uploadSessionDoc) {
        await uploadSessionDoc.update({ data: { status: 'consumed', consumedAt: now } });
      }
      const receiverId = isReply ? createdData.replyToUserId : currentTrip.creatorId;
      if (receiverId && receiverId !== openid) {
        await setNotification(transaction, {
          receiverId,
          category: 'interaction',
          type: isReply ? 'trip_reply' : 'trip_comment',
          actorId: openid,
          actorName: user.nickname || '旅行者',
          actorAvatar: user.avatar || '',
          targetType: 'trip',
          targetId: tripId,
          sourceType: isReply ? 'reply' : 'comment',
          sourceId: addResult._id,
          title: isReply ? '回复通知' : '评论通知',
          actionText: isReply ? '回复了你' : '评论了你的行程',
          content: content || '[图片]',
          thumbnail: getTripThumbnail(currentTrip),
          createdAt: now
        });
      }
      const commentCount = Math.max(0, Number(currentTrip.commentCount) || 0) + 1;
      await tripDoc.update({ data: { commentCount, updatedAt: now } });
      return { createdData, id: addResult._id, rootCommentId, rootReplyCount, commentCount };
    });
    return {
      success: true,
      comment: Object.assign({ _id: result.id }, result.createdData),
      isReply,
      rootCommentId: result.rootCommentId,
      rootReplyCount: result.rootReplyCount,
      commentCount: result.commentCount
    };
  } catch (error) {
    console.error('tripComment/create failed:', error);
    return { success: false, error: error.message || '评论失败，请重试' };
  }
}

async function tripCommentDelete(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    const tripId = String(data && data.tripId || '').trim();
    const commentId = String(data && data.commentId || '').trim();
    const targetType = String(data && data.targetType || 'comment').trim();
    if (!tripId || !commentId) return { success: false, error: '评论信息不完整' };
    if (['comment', 'reply'].indexOf(targetType) === -1) return { success: false, error: '评论类型无效' };
    const result = await db.runTransaction(async transaction => {
      const tripDoc = transaction.collection('trips').doc(tripId);
      const trip = (await tripDoc.get()).data;
      if (!trip) throw new Error('行程不存在');
      const now = Date.now();
      let rootCommentId = '';
      let rootReplyCount = 0;
      let removedCount = 1;
      if (targetType === 'reply') {
        const replyDoc = transaction.collection('trip_comment_replies').doc(commentId);
        const reply = (await replyDoc.get()).data;
        if (!reply || reply.tripId !== tripId || reply.status !== 'active') throw new Error('回复不存在或已删除');
        if (reply.authorId !== openid && trip.creatorId !== openid) throw new Error('无权删除这条回复');
        rootCommentId = reply.rootCommentId;
        const rootDoc = transaction.collection('trip_comments').doc(rootCommentId);
        const root = (await rootDoc.get()).data;
        if (!root || root.status !== 'active') throw new Error('主评论不存在或已删除');
        rootReplyCount = Math.max(0, (Number(root.replyCount) || 0) - 1);
        await replyDoc.update({ data: { status: 'deleted', deletedAt: now, updatedAt: now } });
        await rootDoc.update({ data: { replyCount: rootReplyCount, updatedAt: now } });
      } else {
        const commentDoc = transaction.collection('trip_comments').doc(commentId);
        const comment = (await commentDoc.get()).data;
        if (!comment || comment.tripId !== tripId || comment.status !== 'active') throw new Error('评论不存在或已删除');
        if (comment.authorId !== openid && trip.creatorId !== openid) throw new Error('无权删除这条评论');
        rootCommentId = comment._id;
        rootReplyCount = Math.max(0, Number(comment.replyCount) || 0);
        removedCount += rootReplyCount;
        await commentDoc.update({ data: { status: 'deleted', replyCount: 0, deletedAt: now, updatedAt: now } });
      }
      const commentCount = Math.max(0, Number(trip.commentCount) || 0) - removedCount;
      await tripDoc.update({ data: { commentCount, updatedAt: now } });
      return { rootCommentId, rootReplyCount, removedCount, commentCount };
    });
    if (targetType === 'comment' && result.rootReplyCount > 0) {
      try {
        await db.collection('trip_comment_replies').where({
          tripId,
          rootCommentId: result.rootCommentId,
          status: 'active'
        }).update({ data: { status: 'deleted', deletedAt: Date.now(), updatedAt: Date.now() } });
      } catch (cascadeError) {
        // 主评论已隐藏，级联清理失败不应让前端误以为删除失败。
        console.error('级联删除行程评论回复失败:', cascadeError);
      }
    }
    return Object.assign({ success: true, commentId, targetType }, result);
  } catch (error) {
    console.error('tripComment/delete failed:', error);
    return { success: false, error: error.message || '删除评论失败，请重试' };
  }
}

module.exports = {
  tripCommentList,
  tripReplyList,
  tripCommentCreate,
  tripCommentDelete
};
