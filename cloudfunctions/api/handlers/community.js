const { db, _, cloud } = require('../utils/shared');
const nodeCrypto = require('crypto');
const { setNotification, removeNotification } = require('./notification');
const { createReadCondition, RUNTIME_DEFAULTS } = require('../utils/dataEnvironment');

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
const MAX_COMMENT_LENGTH = 300;
const MAX_IMAGES = 9;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DRAFT_EXPIRY_HOURS = 24;
const STS_DURATION_SECONDS = 900; // 15 minutes
const IMAGE_AUDIT_RETRY_AFTER_MS = 10 * 60 * 1000;
const IMAGE_AUDIT_MAX_RETRIES = 3;
const COMMUNITY_AUTHOR_FILTER_LIMIT = 100;
const BEIJING_DISTRICTS = [
  '海淀区', '朝阳区', '丰台区', '东城区', '西城区', '石景山区', '门头沟区', '房山区',
  '通州区', '顺义区', '昌平区', '大兴区', '怀柔区', '平谷区', '密云区', '延庆区'
];

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

function getPostThumbnail(post) {
  var images = post && Array.isArray(post.images) ? post.images : [];
  var first = images.length > 0 ? images[0] : null;
  if (typeof first === 'string') return first;
  return first && (first.url || first.tempFileURL || '') || '';
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

async function resolveAvatarUrls(posts, avatarField) {
  avatarField = avatarField || 'authorAvatar';
  var ids = [];
  posts.forEach(function (p) {
    if (p[avatarField] && p[avatarField].startsWith('cloud://')) ids.push(p[avatarField]);
  });
  if (ids.length === 0) return;
  try {
    var urlRes = await cloud.getTempFileURL({ fileList: ids });
    var map = {};
    (urlRes.fileList || []).forEach(function (f) { if (f.tempFileURL) map[f.fileID] = f.tempFileURL; });
    posts.forEach(function (p) {
      if (p[avatarField] && map[p[avatarField]]) p[avatarField] = map[p[avatarField]];
    });
  } catch (e) { /* ignore */ }
}

async function resolveCurrentAuthorProfiles(posts) {
  var authorIds = [];
  (posts || []).forEach(function (post) {
    if (post.authorId && authorIds.indexOf(post.authorId) === -1) authorIds.push(post.authorId);
  });
  if (authorIds.length === 0) return;

  try {
    var usersRes = await db.collection('users').where({
      openid: _.in(authorIds)
    }).get();
    var profileMap = {};
    (usersRes.data || []).forEach(function (user) {
      if (user.openid) profileMap[user.openid] = user;
    });
    posts.forEach(function (post) {
      var profile = profileMap[post.authorId];
      if (!profile) return;
      if (profile.nickname) post.authorName = profile.nickname;
      if (profile.avatar) post.authorAvatar = profile.avatar;
      post.authorRegion = profile.region || post.authorRegion || '';
      post.isOfficial = profile.accountType === 'official' || profile.isOfficial === true;
      post.authorType = post.isOfficial ? 'official' : (post.authorType || 'user');
    });
  } catch (err) {
    console.warn('查询社区作者当前资料失败:', err.message || err);
  }
}

async function getCommunityFeedAuthorIds(openid, feedType, region) {
  var allowedIds = null;
  if (feedType === 'following') {
    if (!openid) throw new Error('请先登录后查看关注动态');
    var followsRes = await db.collection('user_follows')
      .where({ followerId: openid })
      .limit(COMMUNITY_AUTHOR_FILTER_LIMIT)
      .get();
    allowedIds = (followsRes.data || []).map(function (follow) {
      return follow.followingId;
    }).filter(Boolean);
  }

  if (region) {
    var usersRes = await db.collection('users')
      .where({ region: region })
      .limit(COMMUNITY_AUTHOR_FILTER_LIMIT)
      .get();
    var regionIds = (usersRes.data || []).map(function (user) {
      return user.openid;
    }).filter(Boolean);
    if (allowedIds === null) {
      allowedIds = regionIds;
    } else {
      var regionMap = {};
      regionIds.forEach(function (id) { regionMap[id] = true; });
      allowedIds = allowedIds.filter(function (id) { return regionMap[id]; });
    }
  }

  return allowedIds;
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
    var hasRisky = suggestions.some(function (suggest) { return suggest === 'risky'; });
    var completed = suggestions.length === traceIds.length && suggestions.every(function (suggest) {
      return ['pass', 'review', 'risky'].indexOf(suggest) !== -1;
    });
    var hasReview = suggestions.some(function (suggest) { return suggest === 'review'; });
    var reviewStatus = hasRisky
      ? 'manual_review'
      : completed
        ? 'approved'
        : 'reviewing';
    var machineSuggest = hasRisky
      ? 'risky'
      : completed
        ? (hasReview ? 'review' : 'pass')
        : 'pending';

    var previousAdminReviewStatus = postRes.data.adminReviewStatus || 'not_required';
    var hasAdminDecision = previousAdminReviewStatus === 'approved' ||
      previousAdminReviewStatus === 'rejected';
    var adminReviewStatus = hasAdminDecision
      ? previousAdminReviewStatus
      : (machineSuggest === 'review' || machineSuggest === 'risky' ? 'pending' : 'not_required');
    if (hasAdminDecision) {
      reviewStatus = previousAdminReviewStatus === 'approved' ? 'approved' : 'rejected';
    }

    await postDoc.update({
      data: {
        reviewStatus: reviewStatus,
        machineSuggest: machineSuggest,
        adminReviewStatus: adminReviewStatus,
        imageAuditStatus: reviewStatus,
        imageAuditUpdatedAt: Date.now(),
        updatedAt: Date.now()
      }
    });
    return reviewStatus;
  });
}

// ===================== community/list =====================

async function communityList(openid, data, dataEnvironment = RUNTIME_DEFAULTS.develop) {
  var requestedPageSize = Number(data && data.pageSize) || 10;
  var pageSize = Math.max(1, Math.min(requestedPageSize, 20));
  var cursor = Number(data && data.cursor) || 0;
  var cursorId = String(data && data.cursorId || '');
  var feedType = String(data && data.feedType || 'all').trim();
  var region = String(data && data.region || '').trim();

  if (feedType !== 'all' && feedType !== 'following') {
    return { success: false, error: '社区频道参数不正确' };
  }
  if (region && BEIJING_DISTRICTS.indexOf(region) === -1) {
    return { success: false, error: '地区筛选参数不正确' };
  }

  // The community feed only shows content that has fully passed moderation.
  // Reviewing/rejected posts stay hidden from everyone, including the author.
  var listCondition = { status: 'active' };
  var authorId = String(data && data.authorId || '').trim();
  if (authorId) {
    listCondition.authorId = authorId;
  } else {
    listCondition.reviewStatus = 'approved';
    try {
      var feedAuthorIds = await getCommunityFeedAuthorIds(openid, feedType, region);
      if (feedAuthorIds && feedAuthorIds.length === 0) {
        return { success: true, posts: [], nextCursor: 0, nextCursorId: '', hasMore: false };
      }
      if (feedAuthorIds) listCondition.authorId = _.in(feedAuthorIds);
    } catch (filterErr) {
      return { success: false, error: filterErr.message || '社区筛选失败' };
    }
  }

  listCondition = _.and([
    listCondition,
    createReadCondition(_, dataEnvironment.readEnvs)
  ]);

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
    // Author profiles reuse the existing authorId + status + createdAt + _id
    // index. Fetch a wider private batch, then filter before returning so
    // reviewing/rejected posts never leak through a public profile.
    var queryLimit = authorId ? 100 : pageSize + 1;
    var postsRes = await db.collection('community_posts')
      .where(listCondition)
      .orderBy('createdAt', 'desc')
      .orderBy('_id', 'desc')
      .limit(queryLimit)
      .get();
    var posts = postsRes.data || [];
    if (authorId) {
      posts = posts.filter(function (post) {
        return post.reviewStatus === 'approved';
      }).slice(0, pageSize);
    } else if (posts.length > pageSize) {
      posts = posts.slice(0, pageSize);
    }

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

    await resolveCurrentAuthorProfiles(posts);
    await resolveAvatarUrls(posts);

    var hasMore = authorId ? posts.length >= pageSize : (postsRes.data || []).length > pageSize;
    var last = posts.length > 0 ? posts[posts.length - 1] : null;
    var nextCursor = hasMore && last ? last.createdAt : 0;
    var nextCursorId = hasMore && last ? last._id : '';

    return { success: true, posts: posts, nextCursor: nextCursor, nextCursorId: nextCursorId, hasMore: hasMore };
  } catch (err) {
    console.error('community/list failed:', err);
    return { success: false, error: '获取社区动态失败' };
  }
}

// ===================== community/get =====================

async function communityGet(openid, data) {
  var postId = String(data && data.postId || '').trim();
  if (!postId) return { success: false, error: '动态 ID 不能为空', errorCode: 'INVALID_POST_ID' };

  try {
    var postRes = await db.collection('community_posts').doc(postId).get();
    var post = postRes && postRes.data;
    if (!post || post.status !== 'active') {
      return { success: false, error: '该内容已删除或不存在', errorCode: 'POST_UNAVAILABLE' };
    }

    var isAuthor = !!(openid && post.authorId === openid);
    if (post.reviewStatus !== 'approved' && !isAuthor) {
      return { success: false, error: '该内容暂时无法查看', errorCode: 'POST_UNAVAILABLE' };
    }

    post.isAuthor = isAuthor;
    post.likeCount = Math.max(0, Number(post.likeCount) || 0);
    post.commentCount = Math.max(0, Number(post.commentCount) || 0);
    post.isLiked = false;

    if (openid) {
      try {
        var likeRes = await db.collection('community_likes')
          .doc(getCommunityLikeId(postId, openid))
          .get();
        post.isLiked = !!(likeRes && likeRes.data);
      } catch (likeErr) {
        if (!isDocumentNotFoundError(likeErr)) {
          console.warn('查询动态详情点赞状态失败:', likeErr.message || likeErr);
        }
      }
    }

    await resolveCurrentAuthorProfiles([post]);
    await resolveAvatarUrls([post]);
    return { success: true, post: post };
  } catch (err) {
    if (isDocumentNotFoundError(err)) {
      return { success: false, error: '该内容已删除或不存在', errorCode: 'POST_UNAVAILABLE' };
    }
    console.error('community/get failed:', err);
    return { success: false, error: '动态加载失败，请重试', errorCode: 'POST_LOAD_FAILED' };
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

async function communityCreate(openid, data, dataEnvironment = RUNTIME_DEFAULTS.develop) {
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
        commentCount: 0,
        reviewStatus: 'reviewing', // image posts always reviewing until image audit
        machineSuggest: 'pending', // pass/review/risky；保留微信原始聚合结论供后台筛选
        adminReviewStatus: 'not_required', // pending/approved/rejected；仅 review/risky 进入人工复核
        imageAuditStatus: 'pending',
        imageAuditTraceIds: [],
        imageAuditRetryCount: 0,
        imageAuditRetryAt: 0,
        imageAuditLastError: '',
        status: 'active',
        dataEnv: dataEnvironment.writeEnv,
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
      commentCount: 0,
      reviewStatus: 'approved', // text-only posts are approved after msgSecCheck
      machineSuggest: 'pass',
      adminReviewStatus: 'not_required',
      status: 'active',
      dataEnv: dataEnvironment.writeEnv,
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
        if (post.authorId !== openid) {
          await removeNotification(
            transaction,
            'community_like',
            post.authorId,
            likeId
          );
        }
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
        if (post.authorId !== openid) {
          await setNotification(transaction, {
            receiverId: post.authorId,
            category: 'interaction',
            type: 'community_like',
            actorId: openid,
            actorName: user.nickname || '旅行者',
            actorAvatar: user.avatar || '',
            targetType: 'community_post',
            targetId: postId,
            sourceType: 'like',
            sourceId: likeId,
            title: '点赞通知',
            actionText: '赞了你的动态',
            content: post.content || '',
            thumbnail: getPostThumbnail(post),
            createdAt: now
          });
        }
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

// ===================== community/likeList =====================

async function communityLikeList(openid, data) {
  try {
    var postId = String(data && data.postId || '').trim();
    if (!postId) return { success: false, error: '动态 ID 不能为空' };

    var requestedPageSize = Number(data && data.pageSize) || 20;
    var pageSize = Math.max(1, Math.min(requestedPageSize, 50));
    var cursor = Number(data && data.cursor) || 0;
    var cursorId = String(data && data.cursorId || '');

    var postRes;
    try { postRes = await db.collection('community_posts').doc(postId).get(); }
    catch (postGetErr) { return { success: false, error: '动态不存在' }; }
    var post = postRes && postRes.data;
    if (!post || post.status !== 'active' || post.reviewStatus !== 'approved') {
      return { success: false, error: '动态不存在或暂不可查看点赞' };
    }

    var condition = { postId: postId };
    if (cursor > 0) {
      var cursorCondition = cursorId
        ? _.or([
          { createdAt: _.lt(cursor) },
          { createdAt: _.eq(cursor), _id: _.lt(cursorId) }
        ])
        : { createdAt: _.lt(cursor) };
      condition = _.and([condition, cursorCondition]);
    }

    var likesRes = await db.collection('community_likes')
      .where(condition)
      .orderBy('createdAt', 'desc')
      .orderBy('_id', 'desc')
      .limit(pageSize + 1)
      .get();
    var likes = likesRes.data || [];
    var hasMore = likes.length > pageSize;
    if (hasMore) likes = likes.slice(0, pageSize);
    await resolveAvatarUrls(likes, 'userAvatar');

    var last = likes.length > 0 ? likes[likes.length - 1] : null;
    return {
      success: true,
      likes: likes.map(function (like) {
        return {
          _id: like._id,
          userId: like.userId,
          userName: like.userName || '旅行者',
          userAvatar: like.userAvatar || '',
          createdAt: like.createdAt
        };
      }),
      hasMore: hasMore,
      nextCursor: last ? last.createdAt : 0,
      nextCursorId: last ? last._id : '',
      likeCount: Math.max(0, Number(post.likeCount) || 0)
    };
  } catch (err) {
    console.error('community/likeList failed:', err);
    return { success: false, error: err.message || '点赞列表加载失败，请重试' };
  }
}

// ===================== community/interactions =====================

function withInteractionCursor(condition, cursor, cursorId) {
  if (cursor <= 0) return condition;
  var cursorCondition = cursorId
    ? _.or([
      { createdAt: _.lt(cursor) },
      { createdAt: _.eq(cursor), _id: _.lt(cursorId) }
    ])
    : { createdAt: _.lt(cursor) };
  return _.and([condition, cursorCondition]);
}

async function hydrateInteractionPosts(openid, interactionItems) {
  var postIds = [];
  interactionItems.forEach(function (item) {
    if (item.postId && postIds.indexOf(item.postId) === -1) postIds.push(item.postId);
  });

  var postPairs = await Promise.all(postIds.map(async function (postId) {
    try {
      var postRes = await db.collection('community_posts').doc(postId).get();
      var post = postRes && postRes.data;
      if (!post || post.status !== 'active' || post.reviewStatus !== 'approved') {
        return [postId, null];
      }
      return [postId, post];
    } catch (err) {
      return [postId, null];
    }
  }));

  var posts = postPairs.map(function (pair) { return pair[1]; }).filter(Boolean);
  var likedPostIds = {};
  if (posts.length > 0) {
    try {
      var likesRes = await db.collection('community_likes').where({
        userId: openid,
        postId: _.in(posts.map(function (post) { return post._id; }))
      }).get();
      (likesRes.data || []).forEach(function (like) {
        likedPostIds[like.postId] = true;
      });
    } catch (likeErr) {
      console.warn('查询我的互动点赞状态失败:', likeErr.message || likeErr);
    }
  }

  posts.forEach(function (post) {
    post.isAuthor = post.authorId === openid;
    post.isLiked = !!likedPostIds[post._id];
    post.likeCount = Math.max(0, Number(post.likeCount) || 0);
    post.commentCount = Math.max(0, Number(post.commentCount) || 0);
  });
  await resolveAvatarUrls(posts);

  var postMap = {};
  posts.forEach(function (post) { postMap[post._id] = post; });
  return interactionItems.map(function (item) {
    var post = postMap[item.postId];
    if (!post) return null;
    return Object.assign({}, item, { post: post });
  }).filter(Boolean);
}

async function communityInteractions(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    var type = String(data && data.type || 'liked').trim();
    if (['liked', 'commented'].indexOf(type) === -1) {
      return { success: false, error: '互动类型无效' };
    }

    var requestedPageSize = Number(data && data.pageSize) || 10;
    var pageSize = Math.max(1, Math.min(requestedPageSize, 20));
    var cursor = Number(data && data.cursor) || 0;
    var cursorId = String(data && data.cursorId || '');
    var rawItems = [];

    if (type === 'liked') {
      var likesCondition = withInteractionCursor({ userId: openid }, cursor, cursorId);
      var likesRes = await db.collection('community_likes')
        .where(likesCondition)
        .orderBy('createdAt', 'desc')
        .orderBy('_id', 'desc')
        .limit(pageSize + 1)
        .get();
      rawItems = (likesRes.data || []).map(function (like) {
        return {
          _id: like._id,
          postId: like.postId,
          interactionType: 'like',
          interactionContent: '',
          interactionCreatedAt: Number(like.createdAt) || 0,
          createdAt: Number(like.createdAt) || 0
        };
      });
    } else {
      var commentCondition = withInteractionCursor({
        authorId: openid,
        status: 'active'
      }, cursor, cursorId);
      var replyCondition = withInteractionCursor({
        authorId: openid,
        status: 'active'
      }, cursor, cursorId);
      var commentResults = await Promise.all([
        db.collection('community_comments')
          .where(commentCondition)
          .orderBy('createdAt', 'desc')
          .orderBy('_id', 'desc')
          .limit(pageSize + 1)
          .get(),
        db.collection('community_comment_replies')
          .where(replyCondition)
          .orderBy('createdAt', 'desc')
          .orderBy('_id', 'desc')
          .limit(pageSize + 1)
          .get()
      ]);

      (commentResults[0].data || []).forEach(function (comment) {
        rawItems.push({
          _id: 'comment_' + comment._id,
          sourceId: comment._id,
          sourceType: 'comment',
          postId: comment.postId,
          interactionType: 'comment',
          interactionContent: comment.content || '',
          interactionCreatedAt: Number(comment.createdAt) || 0,
          createdAt: Number(comment.createdAt) || 0
        });
      });
      (commentResults[1].data || []).forEach(function (reply) {
        rawItems.push({
          _id: 'reply_' + reply._id,
          sourceId: reply._id,
          sourceType: 'reply',
          postId: reply.postId,
          interactionType: 'comment',
          interactionContent: reply.content || '',
          interactionCreatedAt: Number(reply.createdAt) || 0,
          createdAt: Number(reply.createdAt) || 0
        });
      });
      rawItems.sort(function (a, b) {
        if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
        return String(b._id).localeCompare(String(a._id));
      });
    }

    var hasMore = rawItems.length > pageSize;
    if (hasMore) rawItems = rawItems.slice(0, pageSize);
    var last = rawItems.length > 0 ? rawItems[rawItems.length - 1] : null;
    var interactions = await hydrateInteractionPosts(openid, rawItems);

    return {
      success: true,
      type: type,
      interactions: interactions,
      hasMore: hasMore,
      nextCursor: last ? last.createdAt : 0,
      nextCursorId: last ? (last.sourceId || last._id) : ''
    };
  } catch (err) {
    console.error('community/interactions failed:', err);
    return { success: false, error: err.message || '我的互动加载失败，请重试' };
  }
}

// ===================== community/notifications =====================

async function communityNotifications(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    var requestedPageSize = Number(data && data.pageSize) || 50;
    var pageSize = Math.max(1, Math.min(requestedPageSize, 100));
    var user = await getCurrentUser(openid);
    var readAt = Math.max(0, Number(user.communityMessageReadAt) || 0);

    var results = await Promise.all([
      db.collection('community_likes')
        .where({ postAuthorId: openid })
        .limit(100)
        .get(),
      db.collection('community_comments')
        .where({ postAuthorId: openid })
        .limit(100)
        .get(),
      db.collection('community_comment_replies')
        .where({ replyToUserId: openid })
        .limit(100)
        .get(),
      db.collection('user_follows')
        .where({ followingId: openid })
        .limit(100)
        .get()
        .catch(function (err) {
          console.warn('user_follows collection unavailable, skip follow notifications:', err);
          return { data: [] };
        })
    ]);

    var rawItems = [];
    (results[0].data || []).forEach(function (like) {
      if (like.userId === openid) return;
      rawItems.push({
        _id: 'like_' + like._id,
        sourceId: like._id,
        kind: 'like',
        postId: like.postId,
        actorId: like.userId,
        actorName: like.userName || '旅行者',
        actorAvatar: like.userAvatar || '',
        content: '',
        createdAt: Number(like.createdAt) || 0
      });
    });
    (results[1].data || []).forEach(function (comment) {
      if (comment.authorId === openid || comment.status !== 'active') return;
      rawItems.push({
        _id: 'comment_' + comment._id,
        sourceId: comment._id,
        kind: 'comment',
        postId: comment.postId,
        actorId: comment.authorId,
        actorName: comment.authorName || '旅行者',
        actorAvatar: comment.authorAvatar || '',
        content: comment.content || '',
        createdAt: Number(comment.createdAt) || 0
      });
    });
    (results[2].data || []).forEach(function (reply) {
      if (reply.authorId === openid || reply.status !== 'active') return;
      rawItems.push({
        _id: 'reply_' + reply._id,
        sourceId: reply._id,
        kind: 'reply',
        postId: reply.postId,
        actorId: reply.authorId,
        actorName: reply.authorName || '旅行者',
        actorAvatar: reply.authorAvatar || '',
        content: reply.content || '',
        createdAt: Number(reply.createdAt) || 0
      });
    });
    (results[3].data || []).forEach(function (follow) {
      if (follow.followerId === openid) return;
      rawItems.push({
        _id: 'follow_' + follow._id,
        sourceId: follow._id,
        kind: 'follow',
        postId: '',
        actorId: follow.followerId,
        actorName: follow.followerName || '旅行者',
        actorAvatar: follow.followerAvatar || '',
        content: '',
        createdAt: Number(follow.createdAt) || 0
      });
    });

    rawItems.sort(function (a, b) {
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return String(b._id).localeCompare(String(a._id));
    });
    rawItems = rawItems.slice(0, pageSize);

    var postIds = [];
    rawItems.forEach(function (item) {
      if (item.postId && postIds.indexOf(item.postId) === -1) postIds.push(item.postId);
    });
    var postPairs = await Promise.all(postIds.map(async function (postId) {
      try {
        var postRes = await db.collection('community_posts').doc(postId).get();
        return [postId, postRes && postRes.data || null];
      } catch (err) {
        return [postId, null];
      }
    }));
    var postMap = {};
    postPairs.forEach(function (pair) { postMap[pair[0]] = pair[1]; });

    var notifications = rawItems.map(function (item) {
      var post = postMap[item.postId] || {};
      var firstImage = Array.isArray(post.images) && post.images.length > 0
        ? post.images[0]
        : null;
      return Object.assign({}, item, {
        unread: item.createdAt > readAt,
        postContent: post.content || '',
        postThumbnail: firstImage && (firstImage.url || firstImage.tempFileURL || '') || ''
      });
    });
    await resolveAvatarUrls(notifications, 'actorAvatar');

    return {
      success: true,
      notifications: notifications,
      unreadCount: notifications.filter(function (item) { return item.unread; }).length,
      readAt: readAt
    };
  } catch (err) {
    console.error('community/notifications failed:', err);
    return { success: false, error: err.message || '互动消息加载失败，请重试' };
  }
}

async function communityNotificationsMarkRead(openid) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    var user = await getCurrentUser(openid);
    await db.collection('users').doc(user._id).update({
      data: {
        communityMessageReadAt: Date.now(),
        updatedAt: Date.now()
      }
    });
    return { success: true };
  } catch (err) {
    console.error('community/notificationsMarkRead failed:', err);
    return { success: false, error: err.message || '标记已读失败，请重试' };
  }
}

// ===================== community/commentList =====================

async function queryCommunityReplies(postId, rootCommentId, data) {
  var requestedPageSize = Number(data && data.pageSize) || 20;
  var pageSize = Math.max(1, Math.min(requestedPageSize, 50));
  var cursor = Number(data && data.cursor) || 0;
  var cursorId = String(data && data.cursorId || '');
  var condition = {
    postId: postId,
    rootCommentId: rootCommentId,
    status: 'active'
  };
  if (cursor > 0) {
    var cursorCondition = cursorId
      ? _.or([
        { createdAt: _.gt(cursor) },
        { createdAt: _.eq(cursor), _id: _.gt(cursorId) }
      ])
      : { createdAt: _.gt(cursor) };
    condition = _.and([condition, cursorCondition]);
  }

  var repliesRes = await db.collection('community_comment_replies')
    .where(condition)
    .orderBy('createdAt', 'asc')
    .orderBy('_id', 'asc')
    .limit(pageSize + 1)
    .get();
  var replies = repliesRes.data || [];
  var hasMore = replies.length > pageSize;
  if (hasMore) replies = replies.slice(0, pageSize);
  await resolveAvatarUrls(replies);
  var last = replies.length > 0 ? replies[replies.length - 1] : null;
  return {
    replies: replies,
    hasMore: hasMore,
    nextCursor: last ? last.createdAt : 0,
    nextCursorId: last ? last._id : ''
  };
}

async function communityCommentList(openid, data) {
  try {
    var postId = String(data && data.postId || '').trim();
    if (!postId) return { success: false, error: '动态 ID 不能为空' };

    var requestedPageSize = Number(data && data.pageSize) || 20;
    var pageSize = Math.max(1, Math.min(requestedPageSize, 50));
    var cursor = Number(data && data.cursor) || 0;
    var cursorId = String(data && data.cursorId || '');

    var postRes;
    try { postRes = await db.collection('community_posts').doc(postId).get(); }
    catch (postGetErr) { return { success: false, error: '动态不存在' }; }
    var post = postRes && postRes.data;
    if (!post || post.status !== 'active' || post.reviewStatus !== 'approved') {
      return { success: false, error: '动态不存在或暂不可评论' };
    }

    var condition = {
      postId: postId,
      status: 'active'
    };
    if (cursor > 0) {
      var cursorCondition = cursorId
        ? _.or([
          { createdAt: _.lt(cursor) },
          { createdAt: _.eq(cursor), _id: _.lt(cursorId) }
        ])
        : { createdAt: _.lt(cursor) };
      condition = _.and([condition, cursorCondition]);
    }

    var commentsRes = await db.collection('community_comments')
      .where(condition)
      .orderBy('createdAt', 'desc')
      .orderBy('_id', 'desc')
      .limit(pageSize + 1)
      .get();
    var comments = commentsRes.data || [];
    var hasMore = comments.length > pageSize;
    if (hasMore) comments = comments.slice(0, pageSize);
    await resolveAvatarUrls(comments);
    await Promise.all(comments.map(async function (comment) {
      comment.replyCount = Math.max(0, Number(comment.replyCount) || 0);
      comment.replies = [];
      comment.repliesHasMore = false;
      comment.nextReplyCursor = 0;
      comment.nextReplyCursorId = '';
      if (comment.replyCount === 0) return;
      try {
        var preview = await queryCommunityReplies(postId, comment._id, { pageSize: 3 });
        comment.replies = preview.replies;
        comment.repliesHasMore = preview.hasMore;
        comment.nextReplyCursor = preview.nextCursor;
        comment.nextReplyCursorId = preview.nextCursorId;
      } catch (replyPreviewErr) {
        // Keep the root comment list available if reply preview loading fails.
        comment.repliesHasMore = true;
        console.warn('加载回复预览失败:', replyPreviewErr.message || replyPreviewErr);
      }
    }));

    var last = comments.length > 0 ? comments[comments.length - 1] : null;
    return {
      success: true,
      comments: comments,
      hasMore: hasMore,
      nextCursor: last ? last.createdAt : 0,
      nextCursorId: last ? last._id : '',
      commentCount: Math.max(0, Number(post.commentCount) || 0)
    };
  } catch (err) {
    console.error('community/commentList failed:', err);
    return { success: false, error: err.message || '评论加载失败，请重试' };
  }
}

// ===================== community/replyList =====================

async function communityReplyList(openid, data) {
  try {
    var postId = String(data && data.postId || '').trim();
    var rootCommentId = String(data && data.rootCommentId || '').trim();
    if (!postId || !rootCommentId) {
      return { success: false, error: '回复信息不完整' };
    }

    var postRes;
    var rootRes;
    try {
      postRes = await db.collection('community_posts').doc(postId).get();
      rootRes = await db.collection('community_comments').doc(rootCommentId).get();
    } catch (getErr) {
      return { success: false, error: '评论不存在或已删除' };
    }
    var post = postRes && postRes.data;
    var root = rootRes && rootRes.data;
    if (!post || post.status !== 'active' || post.reviewStatus !== 'approved' ||
      !root || root.postId !== postId || root.status !== 'active') {
      return { success: false, error: '评论不存在或已删除' };
    }

    var page = await queryCommunityReplies(postId, rootCommentId, data);
    return {
      success: true,
      replies: page.replies,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      nextCursorId: page.nextCursorId,
      replyCount: Math.max(0, Number(root.replyCount) || 0)
    };
  } catch (err) {
    console.error('community/replyList failed:', err);
    return { success: false, error: err.message || '回复加载失败，请重试' };
  }
}

// ===================== community/commentCreate =====================

async function communityCommentCreate(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    var postId = String(data && data.postId || '').trim();
    var content = String(data && data.content || '').trim();
    var replyToId = String(data && data.replyToId || '').trim();
    var replyToType = String(data && data.replyToType || '').trim();
    var isReply = !!replyToId;
    if (!postId) return { success: false, error: '动态 ID 不能为空' };
    if (!content) return { success: false, error: '评论内容不能为空' };
    if (content.length > MAX_COMMENT_LENGTH) {
      return { success: false, error: '评论不能超过 300 字' };
    }
    if (isReply && ['comment', 'reply'].indexOf(replyToType) === -1) {
      return { success: false, error: '回复目标无效' };
    }

    var existingPostRes;
    try { existingPostRes = await db.collection('community_posts').doc(postId).get(); }
    catch (postGetErr) { return { success: false, error: '动态不存在' }; }
    var existingPost = existingPostRes && existingPostRes.data;
    if (!existingPost || existingPost.status !== 'active' ||
      existingPost.reviewStatus !== 'approved') {
      return { success: false, error: '动态不存在或暂不可评论' };
    }

    var secResult = await securityCheck(openid, content);
    if (!secResult.ok) {
      if (secResult.label === 'security_api_unavailable') {
        return { success: false, error: '内容安全检测服务暂不可用，请稍后重试' };
      }
      return { success: false, error: '评论未通过安全检测，请修改后重试' };
    }

    var user = await getCurrentUser(openid);
    var now = Date.now();
    var commentData = {
      postId: postId,
      postAuthorId: existingPost.authorId,
      authorId: openid,
      authorName: user.nickname || '旅行者',
      authorAvatar: user.avatar || '',
      content: content,
      likeCount: 0,
      replyCount: 0,
      isReply: false,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: 0
    };

    var result = await db.runTransaction(async function (transaction) {
      var postDoc = transaction.collection('community_posts').doc(postId);
      var postRes = await postDoc.get();
      var post = postRes && postRes.data;
      if (!post || post.status !== 'active' || post.reviewStatus !== 'approved') {
        throw new Error('动态不存在或暂不可评论');
      }

      var addRes;
      var createdData = commentData;
      var rootCommentId = '';
      var rootReplyCount = 0;

      if (isReply) {
        var targetCollection = replyToType === 'reply'
          ? 'community_comment_replies'
          : 'community_comments';
        var targetDoc = transaction.collection(targetCollection).doc(replyToId);
        var targetRes = null;
        try { targetRes = await targetDoc.get(); }
        catch (targetGetErr) {
          if (!isDocumentNotFoundError(targetGetErr)) throw targetGetErr;
        }
        var target = targetRes && targetRes.data;
        if (!target || target.postId !== postId || target.status !== 'active') {
          throw new Error('回复目标不存在或已删除');
        }

        rootCommentId = replyToType === 'reply' ? target.rootCommentId : target._id;
        var rootDoc = transaction.collection('community_comments').doc(rootCommentId);
        var root;
        if (replyToType === 'comment') {
          root = target;
        } else {
          var rootRes = null;
          try { rootRes = await rootDoc.get(); }
          catch (rootGetErr) {
            if (!isDocumentNotFoundError(rootGetErr)) throw rootGetErr;
          }
          root = rootRes && rootRes.data;
        }
        if (!root || root.postId !== postId || root.status !== 'active') {
          throw new Error('主评论不存在或已删除');
        }

        createdData = {
          postId: postId,
          postAuthorId: post.authorId,
          rootCommentId: rootCommentId,
          parentReplyId: replyToType === 'reply' ? target._id : '',
          replyToId: target._id,
          replyToType: replyToType,
          replyToUserId: target.authorId,
          replyToUserName: target.authorName || '旅行者',
          authorId: openid,
          authorName: user.nickname || '旅行者',
          authorAvatar: user.avatar || '',
          content: content,
          likeCount: 0,
          isReply: true,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          deletedAt: 0
        };
        addRes = await transaction.collection('community_comment_replies').add({
          data: createdData
        });
        rootReplyCount = Math.max(0, Number(root.replyCount) || 0) + 1;
        await rootDoc.update({
          data: {
            replyCount: rootReplyCount,
            updatedAt: now
          }
        });
      } else {
        addRes = await transaction.collection('community_comments').add({
          data: createdData
        });
      }

      var notificationReceiverId = isReply
        ? createdData.replyToUserId
        : post.authorId;
      if (notificationReceiverId && notificationReceiverId !== openid) {
        await setNotification(transaction, {
          receiverId: notificationReceiverId,
          category: 'interaction',
          type: isReply ? 'community_reply' : 'community_comment',
          actorId: openid,
          actorName: user.nickname || '旅行者',
          actorAvatar: user.avatar || '',
          targetType: 'community_post',
          targetId: postId,
          sourceType: isReply ? 'reply' : 'comment',
          sourceId: addRes._id,
          title: isReply ? '回复通知' : '评论通知',
          actionText: isReply ? '回复了你' : '评论了你',
          content: content,
          thumbnail: getPostThumbnail(post),
          createdAt: now
        });
      }

      var nextCount = Math.max(0, Number(post.commentCount) || 0) + 1;
      await postDoc.update({
        data: {
          commentCount: nextCount,
          updatedAt: now
        }
      });
      return {
        commentId: addRes._id,
        commentCount: nextCount,
        rootCommentId: rootCommentId,
        rootReplyCount: rootReplyCount,
        createdData: createdData
      };
    });

    var responseComment = result.createdData;
    responseComment._id = result.commentId;
    return {
      success: true,
      comment: responseComment,
      isReply: isReply,
      rootCommentId: result.rootCommentId,
      rootReplyCount: result.rootReplyCount,
      commentCount: result.commentCount
    };
  } catch (err) {
    console.error('community/commentCreate failed:', err);
    return { success: false, error: err.message || '评论失败，请重试' };
  }
}

// ===================== community/commentDelete =====================

async function communityCommentDelete(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    var postId = String(data && data.postId || '').trim();
    var commentId = String(data && data.commentId || '').trim();
    var targetType = String(data && data.targetType || 'comment').trim();
    if (!postId || !commentId) {
      return { success: false, error: '评论信息不完整' };
    }
    if (['comment', 'reply'].indexOf(targetType) === -1) {
      return { success: false, error: '评论类型无效' };
    }

    var result = await db.runTransaction(async function (transaction) {
      var postDoc = transaction.collection('community_posts').doc(postId);
      var postRes = null;
      try { postRes = await postDoc.get(); }
      catch (postGetErr) {
        if (!isDocumentNotFoundError(postGetErr)) throw postGetErr;
      }
      var post = postRes && postRes.data;
      if (!post || post.status !== 'active') throw new Error('动态不存在');

      var now = Date.now();
      var nextCount = Math.max(0, Number(post.commentCount) || 0);
      var rootCommentId = '';
      var rootReplyCount = 0;
      var removedCount = 1;

      if (targetType === 'reply') {
        var replyDoc = transaction.collection('community_comment_replies').doc(commentId);
        var replyRes = null;
        try { replyRes = await replyDoc.get(); }
        catch (replyGetErr) {
          if (!isDocumentNotFoundError(replyGetErr)) throw replyGetErr;
        }
        var reply = replyRes && replyRes.data;
        if (!reply || reply.postId !== postId || reply.status !== 'active') {
          throw new Error('回复不存在或已删除');
        }
        if (reply.authorId !== openid && post.authorId !== openid) {
          throw new Error('无权删除这条回复');
        }

        rootCommentId = reply.rootCommentId;
        var rootDoc = transaction.collection('community_comments').doc(rootCommentId);
        var rootRes = null;
        try { rootRes = await rootDoc.get(); }
        catch (rootGetErr) {
          if (!isDocumentNotFoundError(rootGetErr)) throw rootGetErr;
        }
        var root = rootRes && rootRes.data;
        if (!root || root.postId !== postId || root.status !== 'active') {
          throw new Error('主评论不存在或已删除');
        }
        rootReplyCount = Math.max(0, Number(root.replyCount) || 0);
        rootReplyCount = Math.max(0, rootReplyCount - 1);

        await replyDoc.update({
          data: {
            status: 'deleted',
            deletedAt: now,
            updatedAt: now
          }
        });
        await rootDoc.update({
          data: {
            replyCount: rootReplyCount,
            updatedAt: now
          }
        });
      } else {
        var commentDoc = transaction.collection('community_comments').doc(commentId);
        var commentRes = null;
        try { commentRes = await commentDoc.get(); }
        catch (commentGetErr) {
          if (!isDocumentNotFoundError(commentGetErr)) throw commentGetErr;
        }
        var comment = commentRes && commentRes.data;
        if (!comment || comment.postId !== postId || comment.status !== 'active') {
          throw new Error('评论不存在或已删除');
        }
        if (comment.authorId !== openid && post.authorId !== openid) {
          throw new Error('无权删除这条评论');
        }

        rootCommentId = comment._id;
        rootReplyCount = Math.max(0, Number(comment.replyCount) || 0);
        removedCount += rootReplyCount;
        await commentDoc.update({
          data: {
            status: 'deleted',
            replyCount: 0,
            deletedAt: now,
            updatedAt: now
          }
        });
      }

      nextCount = Math.max(0, nextCount - removedCount);
      await postDoc.update({
        data: {
          commentCount: nextCount,
          updatedAt: now
        }
      });
      return {
        commentCount: nextCount,
        rootCommentId: rootCommentId,
        rootReplyCount: rootReplyCount,
        removedCount: removedCount
      };
    });

    if (targetType === 'comment' && result.rootReplyCount > 0) {
      try {
        var cascadeNow = Date.now();
        await db.collection('community_comment_replies').where({
          postId: postId,
          rootCommentId: result.rootCommentId,
          status: 'active'
        }).update({
          data: {
            status: 'deleted',
            deletedAt: cascadeNow,
            updatedAt: cascadeNow
          }
        });
      } catch (cascadeErr) {
        // The root is already hidden, so active orphan rows are not visible.
        console.error('级联删除评论回复失败:', cascadeErr);
      }
    }

    return {
      success: true,
      commentId: commentId,
      targetType: targetType,
      rootCommentId: result.rootCommentId,
      rootReplyCount: result.rootReplyCount,
      removedCount: result.removedCount,
      commentCount: result.commentCount
    };
  } catch (err) {
    console.error('community/commentDelete failed:', err);
    return { success: false, error: err.message || '删除评论失败，请重试' };
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
    try {
      await db.collection('community_comments').where({ postId: postId }).remove();
    } catch (commentCleanupErr) {
      console.error('删除社区评论记录失败:', commentCleanupErr);
    }
    try {
      await db.collection('community_comment_replies').where({ postId: postId }).remove();
    } catch (replyCleanupErr) {
      console.error('删除社区回复记录失败:', replyCleanupErr);
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
  communityGet,
  communityMy,
  communityCreateUploadSession,
  communityCreate,
  communityToggleLike,
  communityLikeList,
  communityInteractions,
  communityNotifications,
  communityNotificationsMarkRead,
  communityCommentList,
  communityReplyList,
  communityCommentCreate,
  communityCommentDelete,
  communityDelete
};
