const { db, _, cloud, crypto, normalizeAvatarForDb, isLocalTempFilePath } = require('../utils/shared');

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

module.exports = {
  userCheck,
  userRegister,
  userLogin,
  userLoginPassword,
  userLoginByPhone,
  userUpdate,
  userGet
};
