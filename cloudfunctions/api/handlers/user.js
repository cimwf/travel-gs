const { db, _, cloud, crypto, normalizeAvatarForDb, isLocalTempFilePath } = require('../utils/shared');
const nodeCrypto = require('crypto');

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

  const safeUser = { ...newUser };
  delete safeUser.password;
  return { success: true, user: safeUser };
}

async function userLogin(openid, data) {
  const avatarForDb = normalizeAvatarForDb(data.avatar);

  const userRes = await db.collection('users').where({ openid }).get();

  if (userRes.data.length > 0) {
    await db.collection('users').doc(userRes.data[0]._id).update({
      data: { lastActiveAt: Date.now() }
    });
    return { success: true, user: userRes.data[0] };
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

  const res = await db.collection('users').add({ data: newUser });
  newUser._id = res._id;

  return { success: true, user: newUser, isNew: true };
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

  const safeUser = { ...user, ...updateData, openid: user.openid || currentOpenid };
  delete safeUser.password;
  return { success: true, user: safeUser };
}

async function userLoginByPhone(openid, data) {
  const { phone, nickname, avatar } = data;
  const avatarForDb = normalizeAvatarForDb(avatar);

  if (!phone) {
    return { success: false, error: '手机号不能为空' };
  }

  const userRes = await db.collection('users').where({ phone }).get();

  if (userRes.data.length > 0) {
    const user = userRes.data[0];

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

  const res = await db.collection('users').add({ data: newUser });
  newUser._id = res._id;

  const safeUser = { ...newUser };
  delete safeUser.password;
  return { success: true, user: safeUser, isNew: true };
}

async function userUpdate(openid, data) {
  let user = null;

  if (data._id) {
    const res = await db.collection('users').doc(data._id).get();
    user = res.data;
  }

  if (!user && openid) {
    const userRes = await db.collection('users').where({ openid }).get();
    if (userRes.data.length > 0) {
      user = userRes.data[0];
    }
  }

  if (!user) {
    return { success: false, error: '用户不存在' };
  }

  const updateData = {
    nickname: data.nickname,
    avatar: data.avatar === undefined ? undefined : normalizeAvatarForDb(data.avatar),
    gender: data.gender,
    age: data.age,
    region: data.region,
    contactPhone: data.contactPhone,
    bio: data.bio,
    background: data.background,
    photos: data.photos,
    lastActiveAt: Date.now()
  };

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

  try {
    const resById = await db.collection('users').doc(userId).get();
    return { success: true, user: resById.data };
  } catch (e) {
    // _id 查询失败，尝试通过 openid 查询
  }

  try {
    const resByOpenid = await db.collection('users').where({ openid: userId }).get();
    if (resByOpenid.data && resByOpenid.data.length > 0) {
      return { success: true, user: resByOpenid.data[0] };
    }
  } catch (e) {
    // openid 查询失败
  }

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
  userCheck,
  userRegister,
  userLogin,
  userLoginPassword,
  userLoginByPhone,
  userUpdate,
  userGet,
  userFollowStatus,
  userFollowToggle,
  userFollowList
};
