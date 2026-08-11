const { db, _, cloud, safeAvatar } = require('../utils/shared');
const tripMedia = require('./tripMedia');

async function tripLogStart(openid, data) {
  const { tripId } = data;
  if (!tripId) return { success: false, error: '行程ID不能为空' };

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  if (!trip) return { success: false, error: '行程不存在' };
  if (trip.creatorId !== openid) return { success: false, error: '只有发起人可以开始行程' };

  const tripStage = trip.tripStage || 'not_started';
  if (tripStage !== 'not_started') {
    return { success: false, error: '行程已经开始或已结束' };
  }

  const now = Date.now();
  await db.collection('trips').doc(tripId).update({
    data: { tripStage: 'ongoing', logStartedAt: now, updatedAt: now }
  });

  return { success: true, trip: { ...trip, tripStage: 'ongoing', logStartedAt: now } };
}

async function tripLogEnd(openid, data) {
  const { tripId } = data;
  if (!tripId) return { success: false, error: '行程ID不能为空' };

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  if (!trip) return { success: false, error: '行程不存在' };
  if (trip.creatorId !== openid) return { success: false, error: '只有发起人可以结束行程' };

  const tripStage = trip.tripStage || 'not_started';
  if (tripStage !== 'ongoing') return { success: false, error: '行程未在进行中' };

  const now = Date.now();
  await db.collection('trips').doc(tripId).update({
    data: { tripStage: 'ended', logEndedAt: now, updatedAt: now }
  });

  return { success: true, trip: { ...trip, tripStage: 'ended', logEndedAt: now } };
}

async function tripLogList(data) {
  const { tripId, page = 1, pageSize = 20 } = data;
  if (!tripId) return { success: false, error: '行程ID不能为空' };

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  if (!trip) return { success: false, error: '行程不存在' };

  const skip = (page - 1) * pageSize;
  const logsRes = await db.collection('trip_logs')
    .where({ tripId, status: 'active' })
    .orderBy('createdAt', 'asc')
    .skip(skip)
    .limit(pageSize)
    .get();

  const logs = logsRes.data || [];

  const fileIDs = [];
  logs.forEach(log => {
    if (log.images && log.images.length > 0) {
      log.images.forEach(img => {
        if (img.fileID && String(img.fileID).startsWith('cloud://')) fileIDs.push(img.fileID);
      });
    }
  });

  let fileUrlMap = {};
  if (fileIDs.length > 0) {
    try {
      const urlRes = await cloud.getTempFileURL({ fileList: fileIDs });
      if (urlRes.fileList) {
        urlRes.fileList.forEach(item => {
          if (item.tempFileURL) fileUrlMap[item.fileID] = item.tempFileURL;
        });
      }
    } catch (err) {
      console.warn('获取图片临时链接失败', err);
    }
  }

  logs.forEach(log => {
    if (log.images && log.images.length > 0) {
      log.images = log.images.map(img => ({
        ...img,
        tempFileURL: img.url || fileUrlMap[img.fileID] || ''
      }));
    }
  });

  const groupMap = {};
  const groupOrder = [];
  logs.forEach(log => {
    const key = log.dayLabel || '';
    if (!groupMap[key]) {
      groupMap[key] = {
        dayLabel: log.dayLabel || '',
        tripDayIndex: log.tripDayIndex || 0,
        weatherLabel: log.weatherLabel || '',
        logs: []
      };
      groupOrder.push(key);
    }
    groupMap[key].logs.push(log);
  });

  const groups = groupOrder.map(k => groupMap[k]);
  return { success: true, logs, groups, logCount: logs.length };
}

async function tripLogCreate(openid, data) {
  const { tripId, content, images = [], uploadSessionId = '', weatherLabel = '', location = null } = data;
  if (!tripId) return { success: false, error: '行程ID不能为空' };

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  if (!trip) return { success: false, error: '行程不存在' };

  const tripStage = trip.tripStage || 'not_started';
  if (tripStage !== 'ongoing') return { success: false, error: '行程日志未开启或已结束' };

  const authorizedIds = trip.logAuthorizedPublisherIds || [];
  const isCreator = trip.creatorId === openid;
  const isAuthorized = authorizedIds.includes(openid);
  if (!isCreator && !isAuthorized) return { success: false, error: '您没有发布日志的权限' };

  const logMaxCount = trip.logMaxCount || 15;
  const logCount = trip.logCount || 0;
  if (logCount >= logMaxCount) return { success: false, error: '本次行程的旅途记录已达到上限' };

  const trimmedContent = (content || '').trim();
  if (trimmedContent.length > 200) return { success: false, error: '内容不能超过200字' };
  if (images.length > 9) return { success: false, error: '最多上传9张图片' };

  const normalizedLocation = location
    ? {
        name: (location.name || '').trim(),
        address: (location.address || '').trim(),
        latitude: Number(location.latitude) || 0,
        longitude: Number(location.longitude) || 0
      }
    : null;

  const hasValidLocation = normalizedLocation !== null &&
    normalizedLocation.latitude !== 0 && normalizedLocation.longitude !== 0;

  if (!trimmedContent && (!images || images.length === 0) && !hasValidLocation) {
    return { success: false, error: '内容、图片和定位不能同时为空' };
  }

  let normalizedImages = images;
  let verifiedUploadSessionId = '';
  if (images.some(image => image && image.provider === 'cos')) {
    if (!uploadSessionId) return { success: false, error: '图片上传会话无效' };
    const verified = await tripMedia.verifyUploadSession(openid, {
      sessionId: uploadSessionId,
      tripId,
      purpose: 'log',
      media: images
    });
    normalizedImages = verified.media;
    verifiedUploadSessionId = uploadSessionId;
  }

  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0] || {};

  const now = Date.now();
  let dayLabel = '';
  let tripDayIndex = 1;
  if (trip.date) {
    const tripStart = new Date(trip.date);
    tripStart.setHours(0, 0, 0, 0);
    const todayD = new Date(now);
    todayD.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((todayD.getTime() - tripStart.getTime()) / (24 * 60 * 60 * 1000));
    tripDayIndex = diffDays + 1;
    const month = todayD.getMonth() + 1;
    const day = todayD.getDate();
    dayLabel = `${month}月${day}日`;
  }

  const newLog = {
    tripId,
    placeId: trip.placeId || '',
    placeName: trip.placeName || '',
    publisherId: openid,
    publisherName: user.nickname || '旅行者',
    publisherAvatar: safeAvatar(user.avatar),
    publisherRole: isCreator ? 'creator' : 'authorized_member',
    content: trimmedContent,
    images: normalizedImages,
    imageCount: normalizedImages.length,
    location: hasValidLocation ? normalizedLocation : null,
    dayLabel,
    tripDayIndex,
    weatherLabel,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };

  const res = await db.collection('trip_logs').add({ data: newLog });
  newLog._id = res._id;

  await db.collection('trips').doc(tripId).update({
    data: { logCount: logCount + 1, lastLogAt: now, updatedAt: now }
  });

  if (verifiedUploadSessionId) {
    try {
      await tripMedia.consumeUploadSession(verifiedUploadSessionId);
    } catch (err) {
      console.error('标记行程日志上传会话失败:', err);
    }
  }

  return { success: true, log: newLog };
}

async function tripLogDelete(openid, data) {
  const { tripId, logId } = data;
  if (!tripId || !logId) return { success: false, error: '参数不完整' };

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  if (!trip) return { success: false, error: '行程不存在' };
  if (trip.creatorId !== openid) return { success: false, error: '只有发起人可以删除日志' };

  const logRes = await db.collection('trip_logs').doc(logId).get();
  const log = logRes.data;
  if (!log) return { success: false, error: '日志不存在' };
  if (log.tripId !== tripId) return { success: false, error: '日志不属于该行程' };
  if (log.status === 'deleted') return { success: true };

  const now = Date.now();
  await db.collection('trip_logs').doc(logId).update({
    data: { status: 'deleted', deletedAt: now, deletedBy: openid, updatedAt: now }
  });

  const currentLogCount = trip.logCount || 0;
  await db.collection('trips').doc(tripId).update({
    data: { logCount: Math.max(currentLogCount - 1, 0), updatedAt: now }
  });

  await tripMedia.cleanupCosMedia(log.images || [], {
    tripId,
    logId,
    reason: 'trip_log_deleted'
  });

  return { success: true };
}

async function tripLogAuthorize(openid, data) {
  const { tripId, memberId } = data;
  if (!tripId || !memberId) return { success: false, error: '参数不完整' };

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  if (!trip) return { success: false, error: '行程不存在' };
  if (trip.creatorId !== openid) return { success: false, error: '只有发起人可以授权' };
  if ((trip.tripStage || 'not_started') !== 'ongoing') return { success: false, error: '只有进行中的行程才能授权发布日志' };
  if (memberId === openid) return { success: false, error: '不能授权发起人自己' };

  const isParticipant = (trip.participants || []).some(p => p.userId === memberId);
  if (!isParticipant) return { success: false, error: '只能授权已加入的成员' };

  const authorizedIds = trip.logAuthorizedPublisherIds || [];
  if (authorizedIds.includes(memberId)) return { success: false, error: '该成员已被授权' };
  const publisherLimit = trip.logPublisherLimit || 2;
  if (authorizedIds.length >= publisherLimit) return { success: false, error: `最多授权${publisherLimit}名成员` };

  const newAuthorizedIds = [...authorizedIds, memberId];
  await db.collection('trips').doc(tripId).update({
    data: { logAuthorizedPublisherIds: newAuthorizedIds, updatedAt: Date.now() }
  });

  return { success: true, authorizedPublisherIds: newAuthorizedIds };
}

async function tripLogUnauthorize(openid, data) {
  const { tripId, memberId } = data;
  if (!tripId || !memberId) return { success: false, error: '参数不完整' };

  const tripRes = await db.collection('trips').doc(tripId).get();
  const trip = tripRes.data;
  if (!trip) return { success: false, error: '行程不存在' };
  if (trip.creatorId !== openid) return { success: false, error: '只有发起人可以取消授权' };
  if ((trip.tripStage || 'not_started') !== 'ongoing') return { success: false, error: '只有进行中的行程才能修改授权' };

  const authorizedIds = (trip.logAuthorizedPublisherIds || []).filter(id => id !== memberId);
  await db.collection('trips').doc(tripId).update({
    data: { logAuthorizedPublisherIds: authorizedIds, updatedAt: Date.now() }
  });

  return { success: true, authorizedPublisherIds: authorizedIds };
}

module.exports = {
  tripLogStart,
  tripLogEnd,
  tripLogList,
  tripLogCreate,
  tripLogDelete,
  tripLogAuthorize,
  tripLogUnauthorize
};
