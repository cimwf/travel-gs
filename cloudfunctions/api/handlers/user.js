const { db, _, cloud, crypto, normalizeAvatarForDb, isLocalTempFilePath } = require('../utils/shared');
const nodeCrypto = require('crypto');
const { setNotification, removeNotification } = require('./notification');
const tripMedia = require('./tripMedia');

const BEIJING_DISTRICTS = [
  '海淀区', '朝阳区', '丰台区', '东城区', '西城区', '石景山区', '门头沟区', '房山区',
  '通州区', '顺义区', '昌平区', '大兴区', '怀柔区', '平谷区', '密云区', '延庆区'
];

const PUBLIC_PROFILE_FIELDS = [
  'nickname', 'avatar', 'region', 'bio', 'background',
  'following', 'followers', 'receivedLikes', 'accountType', 'isOfficial'
];
const SELF_PROFILE_FIELDS = PUBLIC_PROFILE_FIELDS.concat([
  '_id', 'userId', 'gender', 'age', 'contactPhone', 'photos',
  'trips', 'places', 'tags', 'carOwner', 'createdAt'
]);

function pickUserFields(user, fields) {
  const result = {};
  fields.forEach(field => {
    if (user[field] !== undefined) result[field] = user[field];
  });
  return result;
}

function sanitizeUserSession(user) {
  const result = { ...(user || {}) };
  [
    'password', 'loginAttempts', 'lockedUntil', 'avatarObject',
    'phone', 'phoneMask'
  ].forEach(field => { delete result[field]; });
  return result;
}

function prepareUserUpdateData(updateData) {
  const dbUpdateData = { ...updateData };
  if (dbUpdateData.avatarObject) {
    // CloudBase otherwise flattens a plain object into avatarObject.* updates.
    // Existing first-login records may contain avatarObject: null, and MongoDB
    // cannot create nested fields below a null parent. Force a whole-field set.
    dbUpdateData.avatarObject = _.set(dbUpdateData.avatarObject);
  }
  return dbUpdateData;
}

function serializeUserProfile(user, isCurrentUser) {
  const result = pickUserFields(user, isCurrentUser ? SELF_PROFILE_FIELDS : PUBLIC_PROFILE_FIELDS);
  if (isCurrentUser && !result.contactPhone && user.phone) result.contactPhone = user.phone;
  // The public profile id is an opaque routing identifier. Do not expose the
  // database binding field name or the user's raw login/account fields.
  result.profileId = user.openid || user.userId || user._id || '';
  result.isCurrentUser = !!isCurrentUser;
  return result;
}

async function verifyUserAvatarUpload(openid, data) {
  const sessionId = String(data && data.avatarUploadSessionId || '');
  const media = data && data.avatarMedia;
  if (!sessionId && !media) return null;
  if (!sessionId || !media) throw new Error('头像上传会话无效');
  const verified = await tripMedia.verifyUploadSession(openid, {
    sessionId,
    tripId: '',
    purpose: 'user_avatar',
    media: [media]
  });
  return { sessionId, media: verified.media[0] };
}

async function finishUserAvatarUpload(upload, oldAvatarObject) {
  if (!upload) return;
  await tripMedia.consumeUploadSession(upload.sessionId);
  const oldAvatar = tripMedia.normalizeMediaObject(oldAvatarObject);
  if (oldAvatar && oldAvatar.key !== upload.media.key) {
    await tripMedia.cleanupCosMedia([oldAvatar], { reason: 'user_avatar_replaced' });
  }
}

function getFollowId(followerId, followingId) {
  return nodeCrypto.createHash('sha256')
    .update(String(followerId) + '\n' + String(followingId))
    .digest('hex')
    .slice(0, 32);
}

function isDocumentNotFoundError(error) {
  const code = error && (error.errCode || error.code);
  const message = String(error && (error.message || error.errMsg) || '').toLowerCase();
  return code === -502002 ||
    code === 'DATABASE_DOCUMENT_NOT_EXIST' ||
    message.indexOf('not exist') !== -1 ||
    message.indexOf('not found') !== -1;
}

async function getUsersByBinding(field, value) {
  if (!value) return [];
  const result = await db.collection('users')
    .where({ [field]: value })
    .limit(2)
    .get();
  return result.data || [];
}

function bindingConflict(error, code) {
  return {
    success: false,
    error,
    code: code || 'ACCOUNT_BINDING_CONFLICT'
  };
}

async function ensureWechatCanBind(openid, userId) {
  const users = await getUsersByBinding('openid', openid);
  if (users.length > 1) {
    return bindingConflict('当前微信的账号绑定异常，请联系客服处理', 'DUPLICATE_OPENID');
  }
  if (users.length === 1 && users[0]._id !== userId) {
    return bindingConflict('当前微信已绑定其他账号，请使用原账号登录');
  }
  return null;
}

async function getUserByAnyId(userId) {
  if (!userId) return null;
  try {
    const byDocId = await db.collection('users').doc(userId).get();
    if (byDocId && byDocId.data) return byDocId.data;
  } catch (err) {
    // Continue with public identifiers.
  }
  const fields = ['openid', 'userId'];
  for (const field of fields) {
    try {
      const result = await db.collection('users').where({ [field]: userId }).limit(1).get();
      if (result.data && result.data.length > 0) return result.data[0];
    } catch (err) {
      // Try the next identifier.
    }
  }
  return null;
}

async function refreshReceivedLikes(user) {
  if (!user || !user.openid) return user;
  try {
    const result = await db.collection('community_likes')
      .where({ postAuthorId: user.openid })
      .count();
    const receivedLikes = Math.max(0, Number(result.total) || 0);
    if (receivedLikes !== Math.max(0, Number(user.receivedLikes) || 0) && user._id) {
      await db.collection('users').doc(user._id).update({
        data: { receivedLikes, updatedAt: Date.now() }
      });
    }
    return { ...user, receivedLikes };
  } catch (err) {
    // Keep profiles usable before the likes collection exists or during a
    // temporary database failure; the cached value is only a fallback.
    console.warn('刷新用户获赞数失败:', err);
    return { ...user, receivedLikes: Math.max(0, Number(user.receivedLikes) || 0) };
  }
}

async function checkProfileText(openid, nickname, bio) {
  const content = [nickname, bio].filter(Boolean).join('\n');
  if (!content) return null;
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      version: 2,
      scene: 1,
      openid,
      content
    });
    const suggest = result && result.result && result.result.suggest;
    if (suggest !== 'pass') return '昵称或自我介绍包含不适宜内容';
    return null;
  } catch (err) {
    console.warn('用户资料文本安全检测失败:', err);
    return '资料安全检测暂时不可用，请稍后重试';
  }
}

function normalizeGender(value) {
  if (value === 1 || value === '1') return 'male';
  if (value === 2 || value === '2') return 'female';
  if (!value || value === 0 || value === '0') return 'secret';
  return value;
}

async function hasFollow(followerId, followingId) {
  try {
    const result = await db.collection('user_follows')
      .doc(getFollowId(followerId, followingId))
      .get();
    return !!(result && result.data);
  } catch (err) {
    if (isDocumentNotFoundError(err)) return false;
    throw err;
  }
}

async function resolveFollowAvatarUrls(users) {
  const fileIds = [...new Set((users || []).map(user => user.avatar)
    .filter(avatar => typeof avatar === 'string' && avatar.startsWith('cloud://')))];
  if (fileIds.length === 0) return;
  try {
    const result = await cloud.getTempFileURL({ fileList: fileIds });
    const urlMap = {};
    (result.fileList || []).forEach(item => {
      if (item.fileID && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL;
    });
    users.forEach(user => {
      if (urlMap[user.avatar]) user.avatar = urlMap[user.avatar];
    });
  } catch (err) {
    console.warn('关注列表头像临时链接解析失败:', err.message || err);
  }
}

async function userRegister(openid, data) {
  const { phone, password, encryptedPassword, key, iv, keyId, nickname, avatar, gender } = data;
  const avatarForDb = normalizeAvatarForDb(avatar);

  if (!phone) {
    return { success: false, error: '手机号不能为空' };
  }

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

    if (!/^(?=.*[a-zA-Z])(?=.*\d).{8,20}$/.test(plainPassword)) {
      return { success: false, error: '密码格式不正确，需8-20位且包含字母和数字' };
    }
  }

  const existRes = await db.collection('users').where({ phone }).get();
  if (existRes.data.length > 0) {
    return { success: false, error: '该手机号已注册' };
  }

  const bindingError = await ensureWechatCanBind(openid, '');
  if (bindingError) return bindingError;

  const defaultNickname = nickname || '用户' + phone.slice(-4);

  let hashedPassword = '';
  if (!isPhoneAuth) {
    hashedPassword = await crypto.hashPassword(plainPassword);
  }

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

  const safeUser = sanitizeUserSession(newUser);
  return { success: true, user: safeUser };
}

async function userLogin(openid, data) {
  const avatarUpload = await verifyUserAvatarUpload(openid, data);
  const avatarForDb = avatarUpload ? avatarUpload.media.url : normalizeAvatarForDb(data.avatar);

  const userRes = await db.collection('users').where({ openid }).limit(2).get();

  if (userRes.data.length > 1) {
    return bindingConflict('当前微信的账号绑定异常，请联系客服处理', 'DUPLICATE_OPENID');
  }

  if (userRes.data.length > 0) {
    const updateData = { lastActiveAt: Date.now() };
    if (avatarUpload) {
      updateData.avatar = avatarUpload.media.url;
      updateData.avatarObject = avatarUpload.media;
    }
    await db.collection('users').doc(userRes.data[0]._id).update({
      data: prepareUserUpdateData(updateData)
    });
    await finishUserAvatarUpload(avatarUpload, userRes.data[0].avatarObject);
    return { success: true, user: sanitizeUserSession({ ...userRes.data[0], ...updateData }) };
  }

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
  if (avatarUpload) newUser.avatarObject = avatarUpload.media;

  const res = await db.collection('users').add({ data: newUser });
  newUser._id = res._id;
  await finishUserAvatarUpload(avatarUpload, null);

  return { success: true, user: sanitizeUserSession(newUser), isNew: true };
}

async function userLoginPassword(data) {
  const { username, password, encryptedPassword, key, iv, keyId } = data;

  if (!username) {
    return { success: false, error: '账号不能为空' };
  }

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

  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    const remainMinutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    return {
      success: false,
      error: `账号已被锁定，请${remainMinutes}分钟后再试`,
      code: 1003
    };
  }

  const isMatch = await crypto.verifyPassword(plainPassword, user.password);

  if (!isMatch) {
    const newAttempts = (user.loginAttempts || 0) + 1;

    if (newAttempts >= 5) {
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

  const wxContext = cloud.getWXContext();
  const currentOpenid = wxContext.OPENID;

  if (user.openid && user.openid !== currentOpenid) {
    return bindingConflict('该账号已绑定其他微信，请使用原微信登录');
  }
  const bindingError = await ensureWechatCanBind(currentOpenid, user._id);
  if (bindingError) return bindingError;

  const updateData = {
    loginAttempts: 0,
    lockedUntil: 0,
    lastActiveAt: Date.now()
  };

  if (!user.openid && currentOpenid) {
    updateData.openid = currentOpenid;
  }

  await db.collection('users').doc(user._id).update({
    data: updateData
  });

  const safeUser = sanitizeUserSession({ ...user, ...updateData, openid: user.openid || currentOpenid });
  return { success: true, user: safeUser };
}

async function userLoginByPhone(openid, data) {
  const { phone, nickname, avatar } = data;
  const avatarUpload = await verifyUserAvatarUpload(openid, data);
  const avatarForDb = avatarUpload ? avatarUpload.media.url : normalizeAvatarForDb(avatar);

  if (!phone) {
    return { success: false, error: '手机号不能为空' };
  }

  const userRes = await db.collection('users').where({ phone }).limit(2).get();

  if (userRes.data.length > 1) {
    return bindingConflict('该手机号的账号数据异常，请联系客服处理', 'DUPLICATE_PHONE');
  }

  if (userRes.data.length > 0) {
    const user = userRes.data[0];

    if (user.openid && user.openid !== openid) {
      return bindingConflict('该账号已绑定其他微信，请使用原微信登录');
    }
    const bindingError = await ensureWechatCanBind(openid, user._id);
    if (bindingError) return bindingError;

    const updateData = { lastActiveAt: Date.now() };
    if (!user.openid) {
      updateData.openid = openid;
    }
    if (nickname && (!user.nickname || user.nickname.startsWith('用户'))) {
      updateData.nickname = nickname;
    }
    if (avatarUpload) {
      updateData.avatar = avatarUpload.media.url;
      updateData.avatarObject = avatarUpload.media;
    } else if (avatarForDb && (!user.avatar || isLocalTempFilePath(user.avatar))) {
      updateData.avatar = avatarForDb;
    } else if (!avatarForDb && isLocalTempFilePath(user.avatar)) {
      updateData.avatar = '';
    }
    await db.collection('users').doc(user._id).update({ data: prepareUserUpdateData(updateData) });
    await finishUserAvatarUpload(avatarUpload, user.avatarObject);

    const safeUser = sanitizeUserSession({ ...user, openid: openid, ...updateData });
    return { success: true, user: safeUser, isNew: false };
  }

  const openidUsers = await getUsersByBinding('openid', openid);
  if (openidUsers.length > 1) {
    return bindingConflict('当前微信的账号绑定异常，请联系客服处理', 'DUPLICATE_OPENID');
  }
  if (openidUsers.length === 1) {
    const boundUser = openidUsers[0];
    if (boundUser.phone && boundUser.phone !== phone) {
      return bindingConflict('当前微信已绑定其他账号，请使用已绑定账号登录');
    }

    const updateData = {
      phone,
      phoneMask: crypto.maskPhone(phone),
      contactPhone: phone,
      lastActiveAt: Date.now()
    };
    if (nickname && (!boundUser.nickname || boundUser.nickname.startsWith('用户'))) {
      updateData.nickname = nickname;
    }
    if (avatarUpload) {
      updateData.avatar = avatarUpload.media.url;
      updateData.avatarObject = avatarUpload.media;
    } else if (avatarForDb && (!boundUser.avatar || isLocalTempFilePath(boundUser.avatar))) {
      updateData.avatar = avatarForDb;
    }
    await db.collection('users').doc(boundUser._id).update({ data: prepareUserUpdateData(updateData) });
    await finishUserAvatarUpload(avatarUpload, boundUser.avatarObject);
    const safeUser = sanitizeUserSession({ ...boundUser, ...updateData });
    return { success: true, user: safeUser, isNew: false };
  }

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
  if (avatarUpload) newUser.avatarObject = avatarUpload.media;

  const res = await db.collection('users').add({ data: newUser });
  newUser._id = res._id;
  await finishUserAvatarUpload(avatarUpload, null);

  const safeUser = sanitizeUserSession(newUser);
  return { success: true, user: safeUser, isNew: true };
}

async function userUpdate(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    data = data || {};

    const bindings = await getUsersByBinding('openid', openid);
    if (bindings.length > 1) {
      return bindingConflict('当前微信的账号绑定异常，请联系客服处理', 'DUPLICATE_OPENID');
    }
    const user = bindings[0];
    if (!user) return { success: false, error: '用户不存在' };
    if (data._id && data._id !== user._id) {
      return { success: false, error: '无权修改其他用户资料' };
    }
    const avatarUpload = await verifyUserAvatarUpload(openid, data);

    const updateData = {};
    if (data.nickname !== undefined) {
      const nickname = String(data.nickname || '').trim();
      if (!nickname) return { success: false, error: '昵称不能为空' };
      if (nickname.length > 12) return { success: false, error: '昵称不能超过12个字' };
      updateData.nickname = nickname;
    }
    if (avatarUpload) {
      updateData.avatar = avatarUpload.media.url;
      updateData.avatarObject = avatarUpload.media;
    } else if (data.avatar !== undefined) {
      const avatar = normalizeAvatarForDb(data.avatar);
      if (data.avatar && !avatar) return { success: false, error: '头像尚未上传完成' };
      updateData.avatar = avatar;
    }
    if (data.gender !== undefined) {
      const gender = normalizeGender(data.gender);
      if (['male', 'female', 'secret'].indexOf(gender) === -1) {
        return { success: false, error: '性别选项不正确' };
      }
      updateData.gender = gender;
    }
    if (data.age !== undefined) {
      if (data.age === '' || data.age === null) {
        updateData.age = null;
      } else {
        const age = Number(data.age);
        if (!Number.isInteger(age) || age < 1 || age > 120) {
          return { success: false, error: '年龄应为1至120岁' };
        }
        updateData.age = age;
      }
    }
    if (data.region !== undefined) {
      const region = String(data.region || '').trim();
      if (region && BEIJING_DISTRICTS.indexOf(region) === -1) {
        return { success: false, error: '请选择北京市内的地区' };
      }
      updateData.region = region;
    }
    if (data.contactPhone !== undefined) {
      const contactPhone = String(data.contactPhone || '').trim();
      if (contactPhone && !/^1\d{10}$/.test(contactPhone)) {
        return { success: false, error: '请输入正确的手机号' };
      }
      updateData.contactPhone = contactPhone;
    }
    if (data.bio !== undefined) {
      const bio = String(data.bio || '').trim();
      if (bio.length > 200) return { success: false, error: '自我介绍不能超过200个字' };
      updateData.bio = bio;
    }
    if (data.background !== undefined) updateData.background = data.background;
    if (data.photos !== undefined) updateData.photos = data.photos;

    const securityError = await checkProfileText(
      openid,
      updateData.nickname === undefined ? '' : updateData.nickname,
      updateData.bio === undefined ? '' : updateData.bio
    );
    if (securityError) return { success: false, error: securityError };

    const now = Date.now();
    updateData.lastActiveAt = now;
    updateData.updatedAt = now;
    await db.collection('users').doc(user._id).update({ data: prepareUserUpdateData(updateData) });
    await finishUserAvatarUpload(avatarUpload, user.avatarObject);

    const safeUser = sanitizeUserSession({ ...user, ...updateData });
    return { success: true, user: safeUser };
  } catch (err) {
    console.error('user/update failed:', err);
    return { success: false, error: err.message || '保存资料失败，请重试' };
  }
}

async function userGet(openid, userId) {
  if (!userId) {
    return { success: false, error: '用户ID不能为空' };
  }

  const user = await getUserByAnyId(userId);
  if (!user) return { success: false, error: '用户不存在' };
  const refreshedUser = await refreshReceivedLikes(user);
  return {
    success: true,
    user: serializeUserProfile(refreshedUser, !!openid && refreshedUser.openid === openid)
  };
}

async function userFollowStatus(openid, data) {
  if (!openid) return { success: false, error: '请先登录' };
  const target = await getUserByAnyId(String(data && data.userId || '').trim());
  if (!target || !target.openid) return { success: false, error: '用户不存在' };
  if (target.openid === openid) {
    return {
      success: true,
      isCurrentUser: true,
      isFollowing: false,
      isMutual: false,
      followingCount: Math.max(0, Number(target.following) || 0),
      followerCount: Math.max(0, Number(target.followers) || 0)
    };
  }

  const relations = await Promise.all([
    hasFollow(openid, target.openid),
    hasFollow(target.openid, openid)
  ]);
  const isFollowing = relations[0];
  const followsViewer = relations[1];

  return {
    success: true,
    isCurrentUser: false,
    isFollowing,
    isMutual: isFollowing && followsViewer,
    followingCount: Math.max(0, Number(target.following) || 0),
    followerCount: Math.max(0, Number(target.followers) || 0)
  };
}

async function userFollowToggle(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    const target = await getUserByAnyId(String(data && data.userId || '').trim());
    const viewer = await getUserByAnyId(openid);
    if (!viewer || !viewer.openid) return { success: false, error: '当前用户不存在' };
    if (!target || !target.openid) return { success: false, error: '用户不存在' };
    if (target.openid === openid) return { success: false, error: '不能关注自己' };

    const followId = getFollowId(openid, target.openid);
    const result = await db.runTransaction(async transaction => {
      const viewerDoc = transaction.collection('users').doc(viewer._id);
      const targetDoc = transaction.collection('users').doc(target._id);
      const viewerRes = await viewerDoc.get();
      const targetRes = await targetDoc.get();
      const latestViewer = viewerRes && viewerRes.data;
      const latestTarget = targetRes && targetRes.data;
      if (!latestViewer || !latestTarget) throw new Error('用户不存在');

      const followDoc = transaction.collection('user_follows').doc(followId);
      let follow = null;
      try {
        const followRes = await followDoc.get();
        follow = followRes && followRes.data;
      } catch (err) {
        if (!isDocumentNotFoundError(err)) throw err;
      }

      const now = Date.now();
      let isFollowing;
      let viewerFollowing = Math.max(0, Number(latestViewer.following) || 0);
      let targetFollowers = Math.max(0, Number(latestTarget.followers) || 0);
      if (follow) {
        await followDoc.remove();
        await removeNotification(transaction, 'user_follow', target.openid, followId);
        isFollowing = false;
        viewerFollowing = Math.max(0, viewerFollowing - 1);
        targetFollowers = Math.max(0, targetFollowers - 1);
      } else {
        await followDoc.set({
          data: {
            followerId: openid,
            followingId: target.openid,
            followerName: latestViewer.nickname || '旅行者',
            followerAvatar: latestViewer.avatar || '',
            followingName: latestTarget.nickname || '旅行者',
            followingAvatar: latestTarget.avatar || '',
            createdAt: now,
            updatedAt: now
          }
        });
        await setNotification(transaction, {
          receiverId: target.openid,
          category: 'interaction',
          type: 'user_follow',
          actorId: openid,
          actorName: latestViewer.nickname || '旅行者',
          actorAvatar: latestViewer.avatar || '',
          targetType: 'user',
          targetId: openid,
          sourceType: 'follow',
          sourceId: followId,
          title: '关注通知',
          actionText: '关注了你',
          content: '查看对方个人主页',
          createdAt: now
        });
        isFollowing = true;
        viewerFollowing += 1;
        targetFollowers += 1;
      }

      await viewerDoc.update({
        data: { following: viewerFollowing, updatedAt: now }
      });
      await targetDoc.update({
        data: { followers: targetFollowers, updatedAt: now }
      });
      return { isFollowing, viewerFollowing, targetFollowers };
    });

    const followsViewer = await hasFollow(target.openid, openid);

    return {
      success: true,
      isFollowing: result.isFollowing,
      isMutual: result.isFollowing && followsViewer,
      followingCount: result.viewerFollowing,
      followerCount: result.targetFollowers
    };
  } catch (err) {
    console.error('user/followToggle failed:', err);
    return { success: false, error: err.message || '关注操作失败，请重试' };
  }
}

function withFollowCursor(condition, cursor, cursorId) {
  if (cursor <= 0) return condition;
  const cursorCondition = cursorId
    ? _.or([
      { createdAt: _.lt(cursor) },
      { createdAt: _.eq(cursor), _id: _.lt(cursorId) }
    ])
    : { createdAt: _.lt(cursor) };
  return _.and([condition, cursorCondition]);
}

async function userFollowList(openid, data) {
  try {
    if (!openid) return { success: false, error: '请先登录' };
    const type = String(data && data.type || 'following').trim();
    if (type !== 'following' && type !== 'followers') {
      return { success: false, error: '列表类型无效' };
    }
    const owner = await getUserByAnyId(String(data && data.userId || openid).trim());
    if (!owner || !owner.openid) return { success: false, error: '用户不存在' };

    const pageSize = Math.max(1, Math.min(Number(data && data.pageSize) || 20, 50));
    const cursor = Number(data && data.cursor) || 0;
    const cursorId = String(data && data.cursorId || '');
    const field = type === 'following' ? 'followerId' : 'followingId';
    const condition = withFollowCursor({ [field]: owner.openid }, cursor, cursorId);
    const listRes = await db.collection('user_follows')
      .where(condition)
      .orderBy('createdAt', 'desc')
      .orderBy('_id', 'desc')
      .limit(pageSize + 1)
      .get();

    let records = listRes.data || [];
    const hasMore = records.length > pageSize;
    if (hasMore) records = records.slice(0, pageSize);
    const userIds = records.map(record => (
      type === 'following' ? record.followingId : record.followerId
    ));
    const users = await Promise.all(userIds.map(userId => getUserByAnyId(userId)));
    const relationPairs = await Promise.all(users.map(async listedUser => {
      if (!listedUser || !listedUser.openid || listedUser.openid === openid) {
        return [false, false];
      }
      return Promise.all([
        hasFollow(openid, listedUser.openid),
        hasFollow(listedUser.openid, openid)
      ]);
    }));
    const visibleUsers = [];

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const listedUser = users[index];
      if (!listedUser || !listedUser.openid) continue;
      const viewerFollows = listedUser.openid === openid || relationPairs[index][0];
      const listedFollowsViewer = relationPairs[index][1];
      visibleUsers.push({
        _id: record._id,
        userId: listedUser.openid,
        nickname: listedUser.nickname || '旅行者',
        avatar: listedUser.avatar || '',
        region: listedUser.region || '',
        bio: listedUser.bio || '喜欢户外运动，周末出游',
        isCurrentUser: listedUser.openid === openid,
        isFollowing: viewerFollows,
        isMutual: viewerFollows && listedFollowsViewer,
        createdAt: Number(record.createdAt) || 0
      });
    }
    await resolveFollowAvatarUrls(visibleUsers);
    const last = records.length > 0 ? records[records.length - 1] : null;
    return {
      success: true,
      users: visibleUsers,
      counts: {
        following: Math.max(0, Number(owner.following) || 0),
        followers: Math.max(0, Number(owner.followers) || 0)
      },
      hasMore,
      nextCursor: last ? Number(last.createdAt) || 0 : 0,
      nextCursorId: last ? last._id : ''
    };
  } catch (err) {
    console.error('user/followList failed:', err);
    return { success: false, error: err.message || '关注列表加载失败，请重试' };
  }
}

module.exports = {
  userRegister,
  userLogin,
  userLoginPassword,
  userLoginByPhone,
  userUpdate,
  userGet,
  userFollowStatus,
  userFollowToggle,
  userFollowList,
  sanitizeUserSession,
  serializeUserProfile
};
