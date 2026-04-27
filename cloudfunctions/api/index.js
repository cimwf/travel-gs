// 云函数：api - 统一数据接口
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const crypto = require('./utils/crypto');

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
        return await tripList(data);
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

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (err) {
    console.error('云函数错误:', err);
    return { success: false, error: err.message };
  }
};

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

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  try {
    const statsRes = await db.collection('user_stats')
      .where({ type: eventType, date: dateStr })
      .get();

    if (statsRes.data.length > 0) {
      const existing = statsRes.data[0];
      // 检查 openid 是否已存在（去重）
      const openids = existing.openids || [];
      if (openids.includes(openid)) {
        return { success: true, duplicated: true };
      }

      // 新用户，更新计数和 openid 列表
      await db.collection('user_stats').doc(existing._id).update({
        data: {
          count: _.inc(1),
          openids: _.push(openid),
          updatedAt: Date.now()
        }
      });
    } else {
      // 创建今日统计记录
      await db.collection('user_stats').add({
        data: {
          type: eventType,
          date: dateStr,
          count: 1,
          openids: [openid],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      });
    }

    return { success: true };
  } catch (err) {
    console.error('记录事件失败:', err);
    return { success: false, error: err.message };
  }
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

  if (!phone) {
    return { success: false, error: '手机号不能为空' };
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

  // 验证密码格式（8-20位，包含字母和数字）
  if (!/^(?=.*[a-zA-Z])(?=.*\d).{8,20}$/.test(plainPassword)) {
    return { success: false, error: '密码格式不正确，需8-20位且包含字母和数字' };
  }

  // 检查手机号是否已注册
  const existRes = await db.collection('users').where({ phone }).get();
  if (existRes.data.length > 0) {
    return { success: false, error: '该手机号已注册' };
  }

  // 生成默认昵称
  const defaultNickname = nickname || '用户' + phone.slice(-4);

  // 哈希密码
  const hashedPassword = await crypto.hashPassword(plainPassword);

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
    avatar: avatar || '',
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

  // 记录每日新增用户统计
  await recordNewUser();

  // 返回用户信息（不返回密码）
  const safeUser = { ...newUser };
  delete safeUser.password;
  return { success: true, user: safeUser };
}

// 记录每日新增用户统计
async function recordNewUser() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  try {
    const statsRes = await db.collection('user_stats')
      .where({ date: dateStr, type: 'newUser' })
      .get();

    if (statsRes.data.length > 0) {
      // 更新今日新增用户数
      await db.collection('user_stats').doc(statsRes.data[0]._id).update({
        data: {
          count: _.inc(1),
          updatedAt: Date.now()
        }
      });
    } else {
      // 创建今日统计记录
      await db.collection('user_stats').add({
        data: {
          type: 'newUser',
          date: dateStr,
          count: 1,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      });
    }
  } catch (err) {
    console.error('记录新增用户统计失败:', err);
  }
}

async function userLogin(openid, data) {
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
    avatar: data.avatar || '',
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

  // 记录每日新增用户统计
  await recordNewUser();

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
  const safeUser = { ...user, openid: user.openid || currentOpenid };
  delete safeUser.password;
  return { success: true, user: safeUser };
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
    avatar: data.avatar,
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
    creatorAvatar: user.avatar,
    participants: data.participants || [{
      userId: openid,
      nickname: user.nickname,
      avatar: user.avatar
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

async function tripList(data) {
  const { placeId, status, date, excludeStatus, page = 1, pageSize = 8 } = data;
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
              avatar: user.avatar || '',
              nickname: user.nickname || '旅行者'
            };
          }
          if (user.userId) {
            userMap[user.userId] = {
              avatar: user.avatar || '',
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
              avatar: user.avatar || '',
              nickname: user.nickname || '旅行者'
            };
          }
          if (user.userId) {
            userMap[user.userId] = {
              avatar: user.avatar || '',
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
    avatar: user.avatar
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
  const quitterAvatar = quitter ? quitter.avatar : '';

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
      placeName: trip.placeName,
      fromUserId: openid,
      fromUserName: quitterName,
      fromUserAvatar: quitterAvatar,
      toUserId: trip.creatorId,
      type: 'quit',
      status: 'quit',
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
              avatar: user.avatar || '',
              nickname: user.nickname || '旅行者'
            };
          }
          if (user.userId) {
            userMap[user.userId] = {
              avatar: user.avatar || '',
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

    // 格式化日期
    let dateText = trip.date || '';
    if (trip.date) {
      try {
        const date = new Date(trip.date);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        dateText = `${month}月${day}日`;
      } catch (e) {}
    }

    return {
      _id: trip._id,
      title: trip.tripTitle || trip.placeName,
      placeName: trip.placeName,
      placeImage: placeImage,
      date: dateText,
      duration: trip.duration || '1天',
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
  const { tripId, message } = data;
  
  // 获取行程
  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  
  // 获取用户信息
  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];
  
  // 检查是否已申请
  const existApply = await db.collection('applies')
    .where({ tripId, userId: openid })
    .get();
  
  if (existApply.data.length > 0) {
    return { success: false, error: '您已申请过该行程' };
  }
  
  const newApply = {
    tripId,
    placeName: trip.placeName,
    userId: openid,
    userName: user.nickname,
    userAvatar: user.avatar,
    creatorId: trip.creatorId,
    message: message || '',
    status: 'pending',
    createdAt: Date.now()
  };
  
  const res = await db.collection('applies').add({ data: newApply });
  newApply._id = res._id;
  
  return { success: true, apply: newApply };
}

async function applyList(openid, data) {
  const { type = 'received' } = data; // received / sent
  
  const field = type === 'received' ? 'creatorId' : 'userId';
  const res = await db.collection('applies')
    .where({ [field]: openid })
    .orderBy('createdAt', 'desc')
    .get();
  
  return { success: true, applies: res.data };
}

async function applyHandle(openid, data) {
  const { applyId, accept } = data;

  // 获取申请
  const applyRes = await db.collection('applies').doc(applyId).get();
  const apply = applyRes.data;

  // 兼容两种字段格式：creatorId 或 toUserId
  const creatorId = apply.creatorId || apply.toUserId;
  // 验证权限
  if (creatorId !== openid) {
    return { success: false, error: '无权处理该申请' };
  }

  // 更新申请状态
  await db.collection('applies').doc(applyId).update({
    data: { status: accept ? 'accepted' : 'rejected' }
  });

  // 如果接受，加入行程
  if (accept) {
    // 兼容两种字段格式：userId 或 fromUserId
    const applicantId = apply.userId || apply.fromUserId;
    if (applicantId && apply.tripId) {
      await tripJoin(applicantId, { tripId: apply.tripId });
    }
  }

  return { success: true };
}

// 获取行程通知列表（包括收到和发出的申请）
async function applyNotifications(openid) {
  const receivedList = [];
  const sentList = [];

  // 并行查询
  const [receivedRes, sentRes] = await Promise.all([
    // 我收到的通知（别人申请加入/退出我的行程）
    db.collection('applies')
      .where({
        toUserId: openid,
        type: _.in(['apply', 'quit'])
      })
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get(),
    // 我发出的申请（我申请加入别人的行程）
    db.collection('applies')
      .where({
        fromUserId: openid,
        type: _.in(['apply'])
      })
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get()
  ]);

  // 收集云存储头像文件ID
  const fileIDs = [];
  (receivedRes.data || []).forEach(item => {
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

  // 处理收到的申请
  for (const item of receivedRes.data || []) {
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
          // 从 quick_attractions 获取景点封面（与 getAttractions 同源）
          if (tripData.placeId) {
            try {
              const attrRes = await db.collection('quick_attractions').doc(tripData.placeId).get();
              if (attrRes.data) {
                placeCoverImage = attrRes.data.coverImage || attrRes.data.image || '';
              }
            } catch (err) {
              console.warn('获取景点封面失败', err);
            }
          }
        }
      } catch (err) {
        console.warn('获取行程详情失败', err);
      }
    }

    if (item.type === 'quit') {
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
        placeId: tripData?.placeId || '',
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
  for (const item of sentRes.data || []) {
    let tripData = null;
    let creatorPhone = '';
    let creatorWechat = '';
    let placeCoverImage = '';

    if (item.tripId) {
      try {
        const tripRes = await db.collection('trips').doc(item.tripId).get();
        if (tripRes.data) {
          tripData = tripRes.data;
          // 从 quick_attractions 获取景点封面（与 getAttractions 同源）
          if (tripData.placeId) {
            try {
              const attrRes = await db.collection('quick_attractions').doc(tripData.placeId).get();
              if (attrRes.data) {
                placeCoverImage = attrRes.data.coverImage || attrRes.data.image || '';
              }
            } catch (err) {
              console.warn('获取景点封面失败', err);
            }
          }
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

    const status = item.status || 'pending';
    const statusText = status === 'pending' ? '申请中' :
                      (status === 'accepted' ? '已同意' : '已拒绝');

    sentList.push({
      _id: item._id,
      type: 'sent',
      tripId: item.tripId,
      placeName: item.placeName || tripData?.placeName || '未知地点',
      placeId: tripData?.placeId || '',
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

  // 兼容两种字段格式
  const fromUserId = apply.fromUserId || apply.userId;
  const toUserId = apply.toUserId || apply.creatorId;

  // 验证权限：只有发起人或接收人可以删除
  if (fromUserId !== openid && toUserId !== openid) {
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

  // 兼容两种字段格式
  const fromUserId = apply.fromUserId || apply.userId;

  // 验证权限：只有申请人可以取消
  if (fromUserId !== openid) {
    return { success: false, error: '无权取消此申请' };
  }

  // 更新状态为已取消
  await db.collection('applies').doc(applyId).update({
    data: { status: 'cancelled' }
  });

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
    // 查询未处理的申请数量
    const res = await db.collection('applies')
      .where({
        toUserId: openid,
        type: _.in(['apply']),
        status: 'pending'
      })
      .count();

    return { success: true, count: res.total || 0 };
  } catch (err) {
    console.error('获取未读消息数量失败', err);
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
    fromUserAvatar: user.avatar,
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
    userAvatar: user.avatar,
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
          avatar: userRes.data[0].avatar
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
