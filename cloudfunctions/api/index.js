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
      case 'trip/my':
        return await tripMy(openid);

      // ========== 申请相关 ==========
      case 'apply/create':
        return await applyCreate(openid, data);
      case 'apply/list':
        return await applyList(openid, data);
      case 'apply/handle':
        return await applyHandle(openid, data);

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
  } else if (openid) {
    // 通过 openid 查找
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
  const res = await db.collection('users').doc(userId).get();
  return { success: true, user: res.data };
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
  
  // 获取地点信息
  const placeRes = await db.collection('places').doc(data.placeId).get();
  const place = placeRes.data;
  
  const newTrip = {
    placeId: data.placeId,
    placeName: place.name,
    creatorId: openid,
    creatorName: user.nickname,
    creatorAvatar: user.avatar,
    date: data.date,
    hasCar: data.hasCar,
    currentCount: data.currentCount || 1,
    needCount: data.needCount,
    participants: [{
      userId: openid,
      nickname: user.nickname,
      avatar: user.avatar
    }],
    remark: data.remark || '',
    status: 'open',
    createdAt: Date.now()
  };
  
  const res = await db.collection('trips').add({ data: newTrip });
  newTrip._id = res._id;
  
  // 更新用户行程数
  await db.collection('users').doc(user._id).update({
    data: { trips: _.inc(1) }
  });
  
  return { success: true, trip: newTrip };
}

async function tripList(data) {
  const { placeId, status, date, page = 1, pageSize = 20 } = data;
  let query = db.collection('trips');
  
  const conditions = {};
  if (placeId) conditions.placeId = placeId;
  if (status) conditions.status = status;
  if (date) conditions.date = date;
  
  if (Object.keys(conditions).length > 0) {
    query = query.where(conditions);
  }
  
  const res = await query
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  return { success: true, trips: res.data };
}

async function tripGet(tripId) {
  const res = await db.collection('trips').doc(tripId).get();
  return { success: true, trip: res.data };
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
    currentCount: _.inc(1)
  };
  
  // 检查是否满员
  if (trip.currentCount + 1 >= trip.currentCount + trip.needCount) {
    updateData.status = 'full';
  }
  
  await db.collection('trips').doc(tripId).update({ data: updateData });
  
  return { success: true };
}

async function tripMy(openid) {
  const res = await db.collection('trips')
    .where({
      'participants.userId': openid
    })
    .orderBy('createdAt', 'desc')
    .get();
  
  return { success: true, trips: res.data };
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
  
  // 验证权限
  if (apply.creatorId !== openid) {
    return { success: false, error: '无权处理该申请' };
  }
  
  // 更新申请状态
  await db.collection('applies').doc(applyId).update({
    data: { status: accept ? 'accepted' : 'rejected' }
  });
  
  // 如果接受，加入行程
  if (accept) {
    await tripJoin(apply.userId, { tripId: apply.tripId });
  }
  
  return { success: true };
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
