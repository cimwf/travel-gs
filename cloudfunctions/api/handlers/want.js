const { db, _ } = require('../utils/shared');

async function wantToggle(openid, data) {
  const { placeId } = data;

  const placeRes = await db.collection('places').doc(placeId).get();
  const place = placeRes.data;

  const existWant = await db.collection('wants')
    .where({ placeId, userId: openid })
    .get();

  if (existWant.data.length > 0) {
    await db.collection('wants').doc(existWant.data[0]._id).remove();
    await db.collection('places').doc(placeId).update({
      data: { wantCount: _.inc(-1) }
    });
    return { success: true, wanted: false };
  }

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

module.exports = {
  wantToggle,
  wantList
};
