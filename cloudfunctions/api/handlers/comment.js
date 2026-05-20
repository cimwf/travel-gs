const { db, safeAvatar } = require('../utils/shared');

async function commentCreate(openid, data) {
  const { placeId, content, rating, images } = data;

  const placeRes = await db.collection('places').doc(placeId).get();
  const place = placeRes.data;

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

module.exports = {
  commentCreate,
  commentList
};
