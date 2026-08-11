const { db, _, cloud, safeAvatar } = require('../utils/shared');
const { recordUserStatEvent } = require('./auth');
const { setNotification } = require('./notification');
const tripMedia = require('./tripMedia');
const { createReadCondition, RUNTIME_DEFAULTS } = require('../utils/dataEnvironment');

function getTripTitle(trip) {
  return trip && (trip.tripTitle || trip.placeName) || '行程';
}

function getTripThumbnail(trip) {
  if (!trip) return '';
  return (Array.isArray(trip.coverImages) && trip.coverImages[0]) ||
    trip.placeCoverImage || trip.tripImage || '';
}

async function createTripNotification(payload) {
  return setNotification(db, Object.assign({
    category: 'trip',
    targetType: 'trip',
    sourceType: 'trip',
    title: '行程通知'
  }, payload));
}

async function resolveTripCoverImages(trips = []) {
  const fileIDs = new Set();

  trips.forEach(trip => {
    // 旧字段兼容
    if (trip.customCoverImage && trip.customCoverImage.startsWith('cloud://')) {
      fileIDs.add(trip.customCoverImage);
    }
    // 行程头像
    if (trip.tripAvatar && trip.tripAvatar.startsWith('cloud://')) {
      fileIDs.add(trip.tripAvatar);
    }
    // 封面图数组
    if (Array.isArray(trip.coverImages)) {
      trip.coverImages.forEach(id => {
        if (id && id.startsWith('cloud://')) fileIDs.add(id);
      });
    }
  });

  let urlMap = {};
  if (fileIDs.size > 0) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: [...fileIDs] });
      (urlRes.fileList || []).forEach(item => {
        if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL;
      });
    } catch (err) {
      console.warn('获取行程封面临时链接失败', err);
    }
  }

  trips.forEach(trip => {
    // 行程列表头像：保留 fileID 原值，另加 customCoverImageUrl 供前端展示
    if (trip.customCoverImage && trip.customCoverImage.startsWith('cloud://')) {
      trip.customCoverImageUrl = urlMap[trip.customCoverImage] || '';
    } else {
      trip.customCoverImageUrl = trip.customCoverImage || '';
    }
    // 行程头像：保留 fileID 原值，另加 tripAvatarUrl 供前端展示
    if (trip.tripAvatar && trip.tripAvatar.startsWith('cloud://')) {
      trip.tripAvatarUrl = urlMap[trip.tripAvatar] || '';
    } else {
      trip.tripAvatarUrl = trip.tripAvatar || '';
    }
    // 封面图数组：保留 fileIDs，另加 coverImageUrls 供前端展示
    trip.coverImageUrls = Array.isArray(trip.coverImages)
      ? trip.coverImages.map(id =>
          id && id.startsWith('cloud://') ? (urlMap[id] || '') : (id || '')
        )
      : [];
  });
}

async function tripCreate(openid, data, dataEnvironment = RUNTIME_DEFAULTS.develop) {
  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];

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

  let tripLogConfig = { logPublisherLimit: 2, logMaxCount: 15 };
  try {
    const configRes = await db.collection('system_config').doc('trip_log').get();
    if (configRes.data) {
      tripLogConfig.logPublisherLimit = configRes.data.logPublisherLimit || 2;
      tripLogConfig.logMaxCount = configRes.data.logMaxCount || 15;
    }
  } catch (err) {
    console.warn('读取日志配置失败，使用默认值', err);
  }

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
    destLocation: data.destLocation || null,
    creatorId: openid,
    creatorName: user.nickname,
    creatorAvatar: safeAvatar(user.avatar),
    participants: data.participants || [{
      userId: openid,
      nickname: user.nickname,
      avatar: safeAvatar(user.avatar)
    }],
    status: data.status || 'open',
    tripStage: 'not_started',
    logStartedAt: 0,
    logEndedAt: 0,
    logPublisherLimit: tripLogConfig.logPublisherLimit,
    logMaxCount: tripLogConfig.logMaxCount,
    logAuthorizedPublisherIds: [],
    logCount: 0,
    commentCount: 0,
    lastLogAt: 0,
    dataEnv: dataEnvironment.writeEnv,
    createdAt: Date.now()
  };

  const res = await db.collection('trips').add({ data: newTrip });
  newTrip._id = res._id;

  await db.collection('users').doc(user._id).update({
    data: { trips: _.inc(1) }
  });

  return { success: true, trip: newTrip, tripImage };
}

async function tripList(openid, data, dataEnvironment = RUNTIME_DEFAULTS.develop) {
  const { placeId, status, date, excludeStatus, page = 1, pageSize = 8, cursor } = data;

  if (openid) {
    recordUserStatEvent('tripListVisit', openid, { page, pageSize }).catch(() => {});
  }

  let query = db.collection('trips');

  const conditions = {};
  if (placeId) conditions.placeId = placeId;
  if (status) conditions.status = status;
  if (date) conditions.date = date;
  if (excludeStatus) conditions.status = _.neq(excludeStatus);
  if (cursor) conditions.createdAt = _.lt(cursor);

  const dataEnvCondition = createReadCondition(_, dataEnvironment.readEnvs);
  query = Object.keys(conditions).length > 0
    ? query.where(_.and([conditions, dataEnvCondition]))
    : query.where(dataEnvCondition);

  const res = await query
    .orderBy('createdAt', 'desc')
    .skip(cursor ? 0 : (page - 1) * pageSize)
    .limit(pageSize)
    .get();

  const trips = res.data || [];

  const userIds = new Set();
  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        if (p.userId) userIds.add(p.userId);
      });
    }
  });

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

  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        if (p.avatar && p.avatar.startsWith('cloud://') && avatarUrlMap[p.avatar]) {
          p.avatar = avatarUrlMap[p.avatar];
        }
      });
    }
  });

  await resolveTripCoverImages(trips);

  return { success: true, trips };
}

async function tripGet(tripId) {
  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }

  const res = await db.collection('trips').doc(tripId).get();
  const trip = res.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  const userIds = new Set();
  if (trip.participants) {
    trip.participants.forEach(p => {
      if (p.userId) userIds.add(p.userId);
    });
  }
  if (trip.creatorId) userIds.add(trip.creatorId);

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

  const avatarFileIDs = [];

  if (trip.creatorId && userMap[trip.creatorId]) {
    trip.creatorName = userMap[trip.creatorId].nickname;
    trip.creatorAvatar = userMap[trip.creatorId].avatar;
  }
  if (trip.creatorAvatar && trip.creatorAvatar.startsWith('cloud://')) {
    avatarFileIDs.push(trip.creatorAvatar);
  }

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

  await resolveTripCoverImages([trip]);

  return { success: true, trip };
}

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
  const { tripId, contactValue } = data;

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (trip.status !== 'open') {
    return { success: false, error: '行程已满或已取消' };
  }

  const tripStage = trip.tripStage || 'not_started';
  if (tripStage !== 'not_started') {
    return { success: false, error: '行程已开始或已结束，不能加入' };
  }

  if ((trip.needCount || 0) <= 0) {
    return { success: false, error: '行程名额已满' };
  }

  if (trip.participants.some(p => p.userId === openid)) {
    return { success: false, error: '您已参与该行程' };
  }

  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];

  const newParticipant = {
    userId: openid,
    nickname: user.nickname,
    avatar: safeAvatar(user.avatar)
  };

  const participantContactPhone = String(contactValue || '').trim();
  if (participantContactPhone) {
    newParticipant.contactPhone = participantContactPhone;
  }

  const updateData = {
    participants: _.push(newParticipant),
    currentCount: _.inc(1),
    needCount: _.inc(-1)
  };

  await db.collection('trips').doc(tripId).update({ data: updateData });

  return { success: true };
}

async function tripQuit(openid, data) {
  const { tripId } = data;

  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  if (trip.creatorId === openid) {
    return { success: false, error: '发起人不能退出行程' };
  }

  if (trip.tripStage === 'ongoing') {
    return { success: false, error: '行程已开始，暂不能退出或移除成员' };
  }
  const participantIndex = trip.participants.findIndex(p => p.userId === openid);
  if (participantIndex === -1) {
    return { success: false, error: '您未参与该行程' };
  }

  const quitter = trip.participants.find(p => p.userId === openid);
  const quitterName = quitter ? quitter.nickname : '旅行者';
  const quitterAvatar = quitter ? safeAvatar(quitter.avatar) : '';

  const newParticipants = trip.participants.filter(p => p.userId !== openid);

  await db.collection('trips').doc(tripId).update({
    data: {
      participants: newParticipants,
      currentCount: _.inc(-1),
      needCount: _.inc(1),
      status: 'open'
    }
  });

  const applyRes = await db.collection('applies').add({
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

  await createTripNotification({
    receiverId: trip.creatorId,
    type: 'trip_member_quit',
    actorId: openid,
    actorName: quitterName,
    actorAvatar: quitterAvatar,
    targetId: tripId,
    sourceType: 'member_change',
    sourceId: applyRes._id,
    actionText: '退出了你的行程',
    content: getTripTitle(trip),
    thumbnail: getTripThumbnail(trip),
    createdAt: Date.now()
  });

  return { success: true };
}

async function tripRemoveMember(openid, data) {
  const { tripId, memberId } = data;

  if (!tripId || !memberId) {
    return { success: false, error: '参数不完整' };
  }

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  if (trip.creatorId !== openid) {
    return { success: false, error: '无权移除成员' };
  }

  if (trip.tripStage === 'ongoing') {
    return { success: false, error: '行程已开始，暂不能退出或移除成员' };
  }

  if (memberId === trip.creatorId) {
    return { success: false, error: '不能移除发起人' };
  }

  const newParticipants = trip.participants.filter(p => p.userId !== memberId);

  if (newParticipants.length === trip.participants.length) {
    return { success: false, error: '成员不存在' };
  }

  await db.collection('trips').doc(tripId).update({
    data: {
      participants: newParticipants,
      currentCount: _.inc(-1),
      needCount: _.inc(1),
      status: 'open'
    }
  });

  const removedMember = trip.participants.find(p => p.userId === memberId);
  const removedName = removedMember ? removedMember.nickname : '旅行者';

  const applyRes = await db.collection('applies').add({
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

  await createTripNotification({
    receiverId: memberId,
    type: 'trip_member_removed',
    actorId: openid,
    actorName: trip.creatorName || '行程发起人',
    actorAvatar: trip.creatorAvatar || '',
    targetId: tripId,
    sourceType: 'member_change',
    sourceId: applyRes._id,
    actionText: '将你移出了行程',
    content: getTripTitle(trip),
    thumbnail: getTripThumbnail(trip),
    createdAt: Date.now()
  });

  return { success: true };
}

async function tripUpdateStatus(openid, data) {
  const { tripId, status } = data;

  if (!tripId || !status) {
    return { success: false, error: '参数不完整' };
  }

  const allowedStatus = ['open', 'stopped', 'cancelled'];
  if (!allowedStatus.includes(status)) {
    return { success: false, error: '不支持的状态值' };
  }

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  if (trip.creatorId !== openid) {
    return { success: false, error: '无权操作' };
  }

  const now = Date.now();
  const updateData = status === 'cancelled'
    ? { tripStage: 'cancelled', updatedAt: now }
    : { status, updatedAt: now };

  await db.collection('trips').doc(tripId).update({ data: updateData });

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
      await createTripNotification({
        receiverId: p.userId,
        type: 'trip_cancelled',
        actorId: openid,
        actorName: trip.creatorName || '行程发起人',
        actorAvatar: trip.creatorAvatar || '',
        targetId: tripId,
        sourceType: 'trip_status',
        sourceId: tripId + ':cancelled',
        actionText: '取消了行程',
        content: getTripTitle(trip),
        thumbnail: getTripThumbnail(trip),
        createdAt: now
      });
    }
  }

  return { success: true };
}

async function tripDelete(openid, data) {
  const { tripId } = data;

  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  if (trip.creatorId !== openid) {
    return { success: false, error: '无权删除' };
  }

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
      await createTripNotification({
        receiverId: p.userId,
        type: 'trip_deleted',
        actorId: openid,
        actorName: trip.creatorName || '行程发起人',
        actorAvatar: trip.creatorAvatar || '',
        targetType: '',
        targetId: '',
        sourceType: 'trip_status',
        sourceId: tripId + ':deleted',
        actionText: '删除了行程',
        content: getTripTitle(trip),
        thumbnail: getTripThumbnail(trip),
        createdAt: now
      });
    }
  }

  await db.collection('trips').doc(tripId).remove();

  return { success: true };
}

async function tripUpdate(openid, data) {
  const {
    tripId,
    avatarUploadSessionId = '',
    coverUploadSessionId = '',
    ...updateFields
  } = data;

  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;

  if (!trip) {
    return { success: false, error: '行程不存在' };
  }

  if (trip.creatorId !== openid) {
    return { success: false, error: '无权更新' };
  }

  const oldAvatarObject = tripMedia.normalizeMediaObject(trip.customCoverImageObject);
  const oldCoverObjects = Array.isArray(trip.coverImageObjects)
    ? trip.coverImageObjects.map(tripMedia.normalizeMediaObject).filter(Boolean)
    : [];
  const oldObjectMap = {};
  if (oldAvatarObject) oldObjectMap[oldAvatarObject.key] = oldAvatarObject;
  oldCoverObjects.forEach(item => { oldObjectMap[item.key] = item; });
  const avatarMediaTouched = Object.prototype.hasOwnProperty.call(updateFields, 'customCoverImageObject');

  let verifiedAvatarObject = null;
  let verifiedAvatarSessionId = '';
  if (updateFields.customCoverImageObject) {
    const requestedAvatar = tripMedia.normalizeMediaObject(updateFields.customCoverImageObject);
    if (!requestedAvatar) return { success: false, error: '行程头像信息无效' };
    if (oldObjectMap[requestedAvatar.key]) {
      verifiedAvatarObject = oldObjectMap[requestedAvatar.key];
    } else {
      if (!avatarUploadSessionId) return { success: false, error: '行程头像上传会话无效' };
      const verified = await tripMedia.verifyUploadSession(openid, {
        sessionId: avatarUploadSessionId,
        tripId,
        purpose: 'avatar',
        media: [requestedAvatar]
      });
      verifiedAvatarObject = verified.media[0];
      verifiedAvatarSessionId = avatarUploadSessionId;
    }
    updateFields.customCoverImageObject = verifiedAvatarObject;
    updateFields.customCoverImage = verifiedAvatarObject.url;
  } else if (updateFields.customCoverImageObject === null) {
    updateFields.customCoverImage = null;
  }

  let normalizedCoverObjects = null;
  let verifiedCoverSessionId = '';
  if (Array.isArray(updateFields.coverImageObjects)) {
    const requestedObjects = updateFields.coverImageObjects.map(item =>
      item ? tripMedia.normalizeMediaObject(item) : null
    );
    if (requestedObjects.some((item, index) => updateFields.coverImageObjects[index] && !item)) {
      return { success: false, error: '行程封面信息无效' };
    }
    const newObjects = requestedObjects.filter(item => item && !oldObjectMap[item.key]);
    const verifiedNewMap = {};
    if (newObjects.length > 0) {
      if (!coverUploadSessionId) return { success: false, error: '行程封面上传会话无效' };
      const verified = await tripMedia.verifyUploadSession(openid, {
        sessionId: coverUploadSessionId,
        tripId,
        purpose: 'cover',
        media: newObjects
      });
      verified.media.forEach(item => { verifiedNewMap[item.key] = item; });
      verifiedCoverSessionId = coverUploadSessionId;
    }
    normalizedCoverObjects = requestedObjects.map(item =>
      item ? (oldObjectMap[item.key] || verifiedNewMap[item.key]) : null
    );
    updateFields.coverImageObjects = normalizedCoverObjects;
    if (Array.isArray(updateFields.coverImages)) {
      updateFields.coverImages = updateFields.coverImages.map((value, index) =>
        normalizedCoverObjects[index] ? normalizedCoverObjects[index].url : value
      );
    }
  }

  const updateData = {};
  Object.keys(updateFields).forEach(key => {
    if (updateFields[key] !== undefined) {
      updateData[key] = updateFields[key];
    }
  });

  const now = Date.now();
  updateData.updatedAt = now;

  const timeChanged =
    (updateData.date !== undefined && String(updateData.date || '') !== String(trip.date || '')) ||
    (updateData.meetingTime !== undefined && String(updateData.meetingTime || '') !== String(trip.meetingTime || ''));
  const locationChanged =
    (updateData.meetingPlace !== undefined && String(updateData.meetingPlace || '') !== String(trip.meetingPlace || '')) ||
    (updateData.departure !== undefined && String(updateData.departure || '') !== String(trip.departure || ''));

  if (updateData.needCount !== undefined) {
    updateData.totalParticipants = (trip.currentCount || 1) + updateData.needCount;
  }

  await db.collection('trips').doc(tripId).update({
    data: updateData
  });

  if (verifiedAvatarSessionId) {
    try { await tripMedia.consumeUploadSession(verifiedAvatarSessionId); } catch (err) {
      console.error('标记行程头像上传会话失败:', err);
    }
  }
  if (verifiedCoverSessionId) {
    try { await tripMedia.consumeUploadSession(verifiedCoverSessionId); } catch (err) {
      console.error('标记行程封面上传会话失败:', err);
    }
  }

  const retainedKeys = {};
  const retainedAvatarObject = avatarMediaTouched ? verifiedAvatarObject : oldAvatarObject;
  if (retainedAvatarObject) retainedKeys[retainedAvatarObject.key] = true;
  (normalizedCoverObjects || oldCoverObjects).filter(Boolean).forEach(item => { retainedKeys[item.key] = true; });
  const removedMedia = [oldAvatarObject].concat(oldCoverObjects).filter(item => item && !retainedKeys[item.key]);
  await tripMedia.cleanupCosMedia(removedMedia, { tripId, reason: 'trip_media_replaced' });

  const members = Array.isArray(trip.participants) ? trip.participants : [];
  for (const participant of members) {
    if (!participant.userId || participant.userId === openid) continue;
    if (timeChanged) {
      const dateText = updateData.date !== undefined ? updateData.date : trip.date;
      const meetingTimeText = updateData.meetingTime !== undefined
        ? updateData.meetingTime
        : trip.meetingTime;
      await createTripNotification({
        receiverId: participant.userId,
        type: 'trip_time_changed',
        actorId: openid,
        actorName: trip.creatorName || '行程发起人',
        actorAvatar: trip.creatorAvatar || '',
        targetId: tripId,
        sourceType: 'trip_update',
        sourceId: tripId + ':' + now + ':time',
        actionText: '修改了行程时间',
        content: [dateText, meetingTimeText].filter(Boolean).join(' ') || getTripTitle(trip),
        thumbnail: getTripThumbnail(trip),
        createdAt: now
      });
    }
    if (locationChanged) {
      const meetingPlaceText = updateData.meetingPlace !== undefined
        ? updateData.meetingPlace
        : trip.meetingPlace;
      const departureText = updateData.departure !== undefined
        ? updateData.departure
        : trip.departure;
      await createTripNotification({
        receiverId: participant.userId,
        type: 'trip_location_changed',
        actorId: openid,
        actorName: trip.creatorName || '行程发起人',
        actorAvatar: trip.creatorAvatar || '',
        targetId: tripId,
        sourceType: 'trip_update',
        sourceId: tripId + ':' + now + ':location',
        actionText: '修改了集合地点',
        content: [departureText, meetingPlaceText].filter(Boolean).join(' · ') || getTripTitle(trip),
        thumbnail: getTripThumbnail(trip),
        createdAt: now
      });
    }
  }

  return { success: true };
}

async function tripMy(openid) {
  const res = await db.collection('trips')
    .where({
      'participants.userId': openid
    })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const trips = res.data || [];

  const userIds = new Set();
  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        if (p.userId) userIds.add(p.userId);
      });
    }
  });

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

  trips.forEach(trip => {
    if (trip.participants) {
      trip.participants.forEach(p => {
        if (p.avatar && p.avatar.startsWith('cloud://') && avatarUrlMap[p.avatar]) {
          p.avatar = avatarUrlMap[p.avatar];
        }
      });
    }
  });

  await resolveTripCoverImages(trips);

  return { success: true, trips };
}

async function tripListByUser(data) {
  const { userId, page = 1, pageSize = 10 } = data;

  if (!userId) {
    return { success: false, error: '用户ID不能为空' };
  }

  const tripRes = await db.collection('trips')
    .where({
      creatorId: userId
    })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  const trips = tripRes.data || [];

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

  await resolveTripCoverImages(trips);

  const formattedTrips = trips.map(trip => {
    const placeInfo = placeMap[trip.placeId] || {};
    const placeImage = placeInfo.images?.[0] || '';

    return {
      _id: trip._id,
      title: trip.tripTitle || trip.placeName,
      tripTitle: trip.tripTitle || '',
      placeName: trip.placeName,
      placeId: trip.placeId || '',
      customCoverImage: trip.customCoverImage || '',
      customCoverImageUrl: trip.customCoverImageUrl || '',
      customCoverImageObject: trip.customCoverImageObject || null,
      tripAvatar: trip.tripAvatar || '',
      tripAvatarUrl: trip.tripAvatarUrl || '',
      coverImages: trip.coverImages || [],
      coverImageUrls: trip.coverImageUrls || [],
      coverImageObjects: trip.coverImageObjects || [],
      placeImage: placeImage,
      date: trip.date,
      duration: trip.duration || '1天',
      departure: trip.departure || '',
      meetingTime: trip.meetingTime || '',
      meetingPlace: trip.meetingPlace || '',
      creatorId: trip.creatorId || '',
      creatorName: trip.creatorName || '',
      creatorAvatar: trip.creatorAvatar || '',
      hasCar: trip.hasCar,
      carSeats: trip.carSeats || '',
      carModel: trip.carModel || '',
      price: trip.price || '',
      currentCount: trip.currentCount || 0,
      needCount: trip.needCount || 0,
      participants: trip.participants || [],
      status: trip.status || 'open',
      tripStage: trip.tripStage || 'not_started',
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

module.exports = {
  tripCreate,
  tripList,
  tripGet,
  tripView,
  tripJoin,
  tripQuit,
  tripRemoveMember,
  tripUpdateStatus,
  tripDelete,
  tripUpdate,
  tripMy,
  tripListByUser
};
