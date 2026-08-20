const crypto = require('crypto');
const { db, cloud } = require('../utils/shared');

const COS_CONFIG = {
  bucket: process.env.COMMUNITY_COS_BUCKET || 'imagica-images-1436573577',
  region: process.env.COMMUNITY_COS_REGION || 'ap-beijing',
  baseUrl: process.env.COMMUNITY_COS_BASE_URL || 'https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com',
  prefix: process.env.TRIP_COS_PREFIX || 'miniapp/',
  secretId: process.env.COS_SECRET_ID || '',
  secretKey: process.env.COS_SECRET_KEY || ''
};

const VALID_RUNTIME_ENVS = ['develop', 'trial', 'release'];
const SHARE_CODE_PATTERN = /^[a-f0-9]{16}$/;

function getCosSdk() {
  if (!COS_CONFIG.secretId || !COS_CONFIG.secretKey) return null;
  try {
    const COS = require('cos-nodejs-sdk-v5');
    return new COS({ SecretId: COS_CONFIG.secretId, SecretKey: COS_CONFIG.secretKey });
  } catch (err) {
    return null;
  }
}

function getBasePrefix() {
  return COS_CONFIG.prefix.endsWith('/') ? COS_CONFIG.prefix : COS_CONFIG.prefix + '/';
}

function getPublicUrl(key) {
  return COS_CONFIG.baseUrl.replace(/\/$/, '') + '/' + key.split('/').map(encodeURIComponent).join('/');
}

function isTripReadableInEnvironment(trip, dataEnvironment) {
  const readEnvs = Array.isArray(dataEnvironment && dataEnvironment.readEnvs)
    ? dataEnvironment.readEnvs
    : ['dev'];
  return readEnvs.includes(trip.dataEnv || 'dev');
}

function cosHeadObject(cos, key) {
  return new Promise(resolve => {
    cos.headObject({
      Bucket: COS_CONFIG.bucket,
      Region: COS_CONFIG.region,
      Key: key
    }, err => resolve(!err));
  });
}

function cosPutObject(cos, key, body) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: COS_CONFIG.bucket,
      Region: COS_CONFIG.region,
      Key: key,
      Body: body,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable'
    }, (err, result) => err ? reject(err) : resolve(result));
  });
}

async function getTrip(tripId) {
  if (!tripId) throw new Error('行程ID不能为空');
  const result = await db.collection('trips').doc(tripId).get();
  if (!result.data) throw new Error('行程不存在');
  return result.data;
}

async function getOrCreateShareCode(trip) {
  if (SHARE_CODE_PATTERN.test(String(trip.posterShareCode || ''))) {
    return trip.posterShareCode;
  }

  // 16 个十六进制字符仅占 scene 上限的一半，既不暴露行程 ID，也方便扫码入口校验。
  // 相同行程并发生成时得到同一个短码，避免后写入的短码让已生成海报失效。
  const shareCode = crypto.createHash('sha256')
    .update('weekend-trip-poster:' + trip._id)
    .digest('hex')
    .slice(0, 16);
  await db.collection('trips').doc(trip._id).update({
    data: {
      posterShareCode: shareCode,
      posterShareCodeCreatedAt: Date.now()
    }
  });
  return shareCode;
}

function normalizeCodeBuffer(result) {
  if (Buffer.isBuffer(result)) return result;
  if (result && Buffer.isBuffer(result.buffer)) return result.buffer;
  if (result && result.buffer) return Buffer.from(result.buffer);
  throw new Error('微信小程序码生成结果无效');
}

async function tripPosterCodeGet(openid, data, dataEnvironment) {
  try {
    const trip = await getTrip(String(data && data.tripId || ''));
    if (!isTripReadableInEnvironment(trip, dataEnvironment)) {
      return { success: false, error: '该行程不属于当前数据环境' };
    }
    if (trip.reviewStatus === 'rejected' && trip.creatorId !== openid) {
      return { success: false, error: '该行程暂不可分享' };
    }

    const runtimeEnv = VALID_RUNTIME_ENVS.includes(dataEnvironment && dataEnvironment.runtimeEnv)
      ? dataEnvironment.runtimeEnv
      : 'develop';
    const shareCode = await getOrCreateShareCode(trip);
    const objectKey = getBasePrefix() + 'trip-posters/codes/' + runtimeEnv + '/' + shareCode + '.png';
    const cos = getCosSdk();
    if (!cos) return { success: false, error: 'COS 存储尚未配置' };

    if (!(await cosHeadObject(cos, objectKey))) {
      if (!cloud.openapi || !cloud.openapi.wxacode || !cloud.openapi.wxacode.getUnlimited) {
        return { success: false, error: '微信小程序码能力不可用，请重新部署 api 云函数' };
      }
      const codeResult = await cloud.openapi.wxacode.getUnlimited({
        scene: shareCode,
        page: 'pages/trip-detail/trip-detail',
        width: 280,
        autoColor: false,
        lineColor: { r: 47, g: 128, b: 237 },
        // 透明底叠在海报的白色圆形容器上，保留微信标准圆形小程序码视觉。
        isHyaline: true,
        checkPath: false,
        envVersion: runtimeEnv
      });
      await cosPutObject(cos, objectKey, normalizeCodeBuffer(codeResult));
    }

    return {
      success: true,
      codeUrl: getPublicUrl(objectKey),
      shareCode,
      runtimeEnv
    };
  } catch (err) {
    console.error('生成行程海报小程序码失败:', err);
    return { success: false, error: err.message || '小程序码生成失败' };
  }
}

async function tripPosterSceneResolve(openid, data, dataEnvironment) {
  try {
    const shareCode = String(data && data.scene || '').trim().toLowerCase();
    if (!SHARE_CODE_PATTERN.test(shareCode)) {
      return { success: false, error: '无效的行程码' };
    }
    const result = await db.collection('trips').where({ posterShareCode: shareCode }).limit(1).get();
    const trip = result.data && result.data[0];
    if (!trip || !isTripReadableInEnvironment(trip, dataEnvironment) ||
      (trip.reviewStatus === 'rejected' && trip.creatorId !== openid)) {
      return { success: false, error: '行程不存在或暂不可查看' };
    }
    return { success: true, tripId: trip._id };
  } catch (err) {
    console.error('解析行程海报码失败:', err);
    return { success: false, error: err.message || '行程码解析失败' };
  }
}

module.exports = {
  SHARE_CODE_PATTERN,
  getPublicUrl,
  tripPosterCodeGet,
  tripPosterSceneResolve
};
