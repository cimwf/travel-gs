const { db, _ } = require('../utils/shared');

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

async function placeView(placeId) {
  if (!placeId) {
    return { success: false, error: '地点ID不能为空' };
  }

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  try {
    await db.collection('places').doc(placeId).update({
      data: { viewCount: _.inc(1) }
    });

    const viewStatsRes = await db.collection('place_view_stats')
      .where({ placeId, date: dateStr })
      .get();

    if (viewStatsRes.data.length > 0) {
      await db.collection('place_view_stats').doc(viewStatsRes.data[0]._id).update({
        data: {
          count: _.inc(1),
          updatedAt: Date.now()
        }
      });
    } else {
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

module.exports = {
  placeList,
  placeGet,
  placeView,
  placeSearch
};
