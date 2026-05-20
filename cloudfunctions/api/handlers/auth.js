const { db, _, crypto } = require('../utils/shared');

async function getPublicKey() {
  try {
    const keyData = crypto.createKeyPair();
    return {
      success: true,
      data: {
        keyId: keyData.keyId,
        publicKey: keyData.publicKey,
        expiresIn: keyData.expiresIn
      }
    };
  } catch (err) {
    console.error('生成公钥失败:', err);
    return { success: false, error: '生成公钥失败' };
  }
}

async function authTrackEvent(data) {
  const { eventType, openid } = data;

  if (!eventType || !openid) {
    return { success: false, error: '参数不完整' };
  }

  if (eventType !== 'loginSuccess') {
    return { success: false, error: '不支持的统计事件' };
  }

  try {
    return await recordUserStatEvent(eventType, openid, data.extra || {});
  } catch (err) {
    console.error('记录事件失败:', err);
    return { success: false, error: err.message };
  }
}

async function recordUserStatEvent(eventType, openid, extra = {}) {
  if (!eventType || !openid) {
    return { success: false, error: '参数不完整' };
  }

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const statsRes = await db.collection('user_stats')
    .where({ type: eventType, date: dateStr })
    .get();

  if (statsRes.data.length > 0) {
    const existing = statsRes.data[0];
    const openids = existing.openids || [];

    if (openids.includes(openid)) {
      return { success: true, duplicated: true };
    }

    await db.collection('user_stats').doc(existing._id).update({
      data: {
        count: _.inc(1),
        openids: _.push(openid),
        updatedAt: Date.now(),
        lastExtra: extra
      }
    });
  } else {
    await db.collection('user_stats').add({
      data: {
        type: eventType,
        date: dateStr,
        count: 1,
        openids: [openid],
        lastExtra: extra,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    });
  }

  return { success: true };
}

module.exports = {
  getPublicKey,
  authTrackEvent,
  recordUserStatEvent
};
