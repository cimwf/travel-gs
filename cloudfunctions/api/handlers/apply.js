const { db, _, cloud, safeAvatar } = require('../utils/shared');
const { tripJoin } = require('./trip');
const { setNotification } = require('./notification');

function getTripTitle(trip, fallback) {
  return trip && (trip.tripTitle || trip.placeName) || fallback || '行程';
}

function getTripThumbnail(trip) {
  if (!trip) return '';
  return (Array.isArray(trip.coverImageUrls) && trip.coverImageUrls[0]) ||
    (Array.isArray(trip.coverImages) && trip.coverImages[0]) ||
    trip.placeCoverImage || trip.tripImage || '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

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

async function resolveCloudFileUrl(fileID = '') {
  if (!fileID || !fileID.startsWith('cloud://')) {
    return fileID || '';
  }

  try {
    const urlRes = await cloud.getTempFileURL({ fileList: [fileID] });
    const file = urlRes.fileList && urlRes.fileList[0];
    return (file && file.tempFileURL) || '';
  } catch (err) {
    console.warn('获取行程头像临时链接失败', err);
    return '';
  }
}

async function getTripCardCover(tripData, fallbackCover = '') {
  const customCover = await resolveCloudFileUrl((tripData && tripData.customCoverImage) || '');
  return customCover || fallbackCover || '';
}

async function applyCreate(openid, data) {
  const tripId = String(data && data.tripId || '').trim();
  const message = String(data && data.message || '').trim();

  if (!tripId) {
    return { success: false, error: '行程ID不能为空' };
  }
  if (message.length > 200) {
    return { success: false, error: '申请留言不能超过200字' };
  }

  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];
  if (!user) {
    return { success: false, error: '用户不存在' };
  }

  let tripData;
  try {
    const tripRes = await db.collection('trips').doc(tripId).get();
    tripData = tripRes && tripRes.data;
  } catch (err) {
    console.warn('获取申请行程失败', err);
  }
  if (!tripData) return { success: false, error: '行程不存在' };
  if (tripData.reviewStatus === 'rejected') return { success: false, error: '该行程暂无法申请加入' };
  if (!tripData.creatorId) return { success: false, error: '行程发起人信息不完整' };
  if (tripData.creatorId === openid) return { success: false, error: '不能申请加入自己的行程' };
  if (tripData.status !== 'open' || (tripData.tripStage || 'not_started') !== 'not_started') {
    return { success: false, error: '该行程已无法申请加入' };
  }
  if ((Number(tripData.needCount) || 0) <= 0) {
    return { success: false, error: '行程名额已满' };
  }
  if ((Array.isArray(tripData.participants) ? tripData.participants : []).some(item => item.userId === openid)) {
    return { success: false, error: '您已参与该行程' };
  }

  // 一键申请防止连点和重复进入产生多条待处理记录。
  try {
    const existingRes = await db.collection('applies').where({ ownerId: openid }).get();
    const existing = (existingRes.data || []).find(item =>
      item.tripId === tripId && item.fromUserId === openid && item.status === 'pending'
    );
    if (existing) return { success: true, alreadyApplied: true };
  } catch (err) {
    console.warn('检查重复申请失败', err);
  }

  const now = Date.now();
  const groupId = 'group_' + now + '_' + Math.random().toString(36).slice(2, 8);
  const tripTitle = getTripTitle(tripData);

  const commonData = {
    tripId,
    placeId: tripData.placeId || '',
    placeName: tripData.placeName || '',
    tripTitle,
    fromUserId: openid,
    fromUserName: user.nickname || '旅行者',
    fromUserAvatar: safeAvatar(user.avatar),
    toUserId: tripData.creatorId,
    toUserName: tripData.creatorName || '',
    contactType: '',
    contactValue: '',
    message,
    status: 'pending',
    groupId,
    createdAt: now
  };

  await db.collection('applies').add({
    data: { ...commonData, ownerId: openid, unread: false }
  });

  const receivedRes = await db.collection('applies').add({
    data: { ...commonData, ownerId: tripData.creatorId, unread: true }
  });

  await setNotification(db, {
    receiverId: tripData.creatorId,
    category: 'trip',
    type: 'trip_apply_received',
    actorId: openid,
    actorName: user.nickname || '旅行者',
    actorAvatar: safeAvatar(user.avatar),
    targetType: 'trip_apply',
    targetId: receivedRes._id,
    sourceType: 'apply',
    sourceId: groupId,
    title: '行程申请',
    actionText: '申请加入',
    content: tripTitle,
    thumbnail: getTripThumbnail(tripData),
    createdAt: now
  });

  return { success: true, applyId: receivedRes._id };
}

async function applyList(openid, data) {
  const { type = 'received' } = data;

  const res = await db.collection('applies')
    .where({ ownerId: openid })
    .orderBy('createdAt', 'desc')
    .get();

  const applies = (res.data || []).filter(item => {
    if (type === 'received') return item.ownerId === item.toUserId;
    return item.ownerId === item.fromUserId;
  });

  return { success: true, applies };
}

async function applyHandle(openid, data) {
  const { applyId, accept } = data;

  const applyRes = await db.collection('applies').doc(applyId).get();
  const apply = applyRes.data;

  if (!apply) return { success: false, error: '申请不存在' };

  if (apply.ownerId !== openid || apply.toUserId !== openid) {
    return { success: false, error: '无权处理该申请' };
  }

  if (apply.status !== 'pending') {
    return {
      success: true,
      status: apply.status,
      alreadyHandled: true
    };
  }

  if (accept && apply.fromUserId && apply.tripId) {
    const joinResult = await tripJoin(apply.fromUserId, {
      tripId: apply.tripId,
      contactValue: ''
    });
    if (!joinResult || !joinResult.success) {
      return { success: false, error: joinResult && joinResult.error || '加入行程失败' };
    }
  }

  await db.collection('applies').doc(applyId).update({
    data: { status: accept ? 'accepted' : 'rejected', unread: false }
  });

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
          data: { status: accept ? 'accepted' : 'rejected', unread: !!accept }
        });
      }
    } catch (err) {
      console.warn('同步更新对方记录状态失败', err);
    }
  }

  let tripData = null;
  try {
    const tripRes = await db.collection('trips').doc(apply.tripId).get();
    tripData = tripRes && tripRes.data;
  } catch (err) {
    console.warn('生成申请处理通知时读取行程失败', err);
  }
  // 只在通过时通知申请人；拒绝不发送任何通知。
  if (accept) {
    const now = Date.now();
    await setNotification(db, {
      receiverId: apply.fromUserId,
      category: 'trip',
      type: 'trip_apply_accepted',
      actorId: openid,
      actorName: apply.toUserName || (tripData && tripData.creatorName) || '行程发起人',
      actorAvatar: tripData && tripData.creatorAvatar || '',
      targetType: 'trip',
      targetId: apply.tripId,
      sourceType: 'apply',
      sourceId: apply.groupId || apply._id,
      title: getTripTitle(tripData, apply.tripTitle || apply.placeName),
      actionText: '',
      content: '恭喜你已通过申请，期待与你一起出发',
      thumbnail: getTripThumbnail(tripData),
      createdAt: now
    });
  }

  return { success: true, status: accept ? 'accepted' : 'rejected' };
}

async function applyNotifications(openid, page = 1, pageSize = 5) {
  const receivedList = [];
  const sentList = [];

  const skip = (page - 1) * pageSize;

  const allRes = await db.collection('applies')
    .where({ ownerId: openid })
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize + 1)
    .get();

  const hasMore = (allRes.data || []).length > pageSize;
  const pageItems = (allRes.data || []).slice(0, pageSize);

  const receivedItems = [];
  const sentItems = [];
  for (const item of pageItems) {
    if (item.ownerId === item.toUserId) {
      receivedItems.push(item);
    } else {
      sentItems.push(item);
    }
  }

  const fileIDs = [];
  [...receivedItems, ...sentItems].forEach(item => {
    if (item.fromUserAvatar && item.fromUserAvatar.startsWith('cloud://')) {
      fileIDs.push(item.fromUserAvatar);
    }
  });

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

  for (const item of receivedItems) {
    let avatar = item.fromUserAvatar || '';
    if (avatar && avatar.startsWith('cloud://') && avatarMap[avatar]) {
      avatar = avatarMap[avatar];
    }
    if (avatar && !avatar.startsWith('http')) {
      avatar = '';
    }

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
    placeCoverImage = await getTripCardCover(tripData, placeCoverImage);

    if (item.status === 'quit') {
      receivedList.push({
        _id: item._id,
        type: 'received',
        fromUserId: item.fromUserId || '',
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
        unread: !!item.unread,
        createdAt: item.createdAt
      });
    } else if (item.status === 'removed') {
      receivedList.push({
        _id: item._id,
        type: 'received',
        fromUserId: item.fromUserId || '',
        profileUserId: item.fromUserId || '',
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
        unread: !!item.unread,
        createdAt: item.createdAt
      });
    } else if (item.status === 'cancelled') {
      receivedList.push({
        _id: item._id,
        type: 'received',
        fromUserId: item.fromUserId || '',
        profileUserId: item.fromUserId || '',
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
        unread: !!item.unread,
        createdAt: item.createdAt
      });
    } else if (item.status === 'deleted') {
      receivedList.push({
        _id: item._id,
        type: 'received',
        fromUserId: item.fromUserId || '',
        profileUserId: item.fromUserId || '',
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
        unread: !!item.unread,
        createdAt: item.createdAt
      });
    } else {
      receivedList.push({
        _id: item._id,
        type: 'received',
        fromUserId: item.fromUserId || '',
        profileUserId: item.fromUserId || '',
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
        unread: !!item.unread,
        createdAt: item.createdAt
      });
    }
  }

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
    placeCoverImage = await getTripCardCover(tripData, placeCoverImage);

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
      unread: !!item.unread,
      createdAt: item.createdAt
    });
  }

  const notifications = [...receivedList, ...sentList].sort((a, b) => {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return { success: true, notifications, hasMore };
}

async function applyDelete(openid, data) {
  const { applyId } = data;

  if (!applyId) {
    return { success: false, error: '申请ID不能为空' };
  }

  const applyRes = await db.collection('applies').doc(applyId).get();
  const apply = applyRes.data;

  if (!apply) {
    return { success: false, error: '申请记录不存在' };
  }

  if (apply.ownerId !== openid) {
    return { success: false, error: '无权删除此通知' };
  }

  await db.collection('applies').doc(applyId).remove();

  return { success: true };
}

async function applyCancel(openid, data) {
  const { applyId } = data;

  if (!applyId) {
    return { success: false, error: '申请ID不能为空' };
  }

  const applyRes = await db.collection('applies').doc(applyId).get();
  const apply = applyRes.data;

  if (!apply) {
    return { success: false, error: '申请记录不存在' };
  }

  if (apply.ownerId !== openid) {
    return { success: false, error: '无权取消此申请' };
  }

  await db.collection('applies').doc(applyId).update({
    data: { status: 'cancelled', unread: false }
  });

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

  let tripData = null;
  try {
    const tripRes = await db.collection('trips').doc(apply.tripId).get();
    tripData = tripRes && tripRes.data;
  } catch (err) {
    console.warn('生成取消申请通知时读取行程失败', err);
  }
  await setNotification(db, {
    receiverId: apply.toUserId,
    category: 'trip',
    type: 'trip_apply_cancelled',
    actorId: openid,
    actorName: apply.fromUserName || '旅行者',
    actorAvatar: apply.fromUserAvatar || '',
    targetType: 'trip',
    targetId: apply.tripId,
    sourceType: 'apply',
    sourceId: apply.groupId || apply._id,
    title: '申请已取消',
    actionText: '取消了加入申请',
    content: getTripTitle(tripData, apply.placeName),
    thumbnail: getTripThumbnail(tripData),
    createdAt: Date.now()
  });

  return { success: true };
}

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

module.exports = {
  applyCreate,
  applyList,
  applyHandle,
  applyNotifications,
  applyDelete,
  applyCancel,
  applyUnreadCount,
  applyMarkRead
};
