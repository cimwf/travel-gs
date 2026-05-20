const { db } = require('../utils/shared');

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

module.exports = {
  userSpotsCreate
};
