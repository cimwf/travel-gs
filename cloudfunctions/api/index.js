// 云函数：api - 统一数据接口
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const crypto = require('./utils/crypto');
const AI_IMAGE_FREE_QUOTA = 3;
const DEFAULT_CLOUD_ENV_ID = 'prod-d2gkmbquec074b1df';
const DEFAULT_CLOUD_STORAGE_BUCKET = '7072-prod-d2gkmbquec074b1df-1427058553';

function normalizeAiImageQuotaNumber(value, fallback = AI_IMAGE_FREE_QUOTA) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function buildAiImageQuotaUserInfo(user = {}) {
  return {
    appUserId: user.userId || '',
    nickname: user.nickname || '',
    phone: user.phone || '',
    phoneMask: user.phoneMask || (user.phone ? crypto.maskPhone(user.phone) : ''),
    avatar: safeAvatar(user.avatar || '')
  };
}

function hasAiImageQuotaUserInfo(userInfo = {}) {
  return Boolean(
    userInfo.appUserId ||
    userInfo.nickname ||
    userInfo.phone ||
    userInfo.phoneMask ||
    userInfo.avatar
  );
}

function getAiImageQuotaUserInfoPatch(quota = {}, userInfo = {}) {
  const patch = {};
  if (!hasAiImageQuotaUserInfo(userInfo)) return patch;

  ['appUserId', 'nickname', 'phone', 'phoneMask', 'avatar'].forEach(key => {
    if (userInfo[key] && quota[key] !== userInfo[key]) {
      patch[key] = userInfo[key];
    }
  });

  return patch;
}

function createAiImageOrderNo(now = Date.now()) {
  return `AI${now}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

exports.main = async (event, context) => {
  const { action, data } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    switch (action) {
      // ========== 认证相关 ==========
      case 'auth/publicKey':
        return await getPublicKey();
      case 'auth/trackEvent':
        return await authTrackEvent(data);

      // ========== 用户相关 ==========
      case 'user/check':
        return await userCheck(data.phone);
      case 'user/register':
        return await userRegister(openid, data);
      case 'user/login':
        return await userLogin(openid, data);
      case 'user/loginPassword':
        return await userLoginPassword(data);
      case 'user/loginByPhone':
        return await userLoginByPhone(openid, data);
      case 'user/update':
        return await userUpdate(openid, data);
      case 'user/get':
        return await userGet(data.userId || openid);

      // ========== 地点相关 ==========
      case 'place/list':
        return await placeList(data);
      case 'place/get':
        return await placeGet(data.placeId);
      case 'place/view':
        return await placeView(data.placeId);
      case 'place/search':
        return await placeSearch(data.keyword);

      // ========== 行程相关 ==========
      case 'trip/create':
        return await tripCreate(openid, data);
      case 'trip/list':
        return await tripList(openid, data);
      case 'trip/get':
        return await tripGet(data.tripId);
      case 'trip/view':
        return await tripView(data.tripId);
      case 'trip/join':
        return await tripJoin(openid, data);
      case 'trip/quit':
        return await tripQuit(openid, data);
      case 'trip/removeMember':
        return await tripRemoveMember(openid, data);
      case 'trip/updateStatus':
        return await tripUpdateStatus(openid, data);
      case 'trip/delete':
        return await tripDelete(openid, data);
      case 'trip/update':
        return await tripUpdate(openid, data);
      case 'trip/my':
        return await tripMy(openid);
      case 'trip/listByUser':
        return await tripListByUser(data);

      // ========== 申请相关 ==========
      case 'apply/create':
        return await applyCreate(openid, data);
      case 'apply/list':
        return await applyList(openid, data);
      case 'apply/handle':
        return await applyHandle(openid, data);
      case 'apply/notifications':
        return await applyNotifications(openid);
      case 'apply/delete':
        return await applyDelete(openid, data);
      case 'apply/cancel':
        return await applyCancel(openid, data);
      case 'apply/unreadCount':
        return await applyUnreadCount(openid);
      case 'apply/markRead':
        return await applyMarkRead(openid);

      // ========== 想去相关 ==========
      case 'want/toggle':
        return await wantToggle(openid, data);
      case 'want/list':
        return await wantList(openid);

      // ========== 消息相关 ==========
      case 'message/send':
        return await messageSend(openid, data);
      case 'message/list':
        return await messageList(openid, data);
      case 'message/read':
        return await messageRead(data.messageId);

      // ========== 评论相关 ==========
      case 'comment/create':
        return await commentCreate(openid, data);
      case 'comment/list':
        return await commentList(data.placeId);

      // ========== Banner相关 ==========
      case 'banner/list':
        return await bannerList();

      // ========== 反馈相关 ==========
      case 'feedback/create':
        return await feedbackCreate(openid, data);

      // ========== 景点相关 ==========
      case 'attractions/list':
        return await attractionsList();
      case 'attractions/get':
        return await attractionsGet(data.placeId);

      // ========== 用户上传景点相关 ==========
      case 'userSpots/create':
        return await userSpotsCreate(openid, data);

      // ========== AI 生图相关 ==========
      case 'aiImage/generate':
        return await aiImageGenerate(openid, data);
      case 'aiImage/status':
        return await aiImageStatus(openid, data);
      case 'aiImage/summary':
        return await aiImageSummary(openid);
      case 'aiImage/list':
        return await aiImageList(openid);
      case 'aiImage/delete':
        return await aiImageDelete(openid, data);
      case 'aiImage/packages':
        return await aiImagePackages();
      case 'aiImage/purchasePackage':
        return await aiImagePurchasePackage(openid, data);
      case 'aiImage/templates':
        return await aiImageTemplates(openid, data);
      case 'aiImage/templateVote':
        return await aiImageTemplateVote(openid, data);

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (err) {
    console.error('云函数错误:', err);
    return { success: false, error: err.message };
  }
};

function isLocalTempFilePath(path) {
  return typeof path === 'string' && (
    path.startsWith('wxfile://') ||
    path.startsWith('http://tmp') ||
    path.startsWith('https://tmp') ||
    path.startsWith('tmp/')
  );
}

function normalizeAvatarForDb(avatar) {
  if (!avatar || isLocalTempFilePath(avatar)) {
    return '';
  }
  return avatar;
}

function safeAvatar(avatar) {
  return normalizeAvatarForDb(avatar);
}

// ========== 认证相关 ==========

// 获取公钥
async function getPublicKey() {
  try {
    const keyData = crypto.createKeyPair();
    return {
      success: true,
      data: {
        keyId: keyData.keyId,
        publicKey: keyData.publicKey,
        expiresIn: keyData.expiresIn
      }
    };
  } catch (err) {
    console.error('生成公钥失败:', err);
    return { success: false, error: '生成公钥失败' };
  }
}

// 记录用户行为事件（用于转化率统计）
async function authTrackEvent(data) {
  const { eventType, openid } = data;

  if (!eventType || !openid) {
    return { success: false, error: '参数不完整' };
  }

  if (eventType !== 'loginSuccess') {
    return { success: false, error: '不支持的统计事件' };
  }

  try {
    return await recordUserStatEvent(eventType, openid, data.extra || {});
  } catch (err) {
    console.error('记录事件失败:', err);
    return { success: false, error: err.message };
  }
}

async function recordUserStatEvent(eventType, openid, extra = {}) {
  if (!eventType || !openid) {
    return { success: false, error: '参数不完整' };
  }

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const statsRes = await db.collection('user_stats')
    .where({ type: eventType, date: dateStr })
    .get();

  if (statsRes.data.length > 0) {
    const existing = statsRes.data[0];
    const openids = existing.openids || [];

    if (openids.includes(openid)) {
      return { success: true, duplicated: true };
    }

    await db.collection('user_stats').doc(existing._id).update({
      data: {
        count: _.inc(1),
        openids: _.push(openid),
        updatedAt: Date.now(),
        lastExtra: extra
      }
    });
  } else {
    await db.collection('user_stats').add({
      data: {
        type: eventType,
        date: dateStr,
        count: 1,
        openids: [openid],
        lastExtra: extra,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    });
  }

  return { success: true };
}

// ========== 用户相关 ==========

// 检查手机号是否已注册
async function userCheck(phone) {
  if (!phone) {
    return { success: false, error: '手机号不能为空' };
  }
  
  const userRes = await db.collection('users').where({ phone }).get();
  
  if (userRes.data.length > 0) {
    return { success: true, exists: true, user: userRes.data[0] };
  }
  
  return { success: true, exists: false };
}

// 用户注册（新用户）
async function userRegister(openid, data) {
  const { phone, password, encryptedPassword, key, iv, keyId, nickname, avatar, gender } = data;
  const avatarForDb = normalizeAvatarForDb(avatar);

  if (!phone) {
    return { success: false, error: '手机号不能为空' };
  }

  // 解密密码（手机号一键登录注册时无密码，此为可选）
  const isPhoneAuth = !password && !encryptedPassword;
  let plainPassword = password;

  if (!isPhoneAuth) {
    if (encryptedPassword && key && iv) {
      try {
        plainPassword = crypto.simpleDecrypt(encryptedPassword, key, iv);
      } catch (err) {
        console.error('密码解密失败:', err);
        return { success: false, error: '密码解密失败' };
      }
    }

    if (!plainPassword) {
      return { success: false, error: '密码不能为空' };
    }

    // 验证密码格式（8-20位，包含字母和数字）
    if (!/^(?=.*[a-zA-Z])(?=.*\d).{8,20}$/.test(plainPassword)) {
      return { success: false, error: '密码格式不正确，需8-20位且包含字母和数字' };
    }
  }

  // 检查手机号是否已注册
  const existRes = await db.collection('users').where({ phone }).get();
  if (existRes.data.length > 0) {
    return { success: false, error: '该手机号已注册' };
  }

  // 生成默认昵称
  const defaultNickname = nickname || '用户' + phone.slice(-4);

  // 哈希密码（手机号一键登录注册时跳过）
  let hashedPassword = '';
  if (!isPhoneAuth) {
    hashedPassword = await crypto.hashPassword(plainPassword);
  }

  // 生成用户ID：前缀 + 时间戳后6位 + 4位随机数
  const now = new Date();
  const timePart = now.getHours().toString().padStart(2, '0') +
                   now.getMinutes().toString().padStart(2, '0') +
                   now.getSeconds().toString().padStart(2, '0');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  const userId = 'BJ' + timePart + randomPart;

  // 创建新用户
  const newUser = {
    userId,
    openid,
    phone,
    phoneMask: crypto.maskPhone(phone), // 脱敏手机号
    contactPhone: phone, // 联系方式，默认等于手机号
    password: hashedPassword,
    nickname: defaultNickname.trim(),
    avatar: avatarForDb,
    gender: gender || 0,
    bio: '',
    following: 0,
    followers: 0,
    trips: 0,
    places: 0,
    tags: [],
    carOwner: false,
    loginAttempts: 0,
    lockedUntil: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  };

  const res = await db.collection('users').add({ data: newUser });
  newUser._id = res._id;
  await syncAiImageQuotaUserInfo(openid, newUser);

  // 返回用户信息（不返回密码）
  const safeUser = { ...newUser };
  delete safeUser.password;
  return { success: true, user: safeUser };
}

async function userLogin(openid, data) {
  const avatarForDb = normalizeAvatarForDb(data.avatar);

  // 查找用户
  const userRes = await db.collection('users').where({ openid }).get();
  
  if (userRes.data.length > 0) {
    // 更新最后活跃时间
    await db.collection('users').doc(userRes.data[0]._id).update({
      data: { lastActiveAt: Date.now() }
    });
    return { success: true, user: userRes.data[0] };
  }
  
  // 创建新用户
  const newUser = {
    openid,
    nickname: data.nickname || '旅行者',
    avatar: avatarForDb,
    gender: data.gender || 0,
    bio: '',
    phone: '',
    following: 0,
    followers: 0,
    trips: 0,
    places: 0,
    tags: [],
    carOwner: false,
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  };
  
  const res = await db.collection('users').add({ data: newUser });
  newUser._id = res._id;

  return { success: true, user: newUser, isNew: true };
}

// 账号密码登录
async function userLoginPassword(data) {
  const { username, password, encryptedPassword, key, iv, keyId } = data;

  if (!username) {
    return { success: false, error: '账号不能为空' };
  }

  // 解密密码
  let plainPassword = password;
  if (encryptedPassword && key && iv) {
    try {
      plainPassword = crypto.simpleDecrypt(encryptedPassword, key, iv);
    } catch (err) {
      console.error('密码解密失败:', err);
      return { success: false, error: '密码解密失败' };
    }
  }

  if (!plainPassword) {
    return { success: false, error: '密码不能为空' };
  }

  // 查找用户（支持手机号或用户名登录）
  const userRes = await db.collection('users').where(
    _.or(
      { phone: username },
      { nickname: username }
    )
  ).get();

  if (userRes.data.length === 0) {
    return { success: false, error: '账号不存在', code: 1002 };
  }

  const user = userRes.data[0];

  // 检查账号是否被锁定
  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    const remainMinutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    return {
      success: false,
      error: `账号已被锁定，请${remainMinutes}分钟后再试`,
      code: 1003
    };
  }

  // 验证密码
  const isMatch = await crypto.verifyPassword(plainPassword, user.password);

  if (!isMatch) {
    // 登录失败，增加失败次数
    const newAttempts = (user.loginAttempts || 0) + 1;

    if (newAttempts >= 5) {
      // 锁定账号15分钟
      await db.collection('users').doc(user._id).update({
        data: {
          loginAttempts: newAttempts,
          lockedUntil: Date.now() + 15 * 60 * 1000
        }
      });
      return {
        success: false,
        error: '密码错误次数过多，账号已被锁定15分钟',
        code: 1003
      };
    }

    await db.collection('users').doc(user._id).update({
      data: { loginAttempts: newAttempts }
    });

    return {
      success: false,
      error: '密码错误',
      code: 1001,
      data: { remainAttempts: 5 - newAttempts }
    };
  }

  // 登录成功，重置失败次数，并更新 openid
  const wxContext = cloud.getWXContext();
  const currentOpenid = wxContext.OPENID;

  // 准备更新数据
  const updateData = {
    loginAttempts: 0,
    lockedUntil: 0,
    lastActiveAt: Date.now()
  };

  // 如果 openid 不存在，添加 openid
  if (!user.openid && currentOpenid) {
    updateData.openid = currentOpenid;
  }

  await db.collection('users').doc(user._id).update({
    data: updateData
  });

  // 返回用户信息（不返回密码），包含最新的 openid
  const safeUser = { ...user, ...updateData, openid: user.openid || currentOpenid };
  delete safeUser.password;
  await syncAiImageQuotaUserInfo(safeUser.openid, safeUser);
  return { success: true, user: safeUser };
}

// 手机号一键登录（无需密码，自动注册）
async function userLoginByPhone(openid, data) {
  const { phone, nickname, avatar } = data;
  const avatarForDb = normalizeAvatarForDb(avatar);

  if (!phone) {
    return { success: false, error: '手机号不能为空' };
  }

  const userRes = await db.collection('users').where({ phone }).get();

  if (userRes.data.length > 0) {
    const user = userRes.data[0];

    // 更新 openid、微信资料和活跃时间
    const updateData = { lastActiveAt: Date.now() };
    if (!user.openid || user.openid !== openid) {
      updateData.openid = openid;
    }
    if (nickname && (!user.nickname || user.nickname.startsWith('用户'))) {
      updateData.nickname = nickname;
    }
    if (avatarForDb && (!user.avatar || isLocalTempFilePath(user.avatar))) {
      updateData.avatar = avatarForDb;
    } else if (!avatarForDb && isLocalTempFilePath(user.avatar)) {
      updateData.avatar = '';
    }
    await db.collection('users').doc(user._id).update({ data: updateData });

    const safeUser = { ...user, openid: openid, ...updateData };
    delete safeUser.password;
    await syncAiImageQuotaUserInfo(openid, safeUser);
    return { success: true, user: safeUser, isNew: false };
  }

  // 新用户自动注册
  const now = new Date();
  const timePart = now.getHours().toString().padStart(2, '0') +
                   now.getMinutes().toString().padStart(2, '0') +
                   now.getSeconds().toString().padStart(2, '0');
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  const userId = 'BJ' + timePart + randomPart;

  const newUser = {
    userId,
    openid,
    phone,
    phoneMask: crypto.maskPhone(phone),
    contactPhone: phone,
    password: '',
    nickname: (nickname || '用户' + phone.slice(-4)).trim(),
    avatar: avatarForDb,
    gender: 0,
    bio: '',
    following: 0,
    followers: 0,
    trips: 0,
    places: 0,
    tags: [],
    carOwner: false,
    loginAttempts: 0,
    lockedUntil: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  };

  const res = await db.collection('users').add({ data: newUser });
  newUser._id = res._id;
  await syncAiImageQuotaUserInfo(openid, newUser);

  const safeUser = { ...newUser };
  delete safeUser.password;
  return { success: true, user: safeUser, isNew: true };
}

async function userUpdate(openid, data) {
  // 优先使用 _id 查找用户，其次用 openid
  let user = null;

  if (data._id) {
    // 通过 _id 查找（推荐，唯一标识）
    const res = await db.collection('users').doc(data._id).get();
    user = res.data;
  }

  // _id 未提供或未找到时，通过 openid 查找
  if (!user && openid) {
    const userRes = await db.collection('users').where({ openid }).get();
    if (userRes.data.length > 0) {
      user = userRes.data[0];
    }
  }

  if (!user) {
    return { success: false, error: '用户不存在' };
  }

  // 更新用户信息
  const updateData = {
    nickname: data.nickname,
    avatar: data.avatar === undefined ? undefined : normalizeAvatarForDb(data.avatar),
    gender: data.gender,
    contactPhone: data.contactPhone,
    bio: data.bio,
    background: data.background,
    photos: data.photos,
    lastActiveAt: Date.now()
  };

  // 过滤掉 undefined 的字段
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  await db.collection('users').doc(user._id).update({
    data: updateData
  });
  await syncAiImageQuotaUserInfo(user.openid || openid, { ...user, ...updateData });

  return { success: true };
}

async function userGet(userId) {
  if (!userId) {
    return { success: false, error: '用户ID不能为空' };
  }

  // 先尝试通过 _id 查询
  try {
    const resById = await db.collection('users').doc(userId).get();
    return { success: true, user: resById.data };
  } catch (e) {
    // _id 查询失败，尝试通过 openid 查询
  }

  // 通过 openid 查询
  try {
    const resByOpenid = await db.collection('users').where({ openid: userId }).get();
    if (resByOpenid.data && resByOpenid.data.length > 0) {
      return { success: true, user: resByOpenid.data[0] };
    }
  } catch (e) {
    // openid 查询失败
  }

  // 通过 userId (自定义ID) 查询
  try {
    const resByUserId = await db.collection('users').where({ userId: userId }).get();
    if (resByUserId.data && resByUserId.data.length > 0) {
      return { success: true, user: resByUserId.data[0] };
    }
  } catch (e) {
    // userId 查询失败
  }

  return { success: false, error: '用户不存在' };
}

// ========== 地点相关 ==========

async function placeList(data) {
  const { category, page = 1, pageSize = 20 } = data;
  let query = db.collection('places');
  
  if (category && category !== '全部') {
    query = query.where({ category });
  }
  
  const res = await query
    .orderBy('wantCount', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  return { success: true, places: res.data };
}

async function placeGet(placeId) {
  const res = await db.collection('places').doc(placeId).get();
  return { success: true, place: res.data };
}

// 记录地点浏览量
async function placeView(placeId) {
  if (!placeId) {
    return { success: false, error: '地点ID不能为空' };
  }

  // 获取今天的日期字符串
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  try {
    // 更新地点总浏览量
    await db.collection('places').doc(placeId).update({
      data: { viewCount: _.inc(1) }
    });

    // 更新每日浏览量统计
    const viewStatsRes = await db.collection('place_view_stats')
      .where({ placeId, date: dateStr })
      .get();

    if (viewStatsRes.data.length > 0) {
      // 更新今日浏览量
      await db.collection('place_view_stats').doc(viewStatsRes.data[0]._id).update({
        data: {
          count: _.inc(1),
          updatedAt: Date.now()
        }
      });
    } else {
      // 创建今日浏览记录
      const placeRes = await db.collection('places').doc(placeId).get();
      const place = placeRes.data;

      await db.collection('place_view_stats').add({
        data: {
          placeId,
          placeName: place.name,
          date: dateStr,
          count: 1,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      });
    }

    return { success: true };
  } catch (err) {
    console.error('记录浏览量失败:', err);
    return { success: false, error: err.message };
  }
}

async function placeSearch(keyword) {
  const res = await db.collection('places')
    .where({
      name: db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    })
    .limit(20)
    .get();
  
  return { success: true, places: res.data };
}

// ========== 行程相关 ==========

async function tripCreate(openid, data) {
  // 获取用户信息
  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];

  // 从 quick_attractions 获取景点信息
  let placeName = data.placeName || '';
  let tripImage = '';
  if (data.placeId) {
    try {
      const placeRes = await db.collection('quick_attractions').doc(data.placeId).get();
      if (placeRes.data) {
        placeName = placeRes.data.name || placeName;
        tripImage = placeRes.data.coverImage || placeRes.data.image || '';
      }
    } catch (err) {
      console.warn('从 quick_attractions 获取景点信息失败', err);
    }
  }

  const currentCount = data.currentCount || 1;
  const needCount = data.needCount || 3;

  const newTrip = {
    tripTitle: data.tripTitle || '',
    placeId: data.placeId,
    placeName: placeName,
    departure: data.departure || '',
    date: data.date,
    hasCar: data.hasCar !== false,
    currentCount: currentCount,
    needCount: needCount,
    totalParticipants: data.totalParticipants || (currentCount + needCount),
    contactPhone: data.contactPhone || '',
    meetingPlace: data.meetingPlace || '',
    meetingTime: data.meetingTime || '',
    carSeats: data.carSeats || '',
    carModel: data.carModel || '',
    travelDesc: data.travelDesc || '',
    price: data.price || '',
    remark: data.remark || '',
    creatorId: openid,
    creatorName: user.nickname,
    creatorAvatar: safeAvatar(user.avatar),
    participants: data.participants || [{
      userId: openid,
      nickname: user.nickname,
      avatar: safeAvatar(user.avatar)
    }],
    status: data.status || 'open',
    createdAt: Date.now()
  };

  const res = await db.collection('trips').add({ data: newTrip });
  newTrip._id = res._id;

  // 更新用户行程数
  await db.collection('users').doc(user._id).update({
    data: { trips: _.inc(1) }
  });

  return { success: true, trip: newTrip, tripImage };
}

async function tripList(openid, data) {
  const { placeId, status, date, excludeStatus, page = 1, pageSize = 8 } = data;

  // 记录行程列表访问人数。云函数上下文拿到的 openid 比前端传参更可信。
  // 只按天去重 openid，用于后台计算访问人数、登录人数和转化率。
  if (openid) {
    try {
      await recordUserStatEvent('tripListVisit', openid, { page, pageSize });
    } catch (err) {
      console.warn('记录行程访问统计失败', err);
    }
  }

  let query = db.collection('trips');

  const conditions = {};
  if (placeId) conditions.placeId = placeId;
  if (status) conditions.status = status;
  if (date) conditions.date = date;
  if (excludeStatus) conditions.status = _.neq(excludeStatus);

  if (Object.keys(conditions).length > 0) {
    query = query.where(conditions);
  }

  const res = await query
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  const trips = res.data || [];

  // 收集所有参与者 userId
  const userIds = new Set();
  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        if (p.userId) userIds.add(p.userId);
      });
    }
  });

  // 查询用户信息
  let userMap = {};
  if (userIds.size > 0) {
    try {
      const userRes = await db.collection('users')
        .where(_.or(
          { openid: _.in(Array.from(userIds)) },
          { userId: _.in(Array.from(userIds)) }
        ))
        .field({
          openid: true,
          userId: true,
          avatar: true,
          nickname: true
        })
        .get();

      if (userRes.data) {
        userRes.data.forEach(user => {
          // 同时用 openid 和 userId 作为 key，方便查找
          if (user.openid) {
            userMap[user.openid] = {
              avatar: safeAvatar(user.avatar),
              nickname: user.nickname || '旅行者'
            };
          }
          if (user.userId) {
            userMap[user.userId] = {
              avatar: safeAvatar(user.avatar),
              nickname: user.nickname || '旅行者'
            };
          }
        });
      }
    } catch (err) {
      console.warn('查询用户信息失败', err);
    }
  }

  // 收集云存储头像文件ID
  const avatarFileIDs = [];
  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        // 先用数据库查询的用户信息
        if (p.userId && userMap[p.userId]) {
          p.avatar = userMap[p.userId].avatar;
          p.nickname = userMap[p.userId].nickname;
        }
        // 收集云存储链接
        if (p.avatar && p.avatar.startsWith('cloud://')) {
          avatarFileIDs.push(p.avatar);
        }
      });
    }
  });

  // 获取云存储临时链接
  let avatarUrlMap = {};
  if (avatarFileIDs.length > 0) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: avatarFileIDs });
      if (urlRes.fileList) {
        urlRes.fileList.forEach(item => {
          if (item.tempFileURL) {
            avatarUrlMap[item.fileID] = item.tempFileURL;
          }
        });
      }
    } catch (err) {
      console.warn('获取头像临时链接失败', err);
    }
  }

  // 替换云存储链接为临时链接
  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        if (p.avatar && p.avatar.startsWith('cloud://') && avatarUrlMap[p.avatar]) {
          p.avatar = avatarUrlMap[p.avatar];
        }
      });
    }
  });

  return { success: true, trips };
}

// 获取行程详情
async function tripGet(tripId) {
  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }

  const res = await db.collection('trips').doc(tripId).get();
  const trip = res.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  // 收集所有参与者 userId
  const userIds = new Set();
  if (trip.participants) {
    trip.participants.forEach(p => {
      if (p.userId) userIds.add(p.userId);
    });
  }
  // 添加发起人
  if (trip.creatorId) userIds.add(trip.creatorId);

  // 查询用户信息（同时匹配 openid 和 userId 字段）
  let userMap = {};
  if (userIds.size > 0) {
    try {
      const userRes = await db.collection('users')
        .where(_.or(
          { openid: _.in(Array.from(userIds)) },
          { userId: _.in(Array.from(userIds)) }
        ))
        .field({
          openid: true,
          userId: true,
          avatar: true,
          nickname: true
        })
        .get();

      if (userRes.data) {
        userRes.data.forEach(user => {
          // 同时用 openid 和 userId 作为 key，方便查找
          if (user.openid) {
            userMap[user.openid] = {
              avatar: safeAvatar(user.avatar),
              nickname: user.nickname || '旅行者'
            };
          }
          if (user.userId) {
            userMap[user.userId] = {
              avatar: safeAvatar(user.avatar),
              nickname: user.nickname || '旅行者'
            };
          }
        });
      }
    } catch (err) {
      console.warn('查询用户信息失败', err);
    }
  }

  // 收集云存储头像文件ID
  const avatarFileIDs = [];

  // 处理发起人信息
  if (trip.creatorId && userMap[trip.creatorId]) {
    trip.creatorName = userMap[trip.creatorId].nickname;
    trip.creatorAvatar = userMap[trip.creatorId].avatar;
  }
  if (trip.creatorAvatar && trip.creatorAvatar.startsWith('cloud://')) {
    avatarFileIDs.push(trip.creatorAvatar);
  }

  // 处理参与者信息
  if (trip.participants) {
    trip.participants.forEach(p => {
      if (p.userId && userMap[p.userId]) {
        p.avatar = userMap[p.userId].avatar;
        p.nickname = userMap[p.userId].nickname;
      }
      if (p.avatar && p.avatar.startsWith('cloud://')) {
        avatarFileIDs.push(p.avatar);
      }
    });
  }

  // 获取云存储临时链接
  let avatarUrlMap = {};
  if (avatarFileIDs.length > 0) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: avatarFileIDs });
      if (urlRes.fileList) {
        urlRes.fileList.forEach(item => {
          if (item.tempFileURL) {
            avatarUrlMap[item.fileID] = item.tempFileURL;
          }
        });
      }
    } catch (err) {
      console.warn('获取头像临时链接失败', err);
    }
  }

  // 替换云存储链接为临时链接
  if (trip.creatorAvatar && trip.creatorAvatar.startsWith('cloud://') && avatarUrlMap[trip.creatorAvatar]) {
    trip.creatorAvatar = avatarUrlMap[trip.creatorAvatar];
  }
  if (trip.participants) {
    trip.participants.forEach(p => {
      if (p.avatar && p.avatar.startsWith('cloud://') && avatarUrlMap[p.avatar]) {
        p.avatar = avatarUrlMap[p.avatar];
      }
    });
  }

  return { success: true, trip };
}

// 记录行程浏览量
async function tripView(tripId) {
  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }

  try {
    await db.collection('trips').doc(tripId).update({
      data: { viewCount: _.inc(1) }
    });
    return { success: true };
  } catch (err) {
    console.error('记录行程浏览量失败:', err);
    return { success: false, error: err.message };
  }
}

async function tripJoin(openid, data) {
  const { tripId } = data;
  
  // 获取行程
  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  
  if (trip.status !== 'open') {
    return { success: false, error: '行程已满或已取消' };
  }
  
  // 检查是否已参与
  if (trip.participants.some(p => p.userId === openid)) {
    return { success: false, error: '您已参与该行程' };
  }
  
  // 获取用户信息
  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];
  
  // 添加参与者
  const newParticipant = {
    userId: openid,
    nickname: user.nickname,
    avatar: safeAvatar(user.avatar)
  };
  
  const updateData = {
    participants: _.push(newParticipant),
    currentCount: _.inc(1),
    needCount: _.inc(-1)
  };

  // 检查是否满员（needCount <= 1 时，再加入1人就满员）
  if ((trip.needCount || 0) <= 1) {
    updateData.status = 'full';
  }
  
  await db.collection('trips').doc(tripId).update({ data: updateData });

  return { success: true };
}

// 退出行程
async function tripQuit(openid, data) {
  const { tripId } = data;

  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }

  // 获取行程
  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  // 检查是否为发起人（发起人不能退出）
  if (trip.creatorId === openid) {
    return { success: false, error: '发起人不能退出行程' };
  }

  // 检查是否已参与
  const participantIndex = trip.participants.findIndex(p => p.userId === openid);
  if (participantIndex === -1) {
    return { success: false, error: '您未参与该行程' };
  }

  // 获取退出者信息（从参与者列表中）
  const quitter = trip.participants.find(p => p.userId === openid);
  const quitterName = quitter ? quitter.nickname : '旅行者';
  const quitterAvatar = quitter ? safeAvatar(quitter.avatar) : '';

  // 从参与者列表中移除当前用户
  const newParticipants = trip.participants.filter(p => p.userId !== openid);

  await db.collection('trips').doc(tripId).update({
    data: {
      participants: newParticipants,
      currentCount: _.inc(-1),
      needCount: _.inc(1),
      status: 'open' // 重新开放招募
    }
  });

  // 创建退出通知记录（通知行程发起人）
  await db.collection('applies').add({
    data: {
      tripId,
      placeId: trip.placeId || '',
      placeName: trip.placeName,
      fromUserId: openid,
      fromUserName: quitterName,
      fromUserAvatar: quitterAvatar,
      toUserId: trip.creatorId,
      ownerId: trip.creatorId,
      status: 'quit',
      unread: true,
      createdAt: Date.now()
    }
  });

  return { success: true };
}

// 移除成员
async function tripRemoveMember(openid, data) {
  const { tripId, memberId } = data;

  if (!tripId || !memberId) {
    return { success: false, error: '参数不完整' };
  }

  // 获取行程
  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  // 验证权限：只有发起人可以移除成员
  if (trip.creatorId !== openid) {
    return { success: false, error: '无权移除成员' };
  }

  // 不能移除发起人自己
  if (memberId === trip.creatorId) {
    return { success: false, error: '不能移除发起人' };
  }

  // 从参与者列表中移除该成员
  const newParticipants = trip.participants.filter(p => p.userId !== memberId);

  if (newParticipants.length === trip.participants.length) {
    return { success: false, error: '成员不存在' };
  }

  await db.collection('trips').doc(tripId).update({
    data: {
      participants: newParticipants,
      currentCount: _.inc(-1),
      needCount: _.inc(1),
      status: 'open' // 重新开放招募
    }
  });

  // 获取被移除成员信息
  const removedMember = trip.participants.find(p => p.userId === memberId);
  const removedName = removedMember ? removedMember.nickname : '旅行者';

  // 创建移除通知记录（通知被移除的成员）
  await db.collection('applies').add({
    data: {
      tripId,
      placeId: trip.placeId || '',
      placeName: trip.placeName,
      fromUserId: openid,
      fromUserName: trip.creatorName || '发起人',
      toUserId: memberId,
      toUserName: removedName,
      ownerId: memberId,
      status: 'removed',
      unread: true,
      createdAt: Date.now()
    }
  });

  return { success: true };
}

// 更新行程状态
async function tripUpdateStatus(openid, data) {
  const { tripId, status } = data;

  if (!tripId || !status) {
    return { success: false, error: '参数不完整' };
  }

  // 获取行程
  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  // 验证权限：只有发起人可以更新状态
  if (trip.creatorId !== openid) {
    return { success: false, error: '无权操作' };
  }

  await db.collection('trips').doc(tripId).update({
    data: {
      status,
      updatedAt: Date.now()
    }
  });

  // 取消行程时通知所有参与者（除发起人）
  if (status === 'cancelled' && trip.participants) {
    const now = Date.now();
    for (const p of trip.participants) {
      if (p.userId === openid) continue;
      await db.collection('applies').add({
        data: {
          tripId,
          placeId: trip.placeId || '',
          placeName: trip.placeName || '',
          fromUserId: openid,
          fromUserName: trip.creatorName || '发起人',
          toUserId: p.userId,
          toUserName: p.nickname || '旅行者',
          ownerId: p.userId,
          status: 'cancelled',
          unread: true,
          createdAt: now
        }
      });
    }
  }

  return { success: true };
}

// 删除行程
async function tripDelete(openid, data) {
  const { tripId } = data;

  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }

  // 获取行程
  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  // 验证权限：只有发起人可以删除
  if (trip.creatorId !== openid) {
    return { success: false, error: '无权删除' };
  }

  // 删除前通知所有参与者（除发起人）
  if (trip.participants) {
    const now = Date.now();
    for (const p of trip.participants) {
      if (p.userId === openid) continue;
      await db.collection('applies').add({
        data: {
          tripId,
          placeId: trip.placeId || '',
          placeName: trip.placeName || '',
          fromUserId: openid,
          fromUserName: trip.creatorName || '发起人',
          toUserId: p.userId,
          toUserName: p.nickname || '旅行者',
          ownerId: p.userId,
          status: 'deleted',
          unread: true,
          createdAt: now
        }
      });
    }
  }

  await db.collection('trips').doc(tripId).remove();

  return { success: true };
}

// 更新行程（编辑模式）
async function tripUpdate(openid, data) {
  const { tripId, ...updateFields } = data;

  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }

  // 获取行程
  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  // 验证权限：只有发起人可以更新
  if (trip.creatorId !== openid) {
    return { success: false, error: '无权更新' };
  }

  // 过滤掉 undefined 的字段
  const updateData = {};
  Object.keys(updateFields).forEach(key => {
    if (updateFields[key] !== undefined) {
      updateData[key] = updateFields[key];
    }
  });

  // 添加更新时间
  updateData.updatedAt = Date.now();

  // 如果更新了 needCount，同时更新 totalParticipants
  if (updateData.needCount !== undefined) {
    updateData.totalParticipants = (trip.currentCount || 1) + updateData.needCount;
  }

  await db.collection('trips').doc(tripId).update({
    data: updateData
  });

  return { success: true };
}

// 获取我的行程
async function tripMy(openid) {
  // 查询我参与的所有行程
  const res = await db.collection('trips')
    .where({
      'participants.userId': openid
    })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const trips = res.data || [];

  // 收集所有参与者 userId（可能是 openid 或自定义 userId）
  const userIds = new Set();
  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        if (p.userId) userIds.add(p.userId);
      });
    }
  });

  // 查询用户信息（同时匹配 openid 和 userId 字段）
  let userMap = {};
  if (userIds.size > 0) {
    try {
      const userRes = await db.collection('users')
        .where(_.or(
          { openid: _.in(Array.from(userIds)) },
          { userId: _.in(Array.from(userIds)) }
        ))
        .field({
          openid: true,
          userId: true,
          avatar: true,
          nickname: true
        })
        .get();

      if (userRes.data) {
        userRes.data.forEach(user => {
          // 同时用 openid 和 userId 作为 key，方便查找
          if (user.openid) {
            userMap[user.openid] = {
              avatar: safeAvatar(user.avatar),
              nickname: user.nickname || '旅行者'
            };
          }
          if (user.userId) {
            userMap[user.userId] = {
              avatar: safeAvatar(user.avatar),
              nickname: user.nickname || '旅行者'
            };
          }
        });
      }
    } catch (err) {
      console.warn('查询用户信息失败', err);
    }
  }

  // 收集云存储头像文件ID
  const avatarFileIDs = [];
  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        if (p.userId && userMap[p.userId]) {
          p.avatar = userMap[p.userId].avatar;
          p.nickname = userMap[p.userId].nickname;
        }
        if (p.avatar && p.avatar.startsWith('cloud://')) {
          avatarFileIDs.push(p.avatar);
        }
      });
    }
  });

  // 获取云存储临时链接
  let avatarUrlMap = {};
  if (avatarFileIDs.length > 0) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: avatarFileIDs });
      if (urlRes.fileList) {
        urlRes.fileList.forEach(item => {
          if (item.tempFileURL) {
            avatarUrlMap[item.fileID] = item.tempFileURL;
          }
        });
      }
    } catch (err) {
      console.warn('获取头像临时链接失败', err);
    }
  }

  // 替换云存储链接为临时链接
  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        if (p.avatar && p.avatar.startsWith('cloud://') && avatarUrlMap[p.avatar]) {
          p.avatar = avatarUrlMap[p.avatar];
        }
      });
    }
  });

  return { success: true, trips };
}

// 获取用户发布的行程
async function tripListByUser(data) {
  const { userId, page = 1, pageSize = 10 } = data;

  if (!userId) {
    return { success: false, error: '用户ID不能为空' };
  }

  // 查询该用户创建的行程
  const tripRes = await db.collection('trips')
    .where({
      creatorId: userId
    })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  const trips = tripRes.data || [];

  // 获取地点信息
  const placeIds = [...new Set(trips.map(t => t.placeId).filter(Boolean))];
  let placeMap = {};

  if (placeIds.length > 0) {
    try {
      const placeRes = await db.collection('places')
        .where(_.or(placeIds.map(id => ({ _id: id }))))
        .field({ _id: true, images: true, tags: true })
        .get();

      if (placeRes.data) {
        placeRes.data.forEach(place => {
          placeMap[place._id] = {
            images: place.images || [],
            tags: place.tags || []
          };
        });
      }
    } catch (err) {
      console.warn('查询地点信息失败', err);
    }
  }

  // 处理行程数据
  const formattedTrips = trips.map(trip => {
    const placeInfo = placeMap[trip.placeId] || {};
    let placeImage = placeInfo.images?.[0] || '';

    if (!placeImage) {
      placeImage = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop';
    }

    return {
      _id: trip._id,
      title: trip.tripTitle || trip.placeName,
      tripTitle: trip.tripTitle || '',
      placeName: trip.placeName,
      placeId: trip.placeId || '',
      placeImage: placeImage,
      date: trip.date,
      duration: trip.duration || '1天',
      departure: trip.departure || '',
      hasCar: trip.hasCar,
      carSeats: trip.carSeats || '',
      carModel: trip.carModel || '',
      price: trip.price || '',
      currentCount: trip.currentCount || 0,
      needCount: trip.needCount || 0,
      participants: trip.participants || [],
      status: trip.status || 'open',
      category: trip.category || '',
      createdAt: trip.createdAt || 0,
      viewCount: trip.viewCount || 0,
      likeCount: trip.likeCount || 0,
      commentCount: trip.commentCount || 0,
      tags: placeInfo.tags || []
    };
  });

  return { success: true, trips: formattedTrips };
}

// ========== 申请相关 ==========

async function applyCreate(openid, data) {
  const { tripId, placeName, toUserId, toUserName, contactValue, message } = data;

  if (!tripId || !toUserId) {
    return { success: false, error: '参数不完整' };
  }

  // 获取用户信息
  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];
  if (!user) {
    return { success: false, error: '用户不存在' };
  }

  // 获取行程 placeId
  let placeId = '';
  try {
    const tripRes = await db.collection('trips').doc(tripId).get();
    if (tripRes.data) {
      placeId = tripRes.data.placeId || '';
    }
  } catch (err) {
    console.warn('获取行程placeId失败', err);
  }

  const now = Date.now();
  const groupId = 'group_' + now + '_' + Math.random().toString(36).slice(2, 8);

  // 公共数据（两条记录共享）
  const commonData = {
    tripId,
    placeId,
    placeName: placeName || '',
    fromUserId: openid,
    fromUserName: user.nickname || '旅行者',
    fromUserAvatar: safeAvatar(user.avatar),
    toUserId,
    toUserName: toUserName || '',
    contactType: 'phone',
    contactValue: contactValue || '',
    message: message || '',
    status: 'pending',
    groupId,
    createdAt: now
  };

  // 申请人的记录（展示在"我发出的"）
  await db.collection('applies').add({
    data: { ...commonData, ownerId: openid, unread: false }
  });

  // 发起人的记录（展示在"我收到的"）
  await db.collection('applies').add({
    data: { ...commonData, ownerId: toUserId, unread: true }
  });

  return { success: true };
}

async function applyList(openid, data) {
  const { type = 'received' } = data;

  const res = await db.collection('applies')
    .where({ ownerId: openid })
    .orderBy('createdAt', 'desc')
    .get();

  // 按类型过滤
  const applies = (res.data || []).filter(item => {
    if (type === 'received') return item.ownerId === item.toUserId;
    return item.ownerId === item.fromUserId;
  });

  return { success: true, applies };
}

async function applyHandle(openid, data) {
  const { applyId, accept } = data;

  // 获取申请
  const applyRes = await db.collection('applies').doc(applyId).get();
  const apply = applyRes.data;

  // 验证权限
  if (apply.ownerId !== openid) {
    return { success: false, error: '无权处理该申请' };
  }

  // 更新申请状态（操作方已读）
  await db.collection('applies').doc(applyId).update({
    data: { status: accept ? 'accepted' : 'rejected', unread: false }
  });

  // 如果有 groupId，同步更新对方记录的状态和未读
  if (apply.groupId) {
    try {
      const peerRes = await db.collection('applies')
        .where({
          groupId: apply.groupId,
          _id: _.neq(applyId)
        })
        .get();
      for (const peer of peerRes.data || []) {
        await db.collection('applies').doc(peer._id).update({
          data: { status: accept ? 'accepted' : 'rejected', unread: true }
        });
      }
    } catch (err) {
      console.warn('同步更新对方记录状态失败', err);
    }
  }

  // 如果接受，加入行程
  if (accept && apply.fromUserId && apply.tripId) {
    await tripJoin(apply.fromUserId, { tripId: apply.tripId });
  }

  return { success: true };
}

// 获取行程通知列表（包括收到和发出的申请）
async function applyNotifications(openid) {
  const receivedList = [];
  const sentList = [];

  // 根据 ownerId 查询（每人各拥有一条数据）
  const allRes = await db.collection('applies')
    .where({ ownerId: openid })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  // 按类型拆分：ownerId === toUserId 为我收到的，否则为我发出的
  const receivedItems = [];
  const sentItems = [];
  for (const item of allRes.data || []) {
    if (item.ownerId === item.toUserId) {
      receivedItems.push(item);
    } else {
      sentItems.push(item);
    }
  }

  // 收集云存储头像文件ID
  const fileIDs = [];
  [...receivedItems, ...sentItems].forEach(item => {
    if (item.fromUserAvatar && item.fromUserAvatar.startsWith('cloud://')) {
      fileIDs.push(item.fromUserAvatar);
    }
  });

  // 获取临时链接
  let avatarMap = {};
  if (fileIDs.length > 0) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: fileIDs });
      if (urlRes.fileList) {
        urlRes.fileList.forEach(item => {
          if (item.tempFileURL) {
            avatarMap[item.fileID] = item.tempFileURL;
          }
        });
      }
    } catch (err) {
      console.warn('获取头像临时链接失败', err);
    }
  }

  // 处理收到的通知
  for (const item of receivedItems) {
    let avatar = item.fromUserAvatar || '';
    if (avatar && avatar.startsWith('cloud://') && avatarMap[avatar]) {
      avatar = avatarMap[avatar];
    }
    if (avatar && !avatar.startsWith('http')) {
      avatar = '';
    }

    // 获取行程详情
    let tripData = null;
    let placeCoverImage = '';
    if (item.tripId) {
      try {
        const tripRes = await db.collection('trips').doc(item.tripId).get();
        if (tripRes.data) {
          tripData = tripRes.data;
        }
      } catch (err) {
        console.warn('获取行程详情失败', err);
      }
    }
    // 用 trip 的 placeId 或 apply 记录中存储的 placeId 查封面图
    const effectivePlaceId = tripData?.placeId || item.placeId || '';
    if (effectivePlaceId) {
      try {
        const attrRes = await db.collection('quick_attractions').doc(effectivePlaceId).get();
        if (attrRes.data) {
          placeCoverImage = attrRes.data.coverImage || attrRes.data.image || '';
        }
      } catch (err) {
        console.warn('获取景点封面失败', err);
      }
    }

    if (item.status === 'quit') {
      receivedList.push({
        _id: item._id,
        type: 'received',
        userName: item.fromUserName || '旅行者',
        fromUserAvatar: avatar,
        headerTitle: (item.fromUserName || '旅行者') + ' 退出了您的行程',
        headerMeta: item.placeName || '行程',
        timeAgo: formatTimeAgo(item.createdAt),
        contactType: 'phone',
        contactValue: '',
        introduction: '',
        isHandled: true,
        status: 'quit',
        statusText: '已退出',
        tripId: item.tripId,
        placeName: item.placeName || tripData?.placeName || '未知地点',
        placeId: tripData?.placeId || item.placeId || '',
        tripTitle: tripData?.tripTitle || '',
        placeCoverImage: placeCoverImage,
        tripDate: tripData?.date ? formatDate(tripData.date) : '待定',
        createdAt: item.createdAt
      });
    } else if (item.status === 'removed') {
      receivedList.push({
        _id: item._id,
        type: 'received',
        userName: item.fromUserName || '发起人',
        fromUserAvatar: avatar,
        headerTitle: '您已被移出行程',
        headerMeta: item.placeName || '行程',
        timeAgo: formatTimeAgo(item.createdAt),
        contactType: 'phone',
        contactValue: '',
        introduction: '',
        isHandled: true,
        status: 'removed',
        statusText: '已移除',
        tripId: item.tripId,
        placeName: item.placeName || tripData?.placeName || '未知地点',
        placeId: tripData?.placeId || item.placeId || '',
        tripTitle: tripData?.tripTitle || '',
        placeCoverImage: placeCoverImage,
        tripDate: tripData?.date ? formatDate(tripData.date) : '待定',
        createdAt: item.createdAt
      });
    } else if (item.status === 'cancelled') {
      receivedList.push({
        _id: item._id,
        type: 'received',
        userName: item.fromUserName || '发起人',
        fromUserAvatar: avatar,
        headerTitle: '行程已取消',
        headerMeta: item.placeName || '行程',
        timeAgo: formatTimeAgo(item.createdAt),
        contactType: 'phone',
        contactValue: '',
        introduction: '',
        isHandled: true,
        status: 'cancelled',
        statusText: '已取消',
        tripId: item.tripId,
        placeName: item.placeName || tripData?.placeName || '未知地点',
        placeId: tripData?.placeId || item.placeId || '',
        tripTitle: tripData?.tripTitle || '',
        placeCoverImage: placeCoverImage,
        tripDate: tripData?.date ? formatDate(tripData.date) : '待定',
        createdAt: item.createdAt
      });
    } else if (item.status === 'deleted') {
      receivedList.push({
        _id: item._id,
        type: 'received',
        userName: item.fromUserName || '发起人',
        fromUserAvatar: avatar,
        headerTitle: '行程已删除',
        headerMeta: item.placeName || '行程',
        timeAgo: formatTimeAgo(item.createdAt),
        contactType: 'phone',
        contactValue: '',
        introduction: '',
        isHandled: true,
        status: 'deleted',
        statusText: '已删除',
        tripId: item.tripId,
        placeName: item.placeName || tripData?.placeName || '未知地点',
        placeId: tripData?.placeId || item.placeId || '',
        tripTitle: tripData?.tripTitle || '',
        placeCoverImage: placeCoverImage,
        tripDate: tripData?.date ? formatDate(tripData.date) : '待定',
        createdAt: item.createdAt
      });
    } else {
      receivedList.push({
        _id: item._id,
        type: 'received',
        userName: item.fromUserName || '旅行者',
        fromUserAvatar: avatar,
        headerTitle: (item.fromUserName || '旅行者') + ' 申请加入您的行程',
        headerMeta: item.placeName || '行程',
        timeAgo: formatTimeAgo(item.createdAt),
        contactType: item.contactType || 'phone',
        contactValue: item.contactValue || '',
        introduction: item.message || '',
        isHandled: item.status !== 'pending',
        status: item.status === 'accepted' ? 'agreed' : item.status,
        statusText: item.status === 'accepted' ? '已同意' : (item.status === 'rejected' ? '已拒绝' : ''),
        tripId: item.tripId,
        placeName: item.placeName || tripData?.placeName || '未知地点',
        placeId: tripData?.placeId || '',
        tripTitle: tripData?.tripTitle || '',
        placeCoverImage: placeCoverImage,
        tripDate: tripData?.date ? formatDate(tripData.date) : '待定',
        createdAt: item.createdAt
      });
    }
  }

  // 处理发出的申请
  for (const item of sentItems) {
    let tripData = null;
    let creatorPhone = '';
    let creatorWechat = '';
    let placeCoverImage = '';

    if (item.tripId) {
      try {
        const tripRes = await db.collection('trips').doc(item.tripId).get();
        if (tripRes.data) {
          tripData = tripRes.data;
          if (item.status === 'accepted' && tripData.creatorId) {
            const userRes = await db.collection('users').where({
              openid: tripData.creatorId
            }).get();
            if (userRes.data && userRes.data[0]) {
              creatorPhone = userRes.data[0].phone || '';
              creatorWechat = userRes.data[0].wechat || creatorPhone;
            }
          }
        }
      } catch (err) {
        console.warn('获取行程详情失败', err);
      }
    }
    const effectivePlaceId = tripData?.placeId || item.placeId || '';
    if (effectivePlaceId) {
      try {
        const attrRes = await db.collection('quick_attractions').doc(effectivePlaceId).get();
        if (attrRes.data) {
          placeCoverImage = attrRes.data.coverImage || attrRes.data.image || '';
        }
      } catch (err) {
        console.warn('获取景点封面失败', err);
      }
    }

    const status = item.status || 'pending';
    const statusText = status === 'pending' ? '申请中' :
                      (status === 'accepted' ? '已同意' : '已拒绝');

    sentList.push({
      _id: item._id,
      type: 'sent',
      tripId: item.tripId,
      placeName: item.placeName || tripData?.placeName || '未知地点',
      placeId: tripData?.placeId || item.placeId || '',
      tripTitle: tripData?.tripTitle || '',
      placeCoverImage: placeCoverImage,
      creatorName: item.toUserName || tripData?.creatorName || '旅行者',
      tripDate: tripData?.date ? formatDate(tripData.date) : '待定',
      status: status,
      statusText: statusText,
      message: item.message || '',
      applyTime: formatApplyTime(item.createdAt),
      creatorPhone: creatorPhone,
      creatorWechat: creatorWechat,
      createdAt: item.createdAt
    });
  }

  // 合并并按时间排序
  const notifications = [...receivedList, ...sentList].sort((a, b) => {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return { success: true, notifications };
}

// 删除申请通知
async function applyDelete(openid, data) {
  const { applyId } = data;

  if (!applyId) {
    return { success: false, error: '申请ID不能为空' };
  }

  // 获取申请记录
  const applyRes = await db.collection('applies').doc(applyId).get();
  const apply = applyRes.data;

  if (!apply) {
    return { success: false, error: '申请记录不存在' };
  }

  // 验证权限
  if (apply.ownerId !== openid) {
    return { success: false, error: '无权删除此通知' };
  }

  // 删除记录
  await db.collection('applies').doc(applyId).remove();

  return { success: true };
}

// 取消申请
async function applyCancel(openid, data) {
  const { applyId } = data;

  if (!applyId) {
    return { success: false, error: '申请ID不能为空' };
  }

  // 获取申请记录
  const applyRes = await db.collection('applies').doc(applyId).get();
  const apply = applyRes.data;

  if (!apply) {
    return { success: false, error: '申请记录不存在' };
  }

  // 验证权限
  if (apply.ownerId !== openid) {
    return { success: false, error: '无权取消此申请' };
  }

  // 更新状态为已取消（操作方已读）
  await db.collection('applies').doc(applyId).update({
    data: { status: 'cancelled', unread: false }
  });

  // 如果有 groupId，同步更新对方记录的状态和未读
  if (apply.groupId) {
    try {
      const peerRes = await db.collection('applies')
        .where({
          groupId: apply.groupId,
          _id: _.neq(applyId)
        })
        .get();
      for (const peer of peerRes.data || []) {
        await db.collection('applies').doc(peer._id).update({
          data: { status: 'cancelled', unread: true }
        });
      }
    } catch (err) {
      console.warn('同步更新对方记录状态失败', err);
    }
  }

  return { success: true };
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

// 格式化申请时间
function formatApplyTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 格式化时间为"xx前"
function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString();
}

// 获取未读消息数量
async function applyUnreadCount(openid) {
  if (!openid) {
    return { success: false, error: '用户未登录' };
  }

  try {
    const res = await db.collection('applies')
      .where({
        ownerId: openid,
        unread: true
      })
      .count();

    return { success: true, count: res.total || 0 };
  } catch (err) {
    console.error('获取未读消息数量失败', err);
    return { success: false, error: err.message };
  }
}

// 标记所有通知为已读
async function applyMarkRead(openid) {
  if (!openid) {
    return { success: false, error: '用户未登录' };
  }

  try {
    await db.collection('applies')
      .where({ ownerId: openid, unread: true })
      .update({ data: { unread: false } });

    return { success: true };
  } catch (err) {
    console.error('标记已读失败', err);
    return { success: false, error: err.message };
  }
}

// ========== 想去相关 ==========

async function wantToggle(openid, data) {
  const { placeId } = data;
  
  // 获取地点
  const placeRes = await db.collection('places').doc(placeId).get();
  const place = placeRes.data;
  
  // 检查是否已标记
  const existWant = await db.collection('wants')
    .where({ placeId, userId: openid })
    .get();
  
  if (existWant.data.length > 0) {
    // 取消
    await db.collection('wants').doc(existWant.data[0]._id).remove();
    await db.collection('places').doc(placeId).update({
      data: { wantCount: _.inc(-1) }
    });
    return { success: true, wanted: false };
  }
  
  // 添加
  await db.collection('wants').add({
    data: {
      placeId,
      placeName: place.name,
      userId: openid,
      createdAt: Date.now()
    }
  });
  
  await db.collection('places').doc(placeId).update({
    data: { wantCount: _.inc(1) }
  });
  
  return { success: true, wanted: true };
}

async function wantList(openid) {
  const res = await db.collection('wants')
    .where({ userId: openid })
    .orderBy('createdAt', 'desc')
    .get();
  
  return { success: true, wants: res.data };
}

// ========== 消息相关 ==========

async function messageSend(openid, data) {
  const { toUserId, content, type = 'text', conversationId } = data;
  
  // 获取用户信息
  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];
  
  const newMessage = {
    conversationId,
    fromUserId: openid,
    fromUserName: user.nickname,
    fromUserAvatar: safeAvatar(user.avatar),
    toUserId,
    content,
    type,
    read: false,
    createdAt: Date.now()
  };
  
  const res = await db.collection('messages').add({ data: newMessage });
  newMessage._id = res._id;
  
  return { success: true, message: newMessage };
}

async function messageList(openid, data) {
  const { conversationId, page = 1, pageSize = 50 } = data;
  
  const res = await db.collection('messages')
    .where({ conversationId })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  return { success: true, messages: res.data.reverse() };
}

async function messageRead(messageId) {
  await db.collection('messages').doc(messageId).update({
    data: { read: true }
  });
  
  return { success: true };
}

// ========== 评论相关 ==========

async function commentCreate(openid, data) {
  const { placeId, content, rating, images } = data;
  
  // 获取地点
  const placeRes = await db.collection('places').doc(placeId).get();
  const place = placeRes.data;
  
  // 获取用户信息
  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];
  
  const newComment = {
    placeId,
    placeName: place.name,
    userId: openid,
    userName: user.nickname,
    userAvatar: safeAvatar(user.avatar),
    content,
    rating: rating || 5,
    images: images || [],
    likes: 0,
    createdAt: Date.now()
  };
  
  const res = await db.collection('comments').add({ data: newComment });
  newComment._id = res._id;
  
  return { success: true, comment: newComment };
}

async function commentList(placeId) {
  const res = await db.collection('comments')
    .where({ placeId })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  return { success: true, comments: res.data };
}

// ========== Banner相关 ==========

async function bannerList() {
  const res = await db.collection('banners')
    .orderBy('sort', 'asc')
    .limit(10)
    .get();

  return { success: true, banners: res.data };
}

// ========== 景点相关 ==========

async function attractionsList() {
  try {
    const res = await db.collection('quick_attractions')
      .limit(200)
      .get();

    const attractions = res.data || [];
    return { success: true, attractions };
  } catch (err) {
    console.error('获取景点列表失败:', err);
    return { success: false, error: err.message };
  }
}

async function attractionsGet(placeId) {
  if (!placeId) {
    return { success: false, error: '景点ID不能为空' };
  }

  try {
    const res = await db.collection('quick_attractions').doc(placeId).get();
    return { success: true, place: res.data };
  } catch (err) {
    console.error('获取景点详情失败:', err);
    return { success: false, error: err.message };
  }
}

// ========== 用户上传景点相关 ==========

async function userSpotsCreate(openid, data) {
  const { placeName, location, coverImage } = data;

  if (!placeName || !placeName.trim()) {
    return { success: false, error: '地点名称不能为空' };
  }

  if (!location || !location.trim()) {
    return { success: false, error: '所在地方不能为空' };
  }

  const newSpot = {
    placeName: placeName.trim(),
    location: location.trim(),
    coverImage: coverImage || '',
    creatorId: openid || '',
    status: 'pending',
    createdAt: Date.now()
  };

  const res = await db.collection('user_spots').add({ data: newSpot });
  newSpot._id = res._id;

  return { success: true, spot: newSpot };
}

// ========== AI 生图相关 ==========

function getOpenAIConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    responsesModel: process.env.OPENAI_RESPONSES_MODEL || 'gpt-4.1-mini',
    serviceUrl: process.env.AI_IMAGE_SERVICE_URL || '',
    serviceSecret: process.env.AI_IMAGE_SERVICE_SECRET || ''
  };
}

function mapImageSize(ratio) {
  const sizeMap = {
    '1:1': '1024x1024',
    '3:4': '1024x1536',
    '4:3': '1536x1024',
    '9:16': '1024x1536'
  };
  return sizeMap[ratio] || '1024x1024';
}

function requestOpenAI(method, path, payload, apiKey, timeoutMs = 25000) {
  const body = payload ? JSON.stringify(payload) : '';

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path,
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          reject(new Error(`OpenAI 返回异常：${text.slice(0, 200)}`));
          return;
        }

        if (res.statusCode >= 400) {
          reject(new Error(parsed.error && parsed.error.message ? parsed.error.message : 'OpenAI 请求失败'));
          return;
        }

        resolve(parsed);
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('OpenAI 请求超时，请稍后重试'));
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function requestJsonUrl(method, url, payload, headers = {}, timeoutMs = 25000) {
  const body = payload ? JSON.stringify(payload) : '';
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      port: parsedUrl.port || 443,
      method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          reject(new Error(`AI 服务返回异常：${text.slice(0, 200)}`));
          return;
        }

        if (res.statusCode >= 400) {
          reject(new Error(`AI 服务请求失败(${res.statusCode}): ${parsed.error || parsed.message || text.slice(0, 120)}`));
          return;
        }

        resolve(parsed);
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('AI 服务请求超时'));
    });
    req.on('error', (err) => {
      reject(new Error(`AI 服务连接失败: ${err.message}`));
    });
    if (body) req.write(body);
    req.end();
  });
}

function getFileExt(fileID) {
  const clean = String(fileID || '').split('?')[0];
  const matched = clean.match(/\.([a-zA-Z0-9]+)$/);
  return matched ? matched[1].toLowerCase() : 'jpg';
}

function getMimeType(ext) {
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp'
  };
  return map[ext] || 'image/jpeg';
}

function getMimeTypeFromImageBuffer(buffer, fallbackExt = 'jpg') {
  if (buffer && buffer.length >= 12) {
    if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
      return 'image/png';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      return 'image/jpeg';
    }
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      return 'image/webp';
    }
  }
  return getMimeType(fallbackExt);
}

function sanitizeAiImageFileName(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function buildAiImageGeneratedCloudPath(responseId) {
  const fileName = sanitizeAiImageFileName(responseId);
  return fileName ? `ai-images/${fileName}.png` : '';
}

function getImageMeta(buffer, contentType = '') {
  const meta = {
    width: 0,
    height: 0,
    format: contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png',
    bytes: buffer ? buffer.length : 0
  };

  if (!buffer || buffer.length < 24) {
    return meta;
  }

  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    meta.format = 'png';
    meta.width = buffer.readUInt32BE(16);
    meta.height = buffer.readUInt32BE(20);
    return meta;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    meta.format = 'jpg';
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset];
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        meta.height = buffer.readUInt16BE(offset + 3);
        meta.width = buffer.readUInt16BE(offset + 5);
        return meta;
      }
      offset += length;
    }
  }

  return meta;
}

function getEffectiveAiImagePrompt(data = {}) {
  const prompt = String(data.prompt || '').trim();
  if (prompt) return prompt;
  return data.mode === 'image' ? '请基于参考图生成一张高质量图片' : '';
}

function getEffectiveAiImageStyle(data = {}) {
  const style = String(data.style || '').trim();
  if (!style) return '';
  if (['none', '无', '不要', '不加风格', '无风格'].includes(style)) return '';
  return style;
}

function isAiImageLoadingStatus(status) {
  return ['queued', 'pending', 'in_progress', 'processing', 'running', 'submitted'].includes(status || '');
}

function normalizeAiImageUrl(url) {
  if (!url) return '';
  const value = String(url).trim();
  if (!value) return '';
  if (value.startsWith('https://') || value.startsWith('http://') || value.startsWith('cloud://')) {
    return value;
  }
  if (value.startsWith('//')) {
    return `https:${value}`;
  }
  if (value.includes('.') && value.includes('/')) {
    return `https://${value}`;
  }
  return value;
}

function normalizeAiImageItem(image = {}, fallback = {}) {
  const key = image.key || image.fileID || '';
  const cloudPath = image.cloudPath || '';
  const publicUrl = normalizeAiImageUrl(image.publicUrl || image.publicURL || '');
  const signedUrl = normalizeAiImageUrl(image.signedUrl || image.signedURL || image.tempFileURL || '');
  const url = normalizeAiImageUrl(image.url || signedUrl || publicUrl || '');
  const status = image.status || fallback.status || (url ? 'completed' : 'queued');

  return {
    id: image.id || image.imageId || `${fallback.taskId || ''}_0`,
    status,
    key,
    fileID: key,
    cloudPath,
    url,
    signedUrl,
    publicUrl,
    width: image.width || 0,
    height: image.height || 0,
    format: image.format || '',
    bytes: image.bytes || 0,
    error: image.error || ''
  };
}

function buildInitialAiImages(task = {}) {
  return [normalizeAiImageItem({}, {
    taskId: task.taskId,
    status: task.status || 'queued'
  })];
}

function buildCompletedAiImages(image, taskId) {
  return [normalizeAiImageItem({
    id: `${taskId || Date.now()}_0`,
    status: 'completed',
    key: image.fileID || image.key || '',
    fileID: image.fileID || image.key || '',
    cloudPath: image.cloudPath || '',
    url: image.tempFileURL || image.url || '',
    signedUrl: image.signedURL || image.signedUrl || image.tempFileURL || '',
    publicUrl: image.publicURL || image.publicUrl || '',
    width: image.width || 0,
    height: image.height || 0,
    format: image.format || '',
    bytes: image.bytes || 0
  }, { status: 'completed', taskId })];
}

function syncImagesStatus(images, status, error) {
  const list = images && images.length ? images : [normalizeAiImageItem({}, { status })];
  return list.map((image, index) => normalizeAiImageItem({
    ...image,
    id: image.id || `image_${index}`,
    status,
    error: status === 'failed' ? (error || image.error || '生成失败') : image.error
  }, { status }));
}

function buildImagePrompt(data) {
  const style = getEffectiveAiImageStyle(data);
  const parts = [
    getEffectiveAiImagePrompt(data),
    style ? `视觉风格：${style}` : '',
    '请生成适合在旅行社交小程序中展示的高质量图片。'
  ].filter(Boolean);
  return parts.join('\n');
}

async function callOpenAIImage(data, apiKey, model) {
  const prompt = buildImagePrompt(data);
  const size = mapImageSize(data.ratio);
  const input = [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }];

  if (data.mode === 'image') {
    if (!data.referenceFileID) {
      throw new Error('参考图片不能为空');
    }

    const downloadRes = await cloud.downloadFile({ fileID: data.referenceFileID });
    const ext = getFileExt(data.referenceFileID);
    const mimeType = getMimeTypeFromImageBuffer(downloadRes.fileContent, ext);
    const imageUrl = `data:${mimeType};base64,${downloadRes.fileContent.toString('base64')}`;
    input[0].content.push({ type: 'input_image', image_url: imageUrl });
  }

  return await requestOpenAI('POST', '/v1/responses', {
    model,
    input,
    background: true,
    tools: [{
      type: 'image_generation',
      model: getOpenAIConfig().imageModel,
      size,
      quality: 'high',
      output_format: 'png'
    }]
  }, apiKey);
}

async function createExternalAiImageTask(data, config) {
  const headers = {};
  if (config.serviceSecret) {
    headers['X-AI-Service-Secret'] = config.serviceSecret;
  }

  const payload = {
    mode: data.mode,
    prompt: getEffectiveAiImagePrompt(data),
    ratio: data.ratio,
    style: getEffectiveAiImageStyle(data)
  };

  if (data.mode === 'image') {
    const downloadRes = await cloud.downloadFile({ fileID: data.referenceFileID });
    payload.referenceImageBase64 = downloadRes.fileContent.toString('base64');
    payload.referenceMimeType = getMimeTypeFromImageBuffer(downloadRes.fileContent, getFileExt(data.referenceFileID));
  }

  return await requestJsonUrl('POST', `${config.serviceUrl.replace(/\/$/, '')}/v1/ai-image/tasks`, payload, headers, 30000);
}

async function getExternalAiImageTask(taskId, config) {
  const headers = {};
  if (config.serviceSecret) {
    headers['X-AI-Service-Secret'] = config.serviceSecret;
  }

  return await requestJsonUrl('GET', `${config.serviceUrl.replace(/\/$/, '')}/v1/ai-image/tasks/${encodeURIComponent(taskId)}`, null, headers, 20000);
}

async function getOpenAIResponse(responseId, apiKey) {
  return await requestOpenAI('GET', `/v1/responses/${encodeURIComponent(responseId)}`, null, apiKey, 20000);
}

function extractImageBase64FromResponse(response) {
  const output = response.output || [];

  for (const item of output) {
    if (item.type === 'image_generation_call' && item.result) {
      return item.result;
    }

    const content = item.content || [];
    for (const contentItem of content) {
      if (contentItem.type === 'image_generation_call' && contentItem.result) {
        return contentItem.result;
      }
    }
  }

  return '';
}

async function uploadGeneratedImage(openid, imageBase64, responseId = '') {
  const buffer = Buffer.from(imageBase64, 'base64');
  const meta = getImageMeta(buffer, 'image/png');
  const cloudPath = buildAiImageGeneratedCloudPath(responseId) ||
    `ai-images/${openid || 'anonymous'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer
  });

  const urlRes = await cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
  const file = urlRes.fileList && urlRes.fileList[0];

  return {
    fileID: uploadRes.fileID,
    cloudPath,
    tempFileURL: file && file.tempFileURL ? file.tempFileURL : '',
    width: meta.width,
    height: meta.height,
    format: meta.format,
    bytes: meta.bytes
  };
}

async function aiImageGenerate(openid, data = {}) {
  const config = getOpenAIConfig();
  const { apiKey, responsesModel, imageModel } = config;

  if (!apiKey && !config.serviceUrl) {
    return { success: false, error: '未配置 OPENAI_API_KEY' };
  }

  if (data.mode === 'text' && !getEffectiveAiImagePrompt(data)) {
    return { success: false, error: '创作描述不能为空' };
  }

  if (!['text', 'image'].includes(data.mode)) {
    return { success: false, error: '生成模式不正确' };
  }

  if (data.mode === 'image' && !data.referenceFileID) {
    return { success: false, error: '参考图片不能为空' };
  }

  const summary = await getAiImageSummaryData(openid);
  if (summary.remaining <= 0) {
    return { success: false, error: 'AI 生图次数已用完' };
  }

  if (config.serviceUrl) {
    let serviceRes;
    try {
      serviceRes = await createExternalAiImageTask(data, config);
    } catch (err) {
      console.error('创建外部 AI 生图任务失败:', err);
      return { success: false, error: err.message || '创建外部 AI 生图任务失败' };
    }

    await recordAiImageTask(openid, data, {
      taskId: serviceRes.taskId,
      status: serviceRes.status || 'queued',
      model: imageModel,
      external: true
    });

    return {
      success: true,
      taskId: serviceRes.taskId,
      status: serviceRes.status || 'queued',
      model: imageModel,
      external: true,
      quota: await getAiImageSummaryData(openid)
    };
  }

  const openaiRes = await callOpenAIImage(data, apiKey, responsesModel);

  try {
    await recordAiImageTask(openid, data, {
      taskId: openaiRes.id,
      status: openaiRes.status || 'queued',
      model: imageModel,
      external: false
    });
  } catch (err) {
    console.warn('保存 AI 生图记录失败:', err);
  }

  return {
    success: true,
    taskId: openaiRes.id,
    status: openaiRes.status || 'queued',
    model: imageModel,
    quota: await getAiImageSummaryData(openid)
  };
}

async function aiImageStatus(openid, data = {}) {
  const config = getOpenAIConfig();
  const { apiKey, imageModel } = config;
  const responseId = data.taskId || data.responseId;

  if (!apiKey && !config.serviceUrl) {
    return { success: false, error: '未配置 OPENAI_API_KEY' };
  }

  if (!responseId) {
    return { success: false, error: '任务ID不能为空' };
  }

  let record = null;
  try {
    const recordRes = await db.collection('ai_image_generations').where({ responseId }).limit(1).get();
    record = recordRes.data && recordRes.data[0] ? recordRes.data[0] : null;
  } catch (err) {
    console.warn('读取 AI 生图记录失败:', err);
  }

  if (config.serviceUrl) {
    let serviceRes;
    try {
      serviceRes = await getExternalAiImageTask(responseId, config);
    } catch (err) {
      console.error('查询外部 AI 生图任务失败:', err);
      return { success: false, error: err.message || '查询外部 AI 生图任务失败' };
    }

    if (serviceRes.status === 'failed') {
      return { success: false, status: 'failed', error: serviceRes.error || '生成任务失败' };
    }

    if (serviceRes.status === 'completed') {
      const image = {
        fileID: serviceRes.image && serviceRes.image.key ? serviceRes.image.key : '',
        tempFileURL: serviceRes.image && (serviceRes.image.signedUrl || serviceRes.image.url) ? (serviceRes.image.signedUrl || serviceRes.image.url) : '',
        publicURL: serviceRes.image && serviceRes.image.url ? serviceRes.image.url : '',
        signedURL: serviceRes.image && serviceRes.image.signedUrl ? serviceRes.image.signedUrl : '',
        width: serviceRes.image && serviceRes.image.width ? serviceRes.image.width : 0,
        height: serviceRes.image && serviceRes.image.height ? serviceRes.image.height : 0,
        format: serviceRes.image && serviceRes.image.format ? serviceRes.image.format : '',
        bytes: serviceRes.image && serviceRes.image.bytes ? serviceRes.image.bytes : 0
      };
      let charged = false;

      if (record && record._id && !record.chargedAt) {
        const now = Date.now();
        await chargeAiImageUsageIfNeeded(openid, record);
        charged = true;
        try {
          await db.collection('ai_image_generations').doc(record._id).update({
            data: {
              status: 'completed',
              images: buildCompletedAiImages(image, responseId),
              completedAt: now,
              chargedAt: now,
              updatedAt: now
            }
          });
        } catch (err) {
          console.warn('更新外部 AI 生图记录失败:', err);
        }
      }

      return {
        success: true,
        status: 'completed',
        image,
        model: imageModel,
        charged
      };
    }

    return {
      success: true,
      status: serviceRes.status || 'queued',
      taskId: responseId
    };
  }

  try {
    if (record && record.images && record.images[0] && record.images[0].key) {
      const urlRes = await cloud.getTempFileURL({ fileList: [record.images[0].key] });
      const file = urlRes.fileList && urlRes.fileList[0];
      let charged = false;
      if (!record.chargedAt) {
        await chargeAiImageUsageIfNeeded(openid, record);
        charged = true;
        try {
          await db.collection('ai_image_generations').doc(record._id).update({
            data: {
              chargedAt: Date.now(),
              updatedAt: Date.now()
            }
          });
        } catch (err) {
          console.warn('标记 AI 生图扣次失败:', err);
        }
      }
      return {
        success: true,
        status: 'completed',
        image: {
          fileID: record.images[0].key,
          tempFileURL: file && file.tempFileURL ? file.tempFileURL : '',
          width: record.images[0].width || 0,
          height: record.images[0].height || 0,
          format: record.images[0].format || '',
          bytes: record.images[0].bytes || 0
        },
        model: record.model || imageModel,
        charged
      };
    }
  } catch (err) {
    console.warn('读取 AI 生图记录失败:', err);
  }

  let response;
  try {
    response = await getOpenAIResponse(responseId, apiKey);
  } catch (err) {
    if (String(err.message || '').includes('超时')) {
      return {
        success: true,
        status: 'in_progress',
        taskId: responseId,
        message: '结果还在处理中'
      };
    }
    throw err;
  }

  if (response.status !== 'completed') {
    if (response.status === 'failed' || response.status === 'cancelled') {
      const message = response.error && response.error.message ? response.error.message : '生成任务失败';
      return { success: false, status: response.status, error: message };
    }

    return {
      success: true,
      status: response.status || 'queued',
      taskId: responseId
    };
  }

  const imageBase64 = extractImageBase64FromResponse(response);

  if (!imageBase64) {
    return { success: false, status: response.status, error: 'OpenAI 未返回图片数据' };
  }

  const image = await uploadGeneratedImage(openid, imageBase64, responseId);

  try {
    if (record && record._id) {
      let charged = false;
      const now = Date.now();
      if (!record.chargedAt) {
        await chargeAiImageUsageIfNeeded(openid, record);
        charged = true;
      }

      await db.collection('ai_image_generations').doc(record._id).update({
        data: {
          status: 'completed',
          images: buildCompletedAiImages(image, responseId),
          usage: response.usage || null,
          completedAt: now,
          chargedAt: record.chargedAt || now
        }
      });
      image.charged = charged;
    }
  } catch (err) {
    console.warn('更新 AI 生图记录失败:', err);
  }

  return {
    success: true,
    status: 'completed',
    image,
    model: record && record.model ? record.model : imageModel,
    usage: response.usage || null,
    charged: Boolean(image.charged)
  };
}

async function ensureAiImageQuota(openid) {
  const userId = openid || 'anonymous';
  const res = await db.collection('ai_image_quotas').where({ userId }).limit(1).get();

  if (res.data && res.data[0]) {
    const quota = res.data[0];
    if (!quota.appUserId || !quota.nickname || !quota.phoneMask) {
      const userInfo = await getAiImageQuotaUserInfo(userId);
      const patch = getAiImageQuotaUserInfoPatch(quota, userInfo);
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = Date.now();
        try {
          await db.collection('ai_image_quotas').doc(quota._id).update({ data: patch });
          return { ...quota, ...patch };
        } catch (err) {
          console.warn('同步 AI 生图额度用户信息失败:', err);
        }
      }
    }
    return quota;
  }

  const userInfo = await getAiImageQuotaUserInfo(userId);
  const quota = {
    userId,
    ...userInfo,
    total: AI_IMAGE_FREE_QUOTA,
    used: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const addRes = await db.collection('ai_image_quotas').add({ data: quota });
  quota._id = addRes._id;
  return quota;
}

async function getAiImageQuotaUserInfo(userId) {
  if (!userId || userId === 'anonymous') {
    return buildAiImageQuotaUserInfo();
  }

  try {
    const userRes = await db.collection('users').where(
      _.or(
        { openid: userId },
        { userId },
        { phone: userId },
        { phoneMask: userId }
      )
    ).limit(1).get();

    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    return user ? buildAiImageQuotaUserInfo(user) : buildAiImageQuotaUserInfo();
  } catch (err) {
    console.warn('读取 AI 生图额度用户信息失败:', err);
    return buildAiImageQuotaUserInfo();
  }
}

async function syncAiImageQuotaUserInfo(userId, user) {
  const quotaUserId = userId || (user && user.openid) || '';
  if (!quotaUserId || quotaUserId === 'anonymous') return;

  try {
    const userInfo = user ? buildAiImageQuotaUserInfo(user) : await getAiImageQuotaUserInfo(quotaUserId);
    if (!hasAiImageQuotaUserInfo(userInfo)) return;

    const quotaRes = await db.collection('ai_image_quotas')
      .where({ userId: quotaUserId })
      .limit(1)
      .get();
    const quota = quotaRes.data && quotaRes.data[0] ? quotaRes.data[0] : null;
    if (!quota || !quota._id) return;

    const patch = getAiImageQuotaUserInfoPatch(quota, userInfo);
    if (Object.keys(patch).length === 0) return;

    await db.collection('ai_image_quotas').doc(quota._id).update({
      data: {
        ...patch,
        updatedAt: Date.now()
      }
    });
  } catch (err) {
    console.warn('同步 AI 生图额度用户信息失败:', err);
  }
}

async function incrementAiImageUsage(openid) {
  const quota = await ensureAiImageQuota(openid);
  const used = normalizeAiImageQuotaNumber(quota.used, 0) + 1;
  await db.collection('ai_image_quotas').doc(quota._id).update({
    data: {
      used,
      updatedAt: Date.now()
    }
  });
  return { ...quota, used };
}

async function chargeAiImageUsageIfNeeded(openid, record) {
  if (!record || record.chargedAt) {
    return;
  }

  await incrementAiImageUsage(openid);
}

async function getAiImageSummaryData(openid) {
  const quota = await ensureAiImageQuota(openid);
  const userId = openid || 'anonymous';
  const generatedRes = await db.collection('ai_image_generations')
    .where({ userId, status: 'completed' })
    .count();
  const total = normalizeAiImageQuotaNumber(quota.total);
  const used = normalizeAiImageQuotaNumber(quota.used, 0);
  const generatedCount = generatedRes.total || 0;

  if (quota.used !== used || quota.total !== total) {
    try {
      await db.collection('ai_image_quotas').doc(quota._id).update({
        data: {
          total,
          used,
          updatedAt: Date.now()
        }
      });
    } catch (err) {
      console.warn('同步 AI 生图额度失败:', err);
    }
  }

  return {
    total,
    used,
    remaining: Math.max(0, total - used),
    generatedCount
  };
}

async function syncAiImageQuotaUsage(openid) {
  return await getAiImageSummaryData(openid);
}

async function aiImageSummary(openid) {
  return {
    success: true,
    summary: await getAiImageSummaryData(openid)
  };
}

function normalizeAiImagePackage(item = {}) {
  return {
    id: item.packageId || item._id || '',
    _id: item._id || '',
    packageId: item.packageId || '',
    title: item.title || '',
    desc: item.desc || '',
    price: typeof item.price === 'number' ? item.price : 0,
    imageCount: typeof item.imageCount === 'number' ? item.imageCount : 0,
    badge: item.badge || '',
    sort: typeof item.sort === 'number' ? item.sort : 0,
    enabled: item.enabled !== false
  };
}

async function aiImagePackages() {
  try {
    const res = await db.collection('ai_image_packages')
      .where({ enabled: true })
      .orderBy('sort', 'asc')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return {
      success: true,
      packages: (res.data || []).map(normalizeAiImagePackage)
    };
  } catch (err) {
    console.warn('读取 AI 生图套餐失败:', err);
    return {
      success: true,
      packages: []
    };
  }
}

async function getAiImagePackageById(packageId) {
  if (!packageId) return null;

  try {
    const docRes = await db.collection('ai_image_packages').doc(packageId).get();
    const doc = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
    if (doc && doc._id) return doc;
  } catch (err) {
    // 不是文档 _id 时继续按 packageId 查。
  }

  const res = await db.collection('ai_image_packages')
    .where({ packageId })
    .limit(1)
    .get();
  return res.data && res.data[0] ? res.data[0] : null;
}

async function aiImagePurchasePackage(openid, data = {}) {
  const userId = openid || 'anonymous';
  const pack = await getAiImagePackageById(data.packageId);

  if (!pack || pack.enabled === false) {
    return { success: false, error: '套餐不存在或已下架' };
  }

  const imageCount = Number(pack.imageCount || 0);
  if (!imageCount || imageCount <= 0) {
    return { success: false, error: '套餐图片数量配置不正确' };
  }

  const quota = await ensureAiImageQuota(userId);
  const beforeTotal = normalizeAiImageQuotaNumber(quota.total);
  const beforeUsed = normalizeAiImageQuotaNumber(quota.used, 0);
  const beforeRemaining = Math.max(0, beforeTotal - beforeUsed);

  if (beforeRemaining > 0) {
    return { success: false, error: '当前仍有剩余次数，无需充值' };
  }

  const afterTotal = imageCount;
  const afterUsed = 0;
  const now = Date.now();
  const orderNo = createAiImageOrderNo(now);
  const userInfo = {
    appUserId: quota.appUserId || '',
    nickname: quota.nickname || '',
    phone: quota.phone || '',
    phoneMask: quota.phoneMask || '',
    avatar: quota.avatar || ''
  };

  await db.collection('ai_image_quotas').doc(quota._id).update({
    data: {
      total: afterTotal,
      used: afterUsed,
      updatedAt: now
    }
  });

  await db.collection('ai_image_orders').add({
    data: {
      orderNo,
      userId,
      ...userInfo,
      packageId: pack._id,
      packageKey: pack.packageId || '',
      title: pack.title || '',
      price: typeof pack.price === 'number' ? pack.price : 0,
      imageCount,
      beforeTotal,
      beforeUsed,
      beforeRemaining,
      afterTotal,
      afterUsed,
      afterRemaining: Math.max(0, afterTotal - afterUsed),
      status: 'paid',
      payType: 'mock',
      createdAt: now,
      paidAt: now
    }
  });

  return {
    success: true,
    package: normalizeAiImagePackage(pack),
    summary: await getAiImageSummaryData(userId)
  };
}

function normalizeAiImageTemplate(item = {}) {
  return {
    id: item.templateId || item._id || '',
    _id: item._id || '',
    mode: item.mode === 'image' ? 'image' : 'text',
    title: item.title || '',
    desc: item.desc || '',
    badge: item.badge || '',
    ratio: item.ratio || '1:1',
    style: item.style || '',
    prompt: item.prompt || '',
    sort: typeof item.sort === 'number' ? item.sort : 0,
    enabled: item.enabled !== false,
    likeCount: item.likeCount || 0,
    dislikeCount: item.dislikeCount || 0,
    userVote: item.userVote || ''
  };
}

async function aiImageTemplates(openid, data = {}) {
  const mode = data.mode === 'image' ? 'image' : data.mode === 'text' ? 'text' : '';
  const where = { enabled: true };
  if (mode) where.mode = mode;

  try {
    const res = await db.collection('ai_image_templates')
      .where(where)
      .orderBy('sort', 'asc')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const templates = (res.data || []).map(normalizeAiImageTemplate);

    if (openid) {
      for (const template of templates) {
        try {
          const voteRes = await db.collection('ai_image_template_votes')
            .where({
              userId: openid,
              templateId: template._id
            })
            .limit(1)
            .get();
          template.userVote = voteRes.data && voteRes.data[0] ? voteRes.data[0].vote || '' : '';
        } catch (err) {
          console.warn('读取 AI 模板反馈失败:', err);
        }
      }
    }

    return {
      success: true,
      templates
    };
  } catch (err) {
    console.warn('读取 AI 生图模板失败:', err);
    return {
      success: true,
      templates: []
    };
  }
}

async function getAiImageTemplateById(templateId) {
  if (!templateId) return null;

  try {
    const docRes = await db.collection('ai_image_templates').doc(templateId).get();
    const doc = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
    if (doc && doc._id) return doc;
  } catch (err) {
    // 不是文档 _id 时继续按 templateId 查。
  }

  const res = await db.collection('ai_image_templates')
    .where({ templateId })
    .limit(1)
    .get();
  return res.data && res.data[0] ? res.data[0] : null;
}

async function aiImageTemplateVote(openid, data = {}) {
  const template = await getAiImageTemplateById(data.templateId);
  const vote = data.vote === 'dislike' ? 'dislike' : data.vote === 'like' ? 'like' : '';
  const userId = openid || 'anonymous';

  if (!template || !template._id) {
    return { success: false, error: '模板不存在' };
  }

  if (!vote) {
    return { success: false, error: '反馈类型不正确' };
  }

  const voteRes = await db.collection('ai_image_template_votes')
    .where({
      userId,
      templateId: template._id
    })
    .limit(1)
    .get();
  const existedVote = voteRes.data && voteRes.data[0] ? voteRes.data[0] : null;
  const updates = { updatedAt: Date.now() };
  let userVote = vote;

  if (!existedVote) {
    updates[vote === 'like' ? 'likeCount' : 'dislikeCount'] = _.inc(1);
    await db.collection('ai_image_template_votes').add({
      data: {
        userId,
        templateId: template._id,
        vote,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    });
  } else if (existedVote.vote === vote) {
    updates[vote === 'like' ? 'likeCount' : 'dislikeCount'] = _.inc(-1);
    userVote = '';
    await db.collection('ai_image_template_votes').doc(existedVote._id).remove();
  } else {
    updates[vote === 'like' ? 'likeCount' : 'dislikeCount'] = _.inc(1);
    if (existedVote.vote === 'like' || existedVote.vote === 'dislike') {
      updates[existedVote.vote === 'like' ? 'likeCount' : 'dislikeCount'] = _.inc(-1);
    }
    await db.collection('ai_image_template_votes').doc(existedVote._id).update({
      data: {
        vote,
        updatedAt: Date.now()
      }
    });
  }

  await db.collection('ai_image_templates').doc(template._id).update({ data: updates });
  const latest = await getAiImageTemplateById(template._id);

  return {
    success: true,
    templateId: template._id,
    likeCount: latest && latest.likeCount ? latest.likeCount : 0,
    dislikeCount: latest && latest.dislikeCount ? latest.dislikeCount : 0,
    userVote
  };
}

async function recordAiImageTask(openid, data, task) {
  const newRecord = {
    userId: openid || 'anonymous',
    responseId: task.taskId,
    status: task.status || 'queued',
    external: Boolean(task.external),
    mode: data.mode,
    prompt: getEffectiveAiImagePrompt(data),
    style: getEffectiveAiImageStyle(data),
    ratio: data.ratio || '',
    model: task.model || '',
    referenceFileID: data.referenceFileID || '',
    images: buildInitialAiImages(task),
    usage: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const res = await db.collection('ai_image_generations').add({ data: newRecord });
  newRecord._id = res._id;
  return newRecord;
}

async function syncAiImageRecord(openid, record) {
  if (!record || record.status === 'completed' || record.status === 'failed') {
    return record;
  }

  const statusRes = await aiImageStatus(openid, { taskId: record.responseId });

  if (!statusRes.success && statusRes.status !== 'failed') {
    return record;
  }

  const updates = {
    status: statusRes.status || (statusRes.success ? 'completed' : 'failed'),
    updatedAt: Date.now()
  };

  if (!statusRes.success) {
    updates.error = statusRes.error || '生成失败';
    updates.images = syncImagesStatus(record.images, 'failed', updates.error);
  } else if (isAiImageLoadingStatus(updates.status)) {
    updates.images = syncImagesStatus(record.images, updates.status);
  }

  if (statusRes.status === 'completed' && statusRes.image) {
    updates.status = 'completed';
    updates.images = buildCompletedAiImages(statusRes.image, record.responseId);
    updates.completedAt = Date.now();
    updates.chargedAt = record.chargedAt || Date.now();
    if (!record.chargedAt && !statusRes.charged) {
      await chargeAiImageUsageIfNeeded(openid, record);
    }
  }

  try {
    await db.collection('ai_image_generations').doc(record._id).update({ data: updates });
  } catch (err) {
    console.warn('同步 AI 生图记录失败:', err);
  }

  return { ...record, ...updates };
}

async function aiImageList(openid) {
  const userId = openid || 'anonymous';
  const res = await db.collection('ai_image_generations')
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const items = [];
  for (const record of res.data || []) {
    const synced = await syncAiImageRecord(openid, record);
    items.push(formatAiImageRecord(synced));
  }

  return {
    success: true,
    summary: await getAiImageSummaryData(openid),
    images: items
  };
}

function normalizeAiImageCloudFileID(value) {
  if (!value || typeof value !== 'string') return '';
  let fileID = value.trim().split('?')[0];
  if (!fileID) return '';

  if (fileID.startsWith('//')) {
    fileID = `https:${fileID}`;
  }

  if (fileID.startsWith('https://') || fileID.startsWith('http://')) {
    try {
      const parsed = new URL(fileID);
      const pathname = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
      if (pathname.startsWith('ai-images/') || pathname.startsWith('ai-references/')) {
        return `cloud://${DEFAULT_CLOUD_ENV_ID}.${DEFAULT_CLOUD_STORAGE_BUCKET}/${pathname}`;
      }
    } catch (err) {
      return '';
    }
    return '';
  }

  if (fileID.startsWith('cloud://')) {
    const path = fileID.replace(/^cloud:\/\/[^/]+\//, '');
    if (path.startsWith('ai-images/') || path.startsWith('ai-references/')) {
      return fileID;
    }
    return '';
  }

  if (fileID.startsWith('ai-images/') || fileID.startsWith('ai-references/')) {
    return `cloud://${DEFAULT_CLOUD_ENV_ID}.${DEFAULT_CLOUD_STORAGE_BUCKET}/${fileID}`;
  }

  return '';
}

function collectAiImageCloudFileIDs(record = {}, candidates = []) {
  const fileIDs = [];
  const addFileID = (value) => {
    const fileID = normalizeAiImageCloudFileID(value);
    if (fileID && !fileIDs.includes(fileID)) {
      fileIDs.push(fileID);
    }
  };

  addFileID(buildAiImageGeneratedCloudPath(record.responseId));
  addFileID(record.generatedFileID);
  addFileID(record.fileID);
  candidates.forEach(addFileID);
  addFileID(record.referenceFileID);
  (record.images || []).forEach((image) => {
    addFileID(image.key);
    addFileID(image.fileID);
    addFileID(image.cloudPath);
    addFileID(image.url);
    addFileID(image.signedUrl);
    addFileID(image.publicUrl);
  });

  return fileIDs;
}

function isCloudDeleteSuccess(item = {}) {
  const message = String(`${item.status || ''} ${item.code || ''} ${item.errMsg || ''} ${item.message || ''}`).toLowerCase();
  return item.status === 0 ||
    item.status === '0' ||
    item.code === 'SUCCESS' ||
    item.code === 'OK' ||
    item.success === true ||
    String(item.errMsg || '').toLowerCase().includes('ok') ||
    message.includes('-503003') ||
    message.includes('not exist') ||
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('no such file');
}

async function deleteAiImageCloudFiles(fileIDs) {
  if (!fileIDs.length) {
    return { deletedFiles: 0 };
  }

  const failed = [];

  for (let i = 0; i < fileIDs.length; i += 50) {
    const fileList = fileIDs.slice(i, i + 50);
    const res = await cloud.deleteFile({ fileList });
    const resultList = res.fileList || [];

    fileList.forEach((fileID, index) => {
      const item = resultList[index] || {};
      if (!isCloudDeleteSuccess(item)) {
        failed.push({
          fileID,
          status: item.status,
          code: item.code,
          errMsg: item.errMsg || item.message || ''
        });
      }
    });
  }

  if (failed.length > 0) {
    const first = failed[0];
    const detail = first.errMsg || first.code || first.status || 'unknown';
    const error = new Error(`云存储文件删除失败：${detail}`);
    error.failedFiles = failed;
    throw error;
  }

  return { deletedFiles: fileIDs.length };
}

async function aiImageDelete(openid, data = {}) {
  const userId = openid || 'anonymous';
  const id = data.id || data._id || data.taskId || data.responseId;
  const candidateFileIDs = Array.isArray(data.fileIDs) ? data.fileIDs : [];

  if (!id) {
    return { success: false, error: '作品ID不能为空' };
  }

  let record = null;

  try {
    const docRes = await db.collection('ai_image_generations').doc(id).get();
    const doc = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
    if (doc) {
      record = {
        ...doc,
        _id: doc._id || id
      };
    }
  } catch (err) {
    // 不是文档 _id 时继续按 responseId 查询。
  }

  if (!record) {
    const res = await db.collection('ai_image_generations')
      .where({
        userId,
        responseId: id
      })
      .limit(1)
      .get();
    record = res.data && res.data[0] ? res.data[0] : null;
  }

  if (!record || !record._id) {
    return { success: false, error: '作品不存在' };
  }

  if (record.userId !== userId) {
    return { success: false, error: '无权删除该作品' };
  }

  const fileIDs = collectAiImageCloudFileIDs(record, candidateFileIDs);
  let deleteResult = { deletedFiles: 0 };
  if (fileIDs.length > 0) {
    try {
      deleteResult = await deleteAiImageCloudFiles(fileIDs);
    } catch (err) {
      console.warn('删除 AI 作品云存储文件失败:', err);
      return {
        success: false,
        error: err.message || '云存储文件删除失败，请稍后重试',
        fileIDs,
        failedFiles: err.failedFiles || []
      };
    }
  }

  await db.collection('ai_image_generations').doc(record._id).remove();

  return {
    success: true,
    deletedId: record._id,
    deletedFiles: deleteResult.deletedFiles,
    summary: await getAiImageSummaryData(openid)
  };
}

function formatAiImageRecord(record) {
  const images = (record.images && record.images.length ? record.images : buildInitialAiImages({
    taskId: record.responseId,
    status: record.status || 'queued'
  })).map((image, index) => normalizeAiImageItem({
    ...image,
    id: image.id || `${record.responseId || record._id || 'image'}_${index}`,
    status: image.status || record.status || 'queued',
    error: image.error || record.error || ''
  }, {
    taskId: record.responseId,
    status: record.status || 'queued'
  }));
  const firstImage = images[0] || {};

  return {
    _id: record._id,
    taskId: record.responseId,
    status: record.status || 'queued',
    mode: record.mode || 'text',
    prompt: record.prompt || '',
    style: record.style || '',
    ratio: record.ratio || '',
    referenceFileID: record.referenceFileID || '',
    imageUrl: firstImage.signedUrl || firstImage.url || firstImage.publicUrl || '',
    publicUrl: firstImage.publicUrl || '',
    images,
    createdAt: record.createdAt || 0,
    completedAt: record.completedAt || 0,
    error: record.error || ''
  };
}

// ========== 反馈相关 ==========

async function feedbackCreate(openid, data) {
  const { title, content, contact } = data;

  if (!content || !content.trim()) {
    return { success: false, error: '详细描述不能为空' };
  }

  // 获取用户信息
  let userInfo = null;
  if (openid) {
    try {
      const userRes = await db.collection('users').where({ openid }).get();
      if (userRes.data.length > 0) {
        userInfo = {
          nickname: userRes.data[0].nickname,
          avatar: safeAvatar(userRes.data[0].avatar)
        };
      }
    } catch (err) {
      console.warn('获取用户信息失败', err);
    }
  }

  const newFeedback = {
    title: title ? title.trim() : '',
    content: content.trim(),
    contact: contact ? contact.trim() : '',
    userId: openid || '',
    userInfo: userInfo,
    status: 'pending',
    createdAt: Date.now()
  };

  const res = await db.collection('feedbacks').add({ data: newFeedback });
  newFeedback._id = res._id;

  return { success: true, feedback: newFeedback };
}
