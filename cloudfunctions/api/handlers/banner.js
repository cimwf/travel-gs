const { db } = require('../utils/shared');

async function bannerList() {
  const res = await db.collection('banners')
    .orderBy('sort', 'asc')
    .limit(10)
    .get();

  return { success: true, banners: res.data };
}

module.exports = {
  bannerList
};
