const { db } = require('../utils/shared');
const { requireAdmin, requireEditor } = require('./adminData');
const {
  TRIP_LIST_VISIBILITY_CONFIG_ID,
  DATA_ENVS,
  normalizeVisibilityConfig
} = require('../utils/tripListVisibility');

async function readTripListVisibilityDocument() {
  try {
    const result = await db.collection('system_config')
      .doc(TRIP_LIST_VISIBILITY_CONFIG_ID)
      .get();
    return result && result.data || null;
  } catch (error) {
    const message = String(error && error.message || '');
    const collectionMissing = (error && error.errCode === -502005) ||
      (error && error.code === 'DATABASE_COLLECTION_NOT_EXIST') ||
      /collection not exists|Db or Table not exist|集合不存在/i.test(message);
    if (collectionMissing) {
      throw new Error('请先在云数据库创建 system_config 集合');
    }
    // 配置尚未创建时按默认关闭处理，后台第一次保存会自动创建。
    if (error && (error.errCode === -1 || error.code === 'DATABASE_DOCUMENT_NOT_EXIST')) return null;
    if (/not exist|不存在|not found/i.test(message)) return null;
    throw error;
  }
}

async function adminTripListVisibilityGet(data = {}) {
  try {
    await requireAdmin(data.adminId);
    const document = await readTripListVisibilityDocument();
    return {
      success: true,
      config: normalizeVisibilityConfig(document || {}),
      updatedAt: document && document.updatedAt || 0,
      updatedBy: document && document.updatedBy || ''
    };
  } catch (error) {
    return { success: false, error: error.message || '读取行程展示设置失败' };
  }
}

async function adminTripListVisibilityUpdate(data = {}) {
  try {
    const admin = await requireEditor(data.adminId);
    const dataEnv = String(data.dataEnv || '');
    if (!DATA_ENVS.includes(dataEnv)) throw new Error('数据环境无效');
    if (typeof data.enabled !== 'boolean') throw new Error('开关状态无效');

    const existing = await readTripListVisibilityDocument();
    const showPastTripsByEnv = normalizeVisibilityConfig(existing || {});
    showPastTripsByEnv[dataEnv] = data.enabled;
    const now = Date.now();

    await db.collection('system_config').doc(TRIP_LIST_VISIBILITY_CONFIG_ID).set({
      data: {
        showPastTripsByEnv,
        updatedAt: now,
        updatedBy: admin.nickname || admin.username || admin._id || String(data.adminId)
      }
    });

    return { success: true, config: showPastTripsByEnv, updatedAt: now };
  } catch (error) {
    return { success: false, error: error.message || '保存行程展示设置失败' };
  }
}

module.exports = {
  adminTripListVisibilityGet,
  adminTripListVisibilityUpdate
};
