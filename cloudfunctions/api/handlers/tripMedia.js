const { db } = require('../utils/shared');
const { getPastTripWriteError } = require('../utils/tripListVisibility');

const COS_CONFIG = {
  bucket: process.env.COMMUNITY_COS_BUCKET || 'imagica-images-1436573577',
  region: process.env.COMMUNITY_COS_REGION || 'ap-beijing',
  baseUrl: process.env.COMMUNITY_COS_BASE_URL || 'https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com',
  prefix: process.env.TRIP_COS_PREFIX || 'miniapp/',
  secretId: process.env.COS_SECRET_ID || '',
  secretKey: process.env.COS_SECRET_KEY || ''
};

const MAX_FILES = 9;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const STS_DURATION_SECONDS = 900;
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;
const PURPOSE_CONFIG = {
  log: { directory: 'trip-logs', maxFiles: 9 },
  cover: { directory: 'trip-covers', maxFiles: 9 },
  avatar: { directory: 'trip-avatars', maxFiles: 1 },
  comment: { directory: 'trip-comments', maxFiles: 3 },
  user_avatar: { directory: 'user-avatars', maxFiles: 1 },
  report: { directory: 'reports', maxFiles: 3 }
};

function isCosConfigured() {
  return !!(COS_CONFIG.secretId && COS_CONFIG.secretKey);
}

function getCosSts() {
  if (!isCosConfigured()) return null;
  try { return require('qcloud-cos-sts'); } catch (err) { return null; }
}

function getCosSdk() {
  if (!isCosConfigured()) return null;
  try {
    const COS = require('cos-nodejs-sdk-v5');
    return new COS({ SecretId: COS_CONFIG.secretId, SecretKey: COS_CONFIG.secretKey });
  } catch (err) {
    return null;
  }
}

function generateId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function getDatePrefix() {
  const now = new Date();
  return now.getFullYear() + '/' + String(now.getMonth() + 1).padStart(2, '0');
}

function getBasePrefix() {
  return COS_CONFIG.prefix.endsWith('/') ? COS_CONFIG.prefix : COS_CONFIG.prefix + '/';
}

function getExtension(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function normalizeMediaObject(item) {
  if (!item || item.provider !== 'cos' || !item.key) return null;
  const key = String(item.key);
  return {
    provider: 'cos',
    key,
    url: COS_CONFIG.baseUrl + '/' + key,
    width: Math.max(0, Number(item.width) || 0),
    height: Math.max(0, Number(item.height) || 0),
    size: Math.max(0, Number(item.size) || 0),
    mimeType: ALLOWED_MIME_TYPES.includes(item.mimeType) ? item.mimeType : 'image/jpeg',
    sort: Math.max(0, Number(item.sort) || 0)
  };
}

async function getTripForUpload(openid, tripId, purpose) {
  if (!openid) throw new Error('请先登录');
  if (!tripId) throw new Error('行程ID不能为空');
  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  if (!trip) throw new Error('行程不存在');

  if (purpose === 'log') {
    const pastTripError = getPastTripWriteError(trip, 'log');
    if (pastTripError) throw new Error(pastTripError);
    const authorizedIds = trip.logAuthorizedPublisherIds || [];
    if (trip.creatorId !== openid && !authorizedIds.includes(openid)) {
      throw new Error('您没有发布日志的权限');
    }
    if ((trip.tripStage || 'not_started') !== 'ongoing') {
      throw new Error('行程日志未开启或已结束');
    }
  } else if (purpose !== 'comment') {
    if (trip.creatorId !== openid) throw new Error('只有发起人可以修改行程图片');
    const pastTripError = getPastTripWriteError(trip, 'edit');
    if (pastTripError) throw new Error(pastTripError);
  }
  return trip;
}

async function tripMediaCreateUploadSession(openid, data) {
  try {
    const purpose = String(data && data.purpose || '');
    const purposeConfig = PURPOSE_CONFIG[purpose];
    if (!purposeConfig) return { success: false, error: '不支持的图片用途' };
    const tripId = String(data && data.tripId || '');
    if (purpose === 'user_avatar' || purpose === 'report') {
      if (!openid) return { success: false, error: '请先登录' };
    } else {
      await getTripForUpload(openid, tripId, purpose);
    }

    if (!isCosConfigured()) {
      return { success: false, error: 'COS 存储尚未配置', errorCode: 'COS_NOT_CONFIGURED' };
    }
    const STS = getCosSts();
    if (!STS) {
      return { success: false, error: 'COS 临时凭证组件不可用', errorCode: 'COS_NOT_CONFIGURED' };
    }

    const files = data && data.files;
    if (!Array.isArray(files) || files.length < 1 || files.length > Math.min(MAX_FILES, purposeConfig.maxFiles)) {
      return { success: false, error: '图片数量不正确' };
    }
    files.forEach(file => {
      if (!file || !ALLOWED_MIME_TYPES.includes(file.mimeType)) throw new Error('存在不支持的图片格式');
      const size = Number(file.size);
      if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) throw new Error('单张图片必须小于 10MB');
    });

    const sessionId = generateId('trip_media');
    const resourcePath = purpose === 'user_avatar' || purpose === 'report' ? '' : tripId + '/';
    const pathPrefix = getBasePrefix() + purposeConfig.directory + '/' + resourcePath + getDatePrefix() + '/' + sessionId + '/';
    const bucketMatch = COS_CONFIG.bucket.match(/(\d+)$/);
    const appId = bucketMatch ? bucketMatch[1] : '';
    const uploadItems = files.map((file, index) => ({
      index,
      cosKey: pathPrefix + generateId('img') + '.' + getExtension(file.mimeType),
      maxSize: MAX_FILE_SIZE,
      allowedMime: file.mimeType
    }));
    const resources = uploadItems.map(item =>
      'qcs::cos:' + COS_CONFIG.region + ':uid/' + appId + ':' + COS_CONFIG.bucket + '/' + item.cosKey
    );

    const stsResult = await new Promise((resolve, reject) => {
      STS.getCredential({
        secretId: COS_CONFIG.secretId,
        secretKey: COS_CONFIG.secretKey,
        region: COS_CONFIG.region,
        durationSeconds: STS_DURATION_SECONDS,
        policy: {
          version: '2.0',
          statement: [{
            action: ['name/cos:PutObject'],
            effect: 'allow',
            resource: resources,
            condition: {
              numeric_less_than_equal: { 'cos:content-length': MAX_FILE_SIZE },
              string_like: { 'cos:content-type': 'image/*' }
            }
          }]
        }
      }, (err, result) => err ? reject(err) : resolve(result));
    });

    const now = Date.now();
    await db.collection('trip_media_upload_sessions').add({
      data: {
        _id: sessionId,
        ownerId: openid,
        tripId,
        purpose,
        status: 'uploading',
        uploadItems,
        expiresAt: now + SESSION_EXPIRY_MS,
        createdAt: now,
        consumedAt: 0
      }
    });

    return {
      success: true,
      sessionId,
      bucket: COS_CONFIG.bucket,
      region: COS_CONFIG.region,
      baseUrl: COS_CONFIG.baseUrl,
      uploadItems,
      credentials: {
        tmpSecretId: stsResult.credentials.tmpSecretId,
        tmpSecretKey: stsResult.credentials.tmpSecretKey,
        sessionToken: stsResult.credentials.sessionToken,
        startTime: stsResult.startTime,
        expiredTime: stsResult.expiredTime
      }
    };
  } catch (err) {
    console.error('tripMedia/createUploadSession failed:', err);
    return { success: false, error: err.message || '创建图片上传会话失败', errorCode: 'UPLOAD_SESSION_FAILED' };
  }
}

async function verifyUploadSession(openid, options) {
  const sessionId = String(options && options.sessionId || '');
  const tripId = String(options && options.tripId || '');
  const purpose = String(options && options.purpose || '');
  const media = Array.isArray(options && options.media) ? options.media : [];
  if (!sessionId || media.length === 0) throw new Error('图片上传会话无效');

  const sessionRes = await db.collection('trip_media_upload_sessions').doc(sessionId).get();
  const session = sessionRes.data;
  if (!session || session.ownerId !== openid || session.tripId !== tripId || session.purpose !== purpose) {
    throw new Error('图片上传会话不匹配');
  }
  if (session.status !== 'uploading') throw new Error('图片上传会话已使用');
  if (Number(session.expiresAt) <= Date.now()) throw new Error('图片上传会话已过期');

  const allowedMap = {};
  (session.uploadItems || []).forEach(item => { allowedMap[item.cosKey] = item; });
  const normalized = media.map((item, index) => {
    const result = normalizeMediaObject(Object.assign({}, item, { sort: index }));
    if (!result || !allowedMap[result.key]) throw new Error('图片不属于当前上传会话');
    return result;
  });
  if (new Set(normalized.map(item => item.key)).size !== normalized.length) throw new Error('图片上传信息重复');

  const cos = getCosSdk();
  if (!cos) throw new Error('COS 服务组件不可用');
  for (const item of normalized) {
    await new Promise((resolve, reject) => {
      cos.headObject({ Bucket: COS_CONFIG.bucket, Region: COS_CONFIG.region, Key: item.key }, err => {
        err ? reject(new Error('图片上传尚未完成')) : resolve();
      });
    });
  }
  return { session, media: normalized };
}

async function consumeUploadSession(sessionId) {
  if (!sessionId) return;
  await db.collection('trip_media_upload_sessions').doc(sessionId).update({
    data: { status: 'consumed', consumedAt: Date.now() }
  });
}

async function cleanupCosMedia(items, context) {
  const media = (items || []).map(normalizeMediaObject).filter(Boolean);
  if (media.length === 0) return;
  const cos = getCosSdk();
  for (const item of media) {
    let lastError = '';
    if (!cos) {
      lastError = 'COS 服务组件不可用';
    } else {
      try {
        await new Promise((resolve, reject) => {
          cos.deleteObject({ Bucket: COS_CONFIG.bucket, Region: COS_CONFIG.region, Key: item.key }, err => {
            err ? reject(err) : resolve();
          });
        });
      } catch (err) {
        lastError = err.message || String(err);
      }
    }
    if (lastError) {
      const now = Date.now();
      try {
        await db.collection('trip_media_cleanup_tasks').add({
          data: {
            tripId: context && context.tripId || '',
            logId: context && context.logId || '',
            reason: context && context.reason || '',
            provider: 'cos',
            key: item.key,
            status: 'pending',
            retryCount: 0,
            lastError,
            createdAt: now,
            updatedAt: now
          }
        });
      } catch (taskErr) {
        console.error('记录行程 COS 清理任务失败:', taskErr);
      }
    }
  }
}

module.exports = {
  tripMediaCreateUploadSession,
  verifyUploadSession,
  consumeUploadSession,
  cleanupCosMedia,
  normalizeMediaObject
};
