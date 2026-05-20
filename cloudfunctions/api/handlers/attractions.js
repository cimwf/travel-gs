const { db } = require('../utils/shared');

async function attractionsList() {
  try {
    const res = await db.collection('quick_attractions')
      .limit(200)
      .get();

    const attractions = res.data || [];
    return { success: true, attractions };
  } catch (err) {
    console.error('获取景点列表失败:', err);
    return { success: false, error: err.message };
  }
}

async function attractionsGet(placeId) {
  if (!placeId) {
    return { success: false, error: '景点ID不能为空' };
  }

  try {
    const res = await db.collection('quick_attractions').doc(placeId).get();
    return { success: true, place: res.data };
  } catch (err) {
    console.error('获取景点详情失败:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  attractionsList,
  attractionsGet
};
