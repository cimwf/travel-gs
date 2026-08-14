const { db } = require('../utils/shared');
const crypto = require('crypto');

const ADMIN_COLLECTION = 'admin_users';
const USER_COLLECTION = 'users';
const POST_COLLECTION = 'community_posts';
const UPLOAD_COLLECTION = 'official_upload_sessions';
const DISTRICTS = [
  '海淀区', '朝阳区', '丰台区', '东城区', '西城区', '石景山区', '门头沟区', '房山区',
  '通州区', '顺义区', '昌平区', '大兴区', '怀柔区', '平谷区', '密云区', '延庆区'
];
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const COS_CONFIG = {
  bucket: process.env.COMMUNITY_COS_BUCKET || 'imagica-images-1436573577',
  region: process.env.COMMUNITY_COS_REGION || 'ap-beijing',
  baseUrl: process.env.COMMUNITY_COS_BASE_URL || 'https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com',
  secretId: process.env.COS_SECRET_ID || '',
  secretKey: process.env.COS_SECRET_KEY || ''
};

async function requireAdmin(adminId) {
  if (!adminId) throw new Error('管理员身份已失效，请重新登录');
  let result;
  try {
    result = await db.collection(ADMIN_COLLECTION).doc(adminId).get();
  } catch (error) {
    throw new Error('管理员身份不存在，请重新登录');
  }
  const admin = result && result.data;
  if (!admin || !['admin', 'operator'].includes(admin.role || 'admin')) {
    throw new Error('无社区运营权限');
  }
  return admin;
}

function getCosSdk() {
  if (!COS_CONFIG.secretId || !COS_CONFIG.secretKey) return null;
  const COS = require('cos-nodejs-sdk-v5');
  return new COS({ SecretId: COS_CONFIG.secretId, SecretKey: COS_CONFIG.secretKey });
}

function getCosSts() {
  if (!COS_CONFIG.secretId || !COS_CONFIG.secretKey) return null;
  return require('qcloud-cos-sts');
}

function id(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function normalizeRegion(value) {
  const region = String(value || '').trim();
  if (region && !DISTRICTS.includes(region)) throw new Error('请选择北京市内的地区');
  return region;
}

function normalizeMedia(media) {
  if (!media || typeof media !== 'object') throw new Error('图片信息无效');
  const key = String(media.key || '').trim();
  const url = String(media.url || '').trim();
  if (!key || !url) throw new Error('图片信息不完整');
  return {
    key,
    url,
    width: Math.max(0, Number(media.width) || 0),
    height: Math.max(0, Number(media.height) || 0),
    size: Math.max(0, Number(media.size) || 0),
    mimeType: String(media.mimeType || 'image/jpeg')
  };
}

async function getOfficialAccount(accountId, requireActive) {
  let result;
  try {
    result = await db.collection(USER_COLLECTION).doc(String(accountId || '')).get();
  } catch (error) {
    throw new Error('官方账号不存在');
  }
  const account = result && result.data;
  if (!account || account.accountType !== 'official') throw new Error('官方账号不存在');
  if (requireActive && account.status !== 'active') throw new Error('该官方账号已停用');
  return account;
}

async function getOfficialPost(postId) {
  let result;
  try {
    result = await db.collection(POST_COLLECTION).doc(String(postId || '')).get();
  } catch (error) {
    throw new Error('官方动态不存在');
  }
  const post = result && result.data;
  if (!post || post.authorType !== 'official' || !post.isOfficial) {
    throw new Error('官方动态不存在');
  }
  return post;
}

function mediaIdentity(media) {
  if (typeof media === 'string') return media ? 'url:' + media : '';
  if (!media || typeof media !== 'object') return '';
  const key = String(media.key || '').trim();
  if (key) return 'key:' + key;
  const url = String(media.url || '').trim();
  return url ? 'url:' + url : '';
}

async function verifyUpload(adminId, sessionId, media, purpose) {
  if (!sessionId) throw new Error('图片上传会话不存在');
  let result;
  try {
    result = await db.collection(UPLOAD_COLLECTION).doc(sessionId).get();
  } catch (error) {
    throw new Error('图片上传会话不存在');
  }
  const session = result && result.data;
  if (!session || session.ownerId !== adminId || session.purpose !== purpose) throw new Error('无权使用该图片上传会话');
  if (session.status !== 'uploading' || session.expiresAt < Date.now()) throw new Error('图片上传会话已失效');
  const submitted = (media || []).map(normalizeMedia);
  const allowed = (session.uploadItems || []).reduce((map, item) => {
    map[item.cosKey] = item;
    return map;
  }, {});
  if (!submitted.length || submitted.length > session.maxFiles) throw new Error('图片数量不正确');
  const seen = {};
  const cos = getCosSdk();
  if (!cos) throw new Error('COS 尚未配置');
  for (const item of submitted) {
    if (!allowed[item.key] || seen[item.key]) throw new Error('存在未授权或重复的图片');
    seen[item.key] = true;
    const head = await new Promise((resolve, reject) => {
      cos.headObject({ Bucket: COS_CONFIG.bucket, Region: COS_CONFIG.region, Key: item.key }, (error, data) => error ? reject(error) : resolve(data));
    });
    const length = Number(head && head.headers && head.headers['content-length']) || item.size;
    if (length <= 0 || length > MAX_FILE_SIZE) throw new Error('图片大小不符合要求');
    item.size = length;
  }
  return submitted;
}

async function consumeUpload(sessionId, targetId) {
  if (!sessionId) return;
  await db.collection(UPLOAD_COLLECTION).doc(sessionId).update({
    data: { status: 'completed', targetId, completedAt: Date.now(), updatedAt: Date.now() }
  });
}

async function adminOfficialAccountList(data = {}) {
  try {
    await requireAdmin(String(data.adminId || ''));
    const result = await db.collection(USER_COLLECTION)
      .where({ accountType: 'official' })
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    return { success: true, accounts: result.data || [] };
  } catch (error) {
    return { success: false, error: error.message || '官方账号加载失败' };
  }
}

async function adminOfficialAccountSave(data = {}) {
  try {
    const adminId = String(data.adminId || '');
    await requireAdmin(adminId);
    const accountId = String(data.accountId || '').trim();
    const nickname = String(data.nickname || '').trim().slice(0, 20);
    const bio = String(data.bio || '').trim().slice(0, 100);
    const region = normalizeRegion(data.region);
    const status = data.status === 'disabled' ? 'disabled' : 'active';
    if (!nickname) throw new Error('请输入官方账号名称');

    let avatar = String(data.avatar || '').trim();
    let avatarObject = data.avatarObject || null;
    if (data.avatarUploadSessionId || data.avatarMedia) {
      const verified = await verifyUpload(adminId, String(data.avatarUploadSessionId || ''), [data.avatarMedia], 'avatar');
      avatarObject = verified[0];
      avatar = verified[0].url;
    }
    const now = Date.now();
    if (accountId) {
      await getOfficialAccount(accountId, false);
      await db.collection(USER_COLLECTION).doc(accountId).update({
        data: { nickname, bio, region, status, avatar, avatarObject, isOfficial: true, accountType: 'official', updatedAt: now }
      });
      await consumeUpload(String(data.avatarUploadSessionId || ''), accountId);
      return { success: true, accountId, message: '官方账号已更新' };
    }

    const newId = id('official');
    await db.collection(USER_COLLECTION).add({ data: {
      _id: newId,
      openid: newId,
      userId: newId,
      nickname,
      avatar,
      avatarObject,
      bio,
      region,
      gender: 0,
      following: 0,
      followers: 0,
      receivedLikes: 0,
      accountType: 'official',
      isOfficial: true,
      status,
      createdBy: adminId,
      createdAt: now,
      updatedAt: now
    }});
    await consumeUpload(String(data.avatarUploadSessionId || ''), newId);
    return { success: true, accountId: newId, message: '官方账号已创建' };
  } catch (error) {
    return { success: false, error: error.message || '官方账号保存失败' };
  }
}

async function adminOfficialUploadSession(data = {}) {
  try {
    const adminId = String(data.adminId || '');
    await requireAdmin(adminId);
    const purpose = data.purpose === 'avatar' ? 'avatar' : 'post';
    const files = Array.isArray(data.files) ? data.files : [];
    const maxFiles = purpose === 'avatar' ? 1 : 9;
    if (!files.length || files.length > maxFiles) throw new Error('图片数量不正确');
    files.forEach((file) => {
      if (!MIME_TYPES.includes(file.mimeType)) throw new Error('仅支持 JPG、PNG、WebP 图片');
      if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0 || Number(file.size) > MAX_FILE_SIZE) throw new Error('单张图片不能超过 10MB');
    });
    const STS = getCosSts();
    if (!STS) throw new Error('COS 尚未配置');
    const sessionId = id('official_upload');
    const date = new Date();
    const prefix = purpose === 'avatar' ? 'miniapp/user-avatars/official/' : 'miniapp/community/official/';
    const allowedPrefix = prefix + date.getFullYear() + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + sessionId + '/';
    const appId = (COS_CONFIG.bucket.match(/(\d+)$/) || [])[1] || '';
    const uploadItems = files.map((file, index) => {
      const ext = file.mimeType === 'image/png' ? 'png' : file.mimeType === 'image/webp' ? 'webp' : 'jpg';
      return { index, cosKey: allowedPrefix + crypto.randomUUID() + '.' + ext, allowedMime: file.mimeType, maxSize: MAX_FILE_SIZE };
    });
    const resource = uploadItems.map((item) => 'qcs::cos:' + COS_CONFIG.region + ':uid/' + appId + ':' + COS_CONFIG.bucket + '/' + item.cosKey);
    const credentials = await new Promise((resolve, reject) => {
      STS.getCredential({
        secretId: COS_CONFIG.secretId,
        secretKey: COS_CONFIG.secretKey,
        region: COS_CONFIG.region,
        durationSeconds: 900,
        policy: { version: '2.0', statement: [{ action: ['name/cos:PutObject'], effect: 'allow', resource }] }
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    const now = Date.now();
    await db.collection(UPLOAD_COLLECTION).add({ data: {
      _id: sessionId, ownerId: adminId, purpose, status: 'uploading', maxFiles: files.length,
      uploadItems, expiresAt: now + 24 * 60 * 60 * 1000, createdAt: now, updatedAt: now
    }});
    return {
      success: true,
      sessionId,
      bucket: COS_CONFIG.bucket,
      region: COS_CONFIG.region,
      baseUrl: COS_CONFIG.baseUrl,
      uploadItems,
      credentials: {
        tmpSecretId: credentials.credentials.tmpSecretId,
        tmpSecretKey: credentials.credentials.tmpSecretKey,
        sessionToken: credentials.credentials.sessionToken,
        startTime: credentials.startTime,
        expiredTime: credentials.expiredTime
      }
    };
  } catch (error) {
    console.error('admin official upload session failed:', error);
    return { success: false, error: error.message || '创建上传会话失败' };
  }
}

async function adminOfficialPostList(data = {}) {
  try {
    await requireAdmin(String(data.adminId || ''));
    const page = Math.max(1, Number(data.page) || 1);
    const pageSize = Math.max(1, Math.min(Number(data.pageSize) || 10, 50));
    const condition = { authorType: 'official' };
    const results = await Promise.all([
      db.collection(POST_COLLECTION).where(condition).count(),
      db.collection(POST_COLLECTION).where(condition).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
    ]);
    return { success: true, posts: results[1].data || [], total: results[0].total || 0, page, pageSize };
  } catch (error) {
    return { success: false, error: error.message || '官方内容加载失败' };
  }
}

async function adminOfficialPostCreate(data = {}) {
  try {
    const adminId = String(data.adminId || '');
    const admin = await requireAdmin(adminId);
    const account = await getOfficialAccount(String(data.accountId || ''), true);
    const content = String(data.content || '').trim();
    if (content.length > 300) throw new Error('正文不能超过 300 字');
    let images = [];
    if (Array.isArray(data.images) && data.images.length) {
      images = await verifyUpload(adminId, String(data.uploadSessionId || ''), data.images, 'post');
    }
    if (!content && !images.length) throw new Error('正文和图片不能同时为空');
    const dataEnv = String(data.dataEnv || '').trim();
    if (dataEnv !== 'dev' && dataEnv !== 'prod') {
      throw new Error('请选择发布环境');
    }
    const now = Date.now();
    const postId = id('post');
    await db.collection(POST_COLLECTION).add({ data: {
      _id: postId,
      authorId: account.openid,
      authorName: account.nickname,
      authorAvatar: account.avatar || '',
      authorRegion: account.region || '',
      authorType: 'official',
      isOfficial: true,
      content,
      images,
      imageCount: images.length,
      location: null,
      visibility: 'public',
      likeCount: 0,
      commentCount: 0,
      reviewStatus: 'approved',
      machineSuggest: 'pass',
      adminReviewStatus: 'approved',
      imageAuditStatus: 'approved',
      adminReviewerName: admin.nickname || admin.username || '管理员',
      adminReviewedAt: now,
      status: 'active',
      dataEnv,
      createdAt: now,
      updatedAt: now
    }});
    await consumeUpload(String(data.uploadSessionId || ''), postId);
    return { success: true, postId, message: '官方动态已发布' };
  } catch (error) {
    return { success: false, error: error.message || '官方动态发布失败' };
  }
}

async function adminOfficialPostUpdate(data = {}) {
  try {
    const adminId = String(data.adminId || '');
    await requireAdmin(adminId);
    const postId = String(data.postId || '');
    if (!postId) throw new Error('作品 ID 不能为空');
    const post = await getOfficialPost(postId);

    if (data.mode === 'edit') {
      const account = await getOfficialAccount(String(data.accountId || ''), true);
      const content = String(data.content || '').trim();
      if (content.length > 300) throw new Error('正文不能超过 300 字');
      const dataEnv = String(data.dataEnv || '').trim();
      if (dataEnv !== 'dev' && dataEnv !== 'prod') throw new Error('请选择发布环境');

      const originalMedia = new Map();
      (Array.isArray(post.images) ? post.images : []).forEach((item) => {
        const identity = mediaIdentity(item);
        if (identity) originalMedia.set(identity, item);
      });
      const retainedImages = (Array.isArray(data.existingImages) ? data.existingImages : []).map((item) => {
        const original = originalMedia.get(mediaIdentity(item));
        if (!original) throw new Error('存在不属于该动态的历史图片');
        return original;
      });
      let uploadedImages = [];
      if (Array.isArray(data.images) && data.images.length) {
        uploadedImages = await verifyUpload(adminId, String(data.uploadSessionId || ''), data.images, 'post');
      }
      const images = retainedImages.concat(uploadedImages);
      if (images.length > 9) throw new Error('图片最多 9 张');
      if (!content && !images.length) throw new Error('正文和图片不能同时为空');

      await db.collection(POST_COLLECTION).doc(postId).update({ data: {
        authorId: account.openid,
        authorName: account.nickname,
        authorAvatar: account.avatar || '',
        authorRegion: account.region || '',
        content,
        images,
        imageCount: images.length,
        dataEnv,
        updatedAt: Date.now()
      }});
      await consumeUpload(String(data.uploadSessionId || ''), postId);
      return { success: true, message: '官方动态已更新' };
    }

    const status = data.status === 'active' ? 'active' : 'deleted';
    await db.collection(POST_COLLECTION).doc(postId).update({ data: { status, updatedAt: Date.now() } });
    return { success: true, message: status === 'active' ? '作品已恢复' : '作品已删除' };
  } catch (error) {
    return { success: false, error: error.message || '作品状态更新失败' };
  }
}

module.exports = {
  adminOfficialAccountList,
  adminOfficialAccountSave,
  adminOfficialUploadSession,
  adminOfficialPostList,
  adminOfficialPostCreate,
  adminOfficialPostUpdate
};
