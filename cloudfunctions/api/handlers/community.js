const { db, _, cloud } = require('../utils/shared');
const nodeCrypto = require('crypto');

// COS configuration from environment variables
const COS_CONFIG = {
  bucket: process.env.COMMUNITY_COS_BUCKET || 'imagica-images-1436573577',
  region: process.env.COMMUNITY_COS_REGION || 'ap-beijing',
  baseUrl: process.env.COMMUNITY_COS_BASE_URL || 'https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com',
  prefix: process.env.COMMUNITY_COS_PREFIX || 'miniapp/community/',
  secretId: process.env.COS_SECRET_ID || '',
  secretKey: process.env.COS_SECRET_KEY || ''
};

const MAX_CONTENT_LENGTH = 300;
const MAX_IMAGES = 9;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DRAFT_EXPIRY_HOURS = 24;
const STS_DURATION_SECONDS = 900; // 15 minutes
const IMAGE_AUDIT_RETRY_AFTER_MS = 10 * 60 * 1000;
const IMAGE_AUDIT_MAX_RETRIES = 3;

// ========== helpers ==========

function isCosConfigured() {
  return !!(COS_CONFIG.secretId && COS_CONFIG.secretKey);
}

function getCosSts() {
  if (!isCosConfigured()) return null;
  try { return require('qcloud-cos-sts'); } catch (e) { return null; }
}

function getCosSdk() {
  if (!isCosConfigured()) return null;
  try {
    var COS = require('cos-nodejs-sdk-v5');
    return new COS({ SecretId: COS_CONFIG.secretId, SecretKey: COS_CONFIG.secretKey });
  } catch (e) { return null; }
}

function getDatePrefix() {
  var now = new Date();
  return now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0');
}

function generateUuid() {
  var h = '0123456789abcdef', u = '';
  for (var i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) u += '-';
    u += h[Math.floor(Math.random() * 16)];
  }
  return u;
}

function getCommunityLikeId(postId, openid) {
  return nodeCrypto.createHash('sha256')
    .update(String(postId) + '\n' + String(openid))
    .digest('hex')
    .slice(0, 32);
}

function isDocumentNotFoundError(error) {
  var code = error && (error.errCode || error.code);
  var message = String(error && (error.message || error.errMsg) || '').toLowerCase();
  return code === -502002 ||
    code === 'DATABASE_DOCUMENT_NOT_EXIST' ||
    message.indexOf('not exist') !== -1 ||
    message.indexOf('not found') !== -1 ||
    message.indexOf('不存在') !== -1;
}

function isValidLocation(loc) {
  if (!loc) return false;
  if (typeof loc.name !== 'string' || !loc.name.trim()) return false;
  if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return false;
  if (loc.latitude < -90 || loc.latitude > 90) return false;
  if (loc.longitude < -180 || loc.longitude > 180) return false;
  return true;
}

async function getCurrentUser(openid) {
  if (!openid) throw new Error('请先登录');
  var res = await db.collection('users').where({ openid }).get();
  if (res.data.length === 0) throw new Error('用户未注册');
  return res.data[0];
}

async function resolveAvatarUrls(posts) {
  var ids = [];
  posts.forEach(function (p) {
    if (p.authorAvatar && p.authorAvatar.startsWith('cloud://')) ids.push(p.authorAvatar);
  });
  if (ids.length === 0) return;
  try {
    var urlRes = await cloud.getTempFileURL({ fileList: ids });
    var map = {};
    (urlRes.fileList || []).forEach(function (f) { if (f.tempFileURL) map[f.fileID] = f.tempFileURL; });
    posts.forEach(function (p) {
      if (p.authorAvatar && map[p.authorAvatar]) p.authorAvatar = map[p.authorAvatar];
    });
  } catch (e) { /* ignore */ }
}

/**
 * Content security check v2.
 * scene: 4 = social / timeline post
 */
async function securityCheck(openid, text) {
  if (!text || !text.trim()) return { ok: true };
  try {
    var result = await cloud.openapi.security.msgSecCheck({
      version: 2,
      scene: 4,
      openid: openid,
      content: text.trim()
    });
    var checkResult = result && result.result;
    var suggest = checkResult && checkResult.suggest;
    // V2 returns pass / review / risky. Fail closed: only pass may publish.
    if (suggest !== 'pass') {
      return {
        ok: false,
        suggest: suggest || 'unknown',
        label: checkResult && checkResult.label || 'violation'
      };
    }
    return { ok: true, suggest: 'pass' };
  } catch (e) {
    if (e.errCode === -604101) {
      return { ok: false, label: 'security_api_unavailable' };
    }
    // Treat unknown security errors as block to be safe
    console.warn('msgSecCheck failed:', e.message || e);
    return { ok: false, label: 'security_check_error' };
  }
}

async function submitImageAudits(openid, postId, images) {
  var auditResults = await Promise.all(images.map(async function (image) {
    var response = await cloud.openapi.security.mediaCheckAsync({
      version: 2,
      scene: 4,
      openid: openid,
      mediaType: 2,
      mediaUrl: image.url
    });
    var traceId = response && (response.traceId || response.trace_id);
    if (!traceId) {
      throw new Error('图片安全检测未返回 traceId');
    }

    var now = Date.now();
    await db.collection('community_image_audits').doc(traceId).set({
      data: {
        traceId: traceId,
        postId: postId,
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
    console.log('[community/image-audit] submitted', JSON.stringify({
      postId: postId,
      traceId: traceId,
      imageKey: image.key
    }));
    return { traceId: traceId, imageKey: image.key };
  }));

  return auditResults;
}

async function claimStaleImageAuditRetry(openid, postId) {
  var now = Date.now();
  return db.runTransaction(async function (transaction) {
    var postDoc = transaction.collection('community_posts').doc(postId);
    var postRes = await postDoc.get();
    var post = postRes.data;
    if (!post || post.authorId !== openid || post.status !== 'active' ||
        post.reviewStatus !== 'reviewing' || !Array.isArray(post.images) ||
        post.images.length === 0) {
      return null;
    }

    var lastActivityAt = Number(post.imageAuditRetryAt ||
      post.imageAuditUpdatedAt || post.createdAt || 0);
    var retryCount = Number(post.imageAuditRetryCount || 0);
    if (retryCount >= IMAGE_AUDIT_MAX_RETRIES ||
        now - lastActivityAt < IMAGE_AUDIT_RETRY_AFTER_MS) {
      return null;
    }

    await postDoc.update({
      data: {
        imageAuditRetryAt: now,
        imageAuditRetryCount: retryCount + 1,
        imageAuditLastError: '',
        updatedAt: now
      }
    });
    return post;
  });
}

async function retryStaleImageAudit(openid, postId) {
  var post = await claimStaleImageAuditRetry(openid, postId);
  if (!post) return false;

  try {
    var currentTraceIds = Array.isArray(post.imageAuditTraceIds)
      ? post.imageAuditTraceIds
      : [];
    var imageByKey = {};
    post.images.forEach(function (image) {
      if (image && image.key) imageByKey[image.key] = image;
    });

    var retainedTraceIds = [];
    var retryImages = [];
    for (var i = 0; i < currentTraceIds.length; i++) {
      var auditRes = await db.collection('community_image_audits')
        .doc(currentTraceIds[i])
        .get();
      var audit = auditRes.data;
      if (audit && audit.suggest === 'pass') {
        retainedTraceIds.push(currentTraceIds[i]);
      } else if (audit && imageByKey[audit.imageKey]) {
        retryImages.push(imageByKey[audit.imageKey]);
      }
    }

    // Older records may not have complete audit mappings; retry every image once.
    if (retryImages.length === 0 && retainedTraceIds.length !== post.images.length) {
      retryImages = post.images;
      retainedTraceIds = [];
    }

    var newAudits = await submitImageAudits(openid, postId, retryImages);
    var nextTraceIds = retainedTraceIds.concat(newAudits.map(function (audit) {
      return audit.traceId;
    }));
    await db.collection('community_posts').doc(postId).update({
      data: {
        imageAuditTraceIds: nextTraceIds,
        imageAuditStatus: 'pending',
        imageAuditUpdatedAt: Date.now(),
        imageAuditLastError: '',
        updatedAt: Date.now()
      }
    });
    await reconcileImageAuditStatus(postId, nextTraceIds);
    console.log('[community/image-audit] retry-submitted', JSON.stringify({
      postId: postId,
      traceIds: nextTraceIds
    }));
    return true;
  } catch (error) {
    console.error('[community/image-audit] retry-failed', postId, error);
    await db.collection('community_posts').doc(postId).update({
      data: {
        imageAuditLastError: error.message || String(error),
        imageAuditUpdatedAt: Date.now(),
        updatedAt: Date.now()
      }
    }).catch(function () {});
    return false;
  }
}

async function reconcileImageAuditStatus(postId, traceIds) {
  if (!postId || !Array.isArray(traceIds) || traceIds.length === 0) return 'reviewing';

  return db.runTransaction(async function (transaction) {
    var postDoc = transaction.collection('community_posts').doc(postId);
    var postRes = await postDoc.get();
    if (!postRes.data) return 'reviewing';

    var audits = [];
    for (var i = 0; i < traceIds.length; i++) {
      var auditRes = await transaction.collection('community_image_audits').doc(traceIds[i]).get();
      audits.push(auditRes.data || { suggest: 'pending' });
    }

    var suggestions = audits.map(function (audit) { return audit.suggest; });
    var reviewStatus = suggestions.some(function (suggest) {
      return suggest === 'risky' || suggest === 'review';
    })
      ? 'manual_review'
      : suggestions.length === traceIds.length && suggestions.every(function (suggest) {
        return suggest === 'pass';
      })
        ? 'approved'
        : 'reviewing';

    await postDoc.update({
      data: {
        reviewStatus: reviewStatus,
        imageAuditStatus: reviewStatus,
        imageAuditUpdatedAt: Date.now(),
        updatedAt: Date.now()
      }
    });
    return reviewStatus;
  });
}

// ===================== community/list =====================

async function communityList(openid, data) {
  var requestedPageSize = Number(data && data.pageSize) || 10;
  var pageSize = Math.max(1, Math.min(requestedPageSize, 20));
  var cursor = Number(data && data.cursor) || 0;
  var cursorId = String(data && data.cursorId || '');

  // The community feed only shows content that has fully passed moderation.
  // Reviewing/rejected posts stay hidden from everyone, including the author.
  var listCondition = {
    status: 'active',
    reviewStatus: 'approved'
  };

  if (cursor > 0) {
    var cursorCondition = cursorId
      ? _.or([
        { createdAt: _.lt(cursor) },
        { createdAt: _.eq(cursor), _id: _.lt(cursorId) }
      ])
      : { createdAt: _.lt(cursor) };
    listCondition = _.and([listCondition, cursorCondition]);
  }

  try {
    var postsRes = await db.collection('community_posts')
      .where(listCondition)
      .orderBy('createdAt', 'desc')
      .orderBy('_id', 'desc')
      .limit(pageSize)
      .get();
    var posts = postsRes.data || [];

    posts.forEach(function (p) {
      p.isAuthor = !!(openid && p.authorId === openid);
      p.likeCount = Math.max(0, Number(p.likeCount) || 0);
      p.isLiked = false;
    });

    if (openid && posts.length > 0) {
      try {
        var postIds = posts.map(function (post) { return post._id; });
        var likesRes = await db.collection('community_likes').where({
          userId: openid,
          postId: _.in(postIds)
        }).get();
        var likedPostIds = {};
        (likesRes.data || []).forEach(function (like) {
          likedPostIds[like.postId] = true;
        });
        posts.forEach(function (post) {
          post.isLiked = !!likedPostIds[post._id];
        });
      } catch (likeQueryErr) {
        // Keep the public feed available if the likes collection is not ready yet.
        console.warn('查询社区点赞状态失败:', likeQueryErr.message || likeQueryErr);
      }
    }

    await resolveAvatarUrls(posts);

    var hasMore = posts.length >= pageSize;
    var last = posts.length > 0 ? posts[posts.length - 1] : null;
    var nextCursor = hasMore && last ? last.createdAt : 0;
    var nextCursorId = hasMore && last ? last._id : '';

    return { success: true, posts: posts, nextCursor: nextCursor, nextCursorId: nextCursorId, hasMore: hasMore };
  } catch (err) {
    console.error('community/list failed:', err);
    return { success: false, error: '获取社区动态失败' };
  }
}

// ===================== community/my =====================

async function communityMy(openid, data) {
  if (!openid) return { success: false, error: '请先登录' };

  var requestedPageSize = Number(data && data.pageSize) || 10;
  var pageSize = Math.max(1, Math.min(requestedPageSize, 20));
  var cursor = Number(data && data.cursor) || 0;
  var cursorId = String(data && data.cursorId || '');
  var listCondition = {
    authorId: openid,
    status: 'active'
  };

  if (cursor > 0) {
    var cursorCondition = cursorId
      ? _.or([
        { createdAt: _.lt(cursor) },
        { createdAt: _.eq(cursor), _id: _.lt(cursorId) }
      ])
      : { createdAt: _.lt(cursor) };
    listCondition = _.and([listCondition, cursorCondition]);
  }

  try {
    var postsRes = await db.collection('community_posts')
      .where(listCondition)
      .orderBy('createdAt', 'desc')
      .orderBy('_id', 'desc')
      .limit(pageSize)
      .get();
    var posts = postsRes.data || [];

    // A disabled/misconfigured message push can lose an async result. Re-submit
    // stale pending images when the owner opens My Works, with a strict retry cap.
    var stalePosts = posts.filter(function (post) {
      return post.reviewStatus === 'reviewing' &&
        Array.isArray(post.images) && post.images.length > 0;
    }).slice(0, 3);
    await Promise.all(stalePosts.map(function (post) {
      return retryStaleImageAudit(openid, post._id);
    }));

    posts.forEach(function (post) {
      post.isAuthor = true;
    });
    await resolveAvatarUrls(posts);

    var hasMore = posts.length >= pageSize;
    var last = posts.length > 0 ? posts[posts.length - 1] : null;
    return {
      success: true,
      posts: posts,
      nextCursor: hasMore && last ? last.createdAt : 0,
      nextCursorId: hasMore && last ? last._id : '',
      hasMore: hasMore
    };
  } catch (err) {
    console.error('community/my failed:', err);
    return { success: false, error: '获取我的作品失败' };
  }
}

// ===================== community/createUploadSession =====================

async function communityCreateUploadSession(openid, data) {
  try {
    await getCurrentUser(openid);

    // Require COS configuration
    if (!isCosConfigured()) {
      return { success: false, error: 'COS 存储尚未配置', errorCode: 'COS_NOT_CONFIGURED' };
    }

    var STS = getCosSts();
    if (!STS) {
      return { success: false, error: 'COS 临时凭证组件不可用', errorCode: 'COS_NOT_CONFIGURED' };
    }

    // Accept and validate metadata for every selected image.
    var fileMetas = (data && data.files) || [];
    if (!Array.isArray(fileMetas) || fileMetas.length < 1 || fileMetas.length > MAX_IMAGES) {
      return { success: false, error: '图片数量必须为 1 至 9 张' };
    }
    for (var metaIndex = 0; metaIndex < fileMetas.length; metaIndex++) {
      var meta = fileMetas[metaIndex] || {};
      if (!ALLOWED_MIME_TYPES.includes(meta.mimeType)) {
        return { success: false, error: '存在不支持的图片格式' };
      }
      var metaSize = Number(meta.size);
      if (!Number.isFinite(metaSize) || metaSize <= 0 || metaSize > MAX_FILE_SIZE) {
        return { success: false, error: '单张图片必须小于 10MB' };
      }
    }
    var fileCount = fileMetas.length;

    var now = Date.now();
    var draftId = 'draft_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    var datePrefix = getDatePrefix();
    var allowedPrefix = COS_CONFIG.prefix + datePrefix + '/' + draftId + '/';
    var bucketMatch = COS_CONFIG.bucket.match(/(\d+)$/);
    var appId = bucketMatch ? bucketMatch[1] : '';

    // Generate per-file uploadItems with server-assigned cosKeys
    var uploadItems = [];
    var exactResources = [];

    for (var i = 0; i < fileCount; i++) {
      var ext = 'jpg';
      var mime = (fileMetas[i] && fileMetas[i].mimeType) || 'image/jpeg';
      if (mime === 'image/png') ext = 'png';
      else if (mime === 'image/webp') ext = 'webp';

      var cosKey = allowedPrefix + generateUuid() + '.' + ext;
      uploadItems.push({ index: i, cosKey: cosKey, maxSize: MAX_FILE_SIZE, allowedMime: mime });
      exactResources.push('qcs::cos:' + COS_CONFIG.region + ':uid/' + appId + ':' + COS_CONFIG.bucket + '/' + cosKey);
    }

    // Build STS policy with exact keys + conditions
    var stsPolicy = {
      version: '2.0',
      statement: [{
        action: ['name/cos:PutObject'],
        effect: 'allow',
        resource: exactResources,
        condition: {
          'numeric_less_than_equal': { 'cos:content-length': MAX_FILE_SIZE },
          'string_like': { 'cos:content-type': 'image/*' }
        }
      }]
    };

    var stsResult = await new Promise(function (resolve, reject) {
      STS.getCredential({
        secretId: COS_CONFIG.secretId,
        secretKey: COS_CONFIG.secretKey,
        region: COS_CONFIG.region,
        durationSeconds: STS_DURATION_SECONDS,
        policy: stsPolicy
      }, function (err, result) { err ? reject(err) : resolve(result); });
    });

    // Create draft
    await db.collection('community_upload_drafts').add({
      data: {
        _id: draftId,
        ownerId: openid,
        status: 'uploading',
        maxFiles: fileCount,
        uploadedKeys: [],
        allowedPrefix: allowedPrefix,
        uploadItems: uploadItems,
        expiresAt: now + DRAFT_EXPIRY_HOURS * 60 * 60 * 1000,
        createdAt: now,
        completedAt: 0
      }
    });

    return {
      success: true,
      draftId: draftId,
      bucket: COS_CONFIG.bucket,
      region: COS_CONFIG.region,
      baseUrl: COS_CONFIG.baseUrl,
      allowedPrefix: allowedPrefix,
      uploadItems: uploadItems,
      credentials: {
        tmpSecretId: stsResult.credentials.tmpSecretId,
        tmpSecretKey: stsResult.credentials.tmpSecretKey,
        sessionToken: stsResult.credentials.sessionToken,
        startTime: stsResult.startTime,
        expiredTime: stsResult.expiredTime
      }
    };
  } catch (err) {
    console.error('createUploadSession failed:', err);
    return {
      success: false,
      error: err.message || '创建图片上传会话失败',
      errorCode: 'UPLOAD_SESSION_FAILED'
    };
  }
}

// ===================== community/create =====================

async function communityCreate(openid, data) {
  try {
    var user = await getCurrentUser(openid);
    var draftId = data && data.draftId;
    var content = (data && data.content || '').trim();
    var images = (data && data.images) || [];
    var location = data && data.location;

    var hasContent = content.length > 0;
    var hasImages = images.length > 0;
    var hasLocation = isValidLocation(location);

    if (!hasContent && !hasImages && !hasLocation) {
      return { success: false, error: '正文、图片和定位不能同时为空' };
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return { success: false, error: '正文不能超过 300 字' };
    }
    if (images.length > MAX_IMAGES) {
      return { success: false, error: '图片不能超过 9 张' };
    }
    if (location && !hasLocation) {
      return { success: false, error: '定位信息无效' };
    }

    // Content security check for ALL text content (including image posts)
    var secTexts = [];
    if (hasContent) secTexts.push(content);
    if (location && location.name) secTexts.push(location.name);
    if (location && location.address) secTexts.push(location.address);

    for (var si = 0; si < secTexts.length; si++) {
      var secResult = await securityCheck(openid, secTexts[si]);
      if (!secResult.ok) {
        if (secResult.label === 'security_api_unavailable') {
          return { success: false, error: '内容安全检测服务暂不可用，请稍后重试' };
        }
        return { success: false, error: '内容未通过安全检测，请修改后重试' };
      }
    }

    var now = Date.now();
    var validatedImages = [];

    if (hasImages) {
      if (!draftId) return { success: false, error: '图片发布缺少上传草稿' };

      // Fetch draft
      var draftRes = await db.collection('community_upload_drafts').doc(draftId).get();
      var draft = draftRes.data;
      if (!draft) return { success: false, error: '上传草稿不存在' };
      if (draft.ownerId !== openid) return { success: false, error: '无权使用该上传草稿' };
      if (draft.status === 'completed' && draft.postId) {
        try {
          var existingPostRes = await db.collection('community_posts').doc(draft.postId).get();
          if (existingPostRes.data) {
            existingPostRes.data.isAuthor = true;
            return { success: true, post: existingPostRes.data, duplicated: true };
          }
        } catch (existingPostErr) {
          console.warn('读取幂等动态失败:', existingPostErr);
        }
        return { success: false, error: '该草稿已经发布', errorCode: 'DUPLICATE_DRAFT' };
      }
      if (draft.status !== 'uploading') {
        return { success: false, error: '该草稿当前不可发布', errorCode: 'DUPLICATE_DRAFT' };
      }
      if (draft.expiresAt < now) return { success: false, error: '上传草稿已过期' };

      var allowedPrefix = draft.allowedPrefix;
      var uploadItems = draft.uploadItems || [];
      var allowedKeys = uploadItems.map(function (ui) { return ui.cosKey; });
      var submittedKeys = {};

      // Validate each submitted image matches an uploadItem
      for (var i = 0; i < images.length; i++) {
        var img = images[i];
        if (!img.key || allowedKeys.indexOf(img.key) === -1) {
          return { success: false, error: '存在未授权的图片对象' };
        }
        if (submittedKeys[img.key]) {
          return { success: false, error: '图片不能重复提交' };
        }
        submittedKeys[img.key] = true;
        var matchingItem = uploadItems.find(function (ui) { return ui.cosKey === img.key; });
        if (!matchingItem) {
          return { success: false, error: '图片不属于本次上传会话' };
        }

        // headObject - REQUIRED, not optional
        if (!isCosConfigured()) {
          return { success: false, error: 'COS 存储尚未配置' };
        }
        var cos = getCosSdk();
        if (!cos) return { success: false, error: 'COS 服务组件不可用' };

        var headResult;
        try {
          headResult = await new Promise(function (resolve, reject) {
            cos.headObject({
              Bucket: COS_CONFIG.bucket,
              Region: COS_CONFIG.region,
              Key: img.key
            }, function (err, data) { err ? reject(err) : resolve(data); });
          });
        } catch (headErr) {
          console.error('headObject failed for ' + img.key + ':', headErr.message || headErr);
          return { success: false, error: '无法验证已上传图片，请重试' };
        }

        var fileSize = parseInt(headResult.headers && headResult.headers['content-length'] || '0', 10);
        if (!fileSize || fileSize <= 0) {
          return { success: false, error: '图片为空或不存在' };
        }
        if (fileSize > MAX_FILE_SIZE) {
          return { success: false, error: '单张图片不能超过 10MB' };
        }

        var contentType = String(
          headResult.headers && headResult.headers['content-type'] || ''
        ).toLowerCase().split(';')[0].trim();
        if (!contentType || ALLOWED_MIME_TYPES.indexOf(contentType) === -1) {
          return { success: false, error: '图片格式不受支持' };
        }
        if (contentType !== matchingItem.allowedMime) {
          return { success: false, error: '图片格式与上传申请不一致' };
        }

        // Use headObject values (server-authoritative)
        var imgUrl = COS_CONFIG.baseUrl + '/' + img.key;
        validatedImages.push({
          provider: 'cos',
          key: img.key,
          url: imgUrl,
          width: img.width || 0,
          height: img.height || 0,
          size: fileSize,
          mimeType: contentType,
          sort: i
        });
      }

      var postData = {
        draftId: draftId,
        authorId: openid,
        authorName: user.nickname || '旅行者',
        authorAvatar: user.avatar || '',
        content: content,
        images: validatedImages,
        imageCount: validatedImages.length,
        location: hasLocation ? {
          name: location.name, address: location.address || '',
          latitude: location.latitude, longitude: location.longitude
        } : null,
        visibility: 'public',
        likeCount: 0,
        reviewStatus: 'reviewing', // image posts always reviewing until image audit
        imageAuditStatus: 'pending',
        imageAuditTraceIds: [],
        imageAuditRetryCount: 0,
        imageAuditRetryAt: 0,
        imageAuditLastError: '',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        deletedAt: 0
      };

      // Create the post and complete the draft in one database transaction.
      var postId = 'post_' + now.toString(36) + '_' + generateUuid().slice(0, 12);
      var imageAudits;
      try {
        imageAudits = await submitImageAudits(openid, postId, validatedImages);
        postData.imageAuditTraceIds = imageAudits.map(function (audit) {
          return audit.traceId;
        });
      } catch (auditErr) {
        console.error('提交图片安全检测失败:', auditErr);
        return {
          success: false,
          error: '图片安全检测服务暂不可用，请稍后重试',
          errorCode: 'IMAGE_SECURITY_CHECK_FAILED'
        };
      }

      try {
        await db.runTransaction(async function (transaction) {
          var draftDoc = transaction.collection('community_upload_drafts').doc(draftId);
          var latestDraftRes = await draftDoc.get();
          var latestDraft = latestDraftRes.data;
          if (!latestDraft || latestDraft.ownerId !== openid || latestDraft.status !== 'uploading') {
            var duplicateError = new Error('该草稿已经发布或不可用');
            duplicateError.code = 'DUPLICATE_DRAFT';
            throw duplicateError;
          }
          if (latestDraft.expiresAt < Date.now()) {
            throw new Error('上传草稿已过期');
          }

          await transaction.collection('community_posts').doc(postId).set({
            data: postData
          });
          await draftDoc.update({
            data: {
              status: 'completed',
              completedAt: now,
              postId: postId
            }
          });
        });
      } catch (transactionErr) {
        console.error('社区动态事务提交失败:', transactionErr);
        if (transactionErr.code === 'DUPLICATE_DRAFT') {
          return {
            success: false,
            error: transactionErr.message,
            errorCode: 'DUPLICATE_DRAFT'
          };
        }
        return { success: false, error: transactionErr.message || '发布失败，请重试' };
      }

      postData._id = postId;
      postData.isAuthor = true;
      try {
        // Handles the unlikely case where a callback arrived before the post transaction completed.
        await reconcileImageAuditStatus(postId, postData.imageAuditTraceIds);
      } catch (reconcileErr) {
        console.warn('首次汇总图片审核状态失败:', reconcileErr);
      }
      return { success: true, post: postData };
    }

    // Non-image post (text or location only)
    var postData = {
      draftId: '',
      authorId: openid,
      authorName: user.nickname || '旅行者',
      authorAvatar: user.avatar || '',
      content: content,
      images: [],
      imageCount: 0,
      location: hasLocation ? {
        name: location.name, address: location.address || '',
        latitude: location.latitude, longitude: location.longitude
      } : null,
      visibility: 'public',
      likeCount: 0,
      reviewStatus: 'approved', // text-only posts are approved after msgSecCheck
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: 0
    };

    var addRes = await db.collection('community_posts').add({ data: postData });
    postData._id = addRes._id;
    postData.isAuthor = true;
    return { success: true, post: postData };
  } catch (err) {
    console.error('community/create failed:', err);
    return { success: false, error: err.message || '发布动态失败' };
  }
}

// ===================== community/toggleLike =====================

async function communityToggleLike(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    var postId = String(data && data.postId || '').trim();
    if (!postId) return { success: false, error: '动态 ID 不能为空' };

    // Read the current profile before the transaction so a future likes list can
    // render without joining the users collection for every row.
    var user = await getCurrentUser(openid);
    var likeId = getCommunityLikeId(postId, openid);
    var result = await db.runTransaction(async function (transaction) {
      var postDoc = transaction.collection('community_posts').doc(postId);
      var postRes = await postDoc.get();
      var post = postRes && postRes.data;
      if (!post || post.status !== 'active' || post.reviewStatus !== 'approved') {
        throw new Error('动态不存在或暂不可点赞');
      }

      var likeDoc = transaction.collection('community_likes').doc(likeId);
      var like = null;
      try {
        var likeRes = await likeDoc.get();
        like = likeRes && likeRes.data;
      } catch (likeGetErr) {
        if (!isDocumentNotFoundError(likeGetErr)) throw likeGetErr;
      }

      var currentCount = Math.max(0, Number(post.likeCount) || 0);
      var now = Date.now();
      var liked;
      var nextCount;
      if (like) {
        await likeDoc.remove();
        liked = false;
        nextCount = Math.max(0, currentCount - 1);
      } else {
        await likeDoc.set({
          data: {
            postId: postId,
            postAuthorId: post.authorId,
            userId: openid,
            userName: user.nickname || '旅行者',
            userAvatar: user.avatar || '',
            createdAt: now,
            updatedAt: now
          }
        });
        liked = true;
        nextCount = currentCount + 1;
      }

      await postDoc.update({
        data: {
          likeCount: nextCount,
          updatedAt: now
        }
      });
      return { liked: liked, likeCount: nextCount };
    });

    return {
      success: true,
      liked: result.liked,
      likeCount: result.likeCount
    };
  } catch (err) {
    console.error('community/toggleLike failed:', err);
    return { success: false, error: err.message || '点赞失败，请重试' };
  }
}

// ===================== community/delete =====================

async function communityDelete(openid, data) {
  try {
    var postId = data && data.postId;
    if (!postId) return { success: false, error: '动态 ID 不能为空' };

    var postRes;
    try { postRes = await db.collection('community_posts').doc(postId).get(); }
    catch (e) { return { success: false, error: '动态不存在' }; }

    var post = postRes.data;
    if (!post) return { success: false, error: '动态不存在' };
    if (post.authorId !== openid) return { success: false, error: '只能删除自己的动态' };
    if (post.status === 'deleted') return { success: false, error: '动态已经删除' };

    await db.collection('community_posts').doc(postId).update({
      data: { status: 'deleted', deletedAt: Date.now(), updatedAt: Date.now() }
    });

    try {
      await db.collection('community_likes').where({ postId: postId }).remove();
    } catch (likeCleanupErr) {
      // The post is already hidden, so a cleanup failure must not make deletion
      // look unsuccessful. Orphan likes can be removed by a maintenance task.
      console.error('删除社区点赞记录失败:', likeCleanupErr);
    }

    // Delete COS objects immediately. A failed object is queued for retry.
    if (post.images && post.images.length > 0) {
      var cos = getCosSdk();
      for (var i = 0; i < post.images.length; i++) {
        var image = post.images[i] || {};
        if (image.provider !== 'cos' || !image.key) continue;

        var cleanupError = '';
        if (!cos) {
          cleanupError = 'COS 服务组件不可用';
        } else {
          try {
            await new Promise(function (resolve, reject) {
              cos.deleteObject({
                Bucket: COS_CONFIG.bucket,
                Region: COS_CONFIG.region,
                Key: image.key
              }, function (error, result) {
                error ? reject(error) : resolve(result);
              });
            });
          } catch (cosDeleteErr) {
            cleanupError = cosDeleteErr.message || String(cosDeleteErr);
            console.error('删除 COS 图片失败 ' + image.key + ':', cleanupError);
          }
        }

        if (cleanupError) {
          try {
            var cleanupNow = Date.now();
            await db.collection('community_cleanup_tasks').add({
              data: {
                postId: postId,
                provider: 'cos',
                key: image.key,
                status: 'pending',
                retryCount: 0,
                lastError: cleanupError,
                createdAt: cleanupNow,
                updatedAt: cleanupNow
              }
          });
          } catch (taskErr) {
            console.error('记录 COS 清理任务失败:', taskErr);
          }
        }
      }
    }

    return { success: true };
  } catch (err) {
    console.error('community/delete failed:', err);
    return { success: false, error: err.message || '删除动态失败' };
  }
}

module.exports = {
  communityList,
  communityMy,
  communityCreateUploadSession,
  communityCreate,
  communityToggleLike,
  communityDelete
};
