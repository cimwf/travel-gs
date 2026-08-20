const { db, cloud } = require('../utils/shared');
const crypto = require('crypto');

const ADMIN_COLLECTION = 'admin_users';
const RESOURCES = {
  places: { collection: 'places', keywordField: 'name', defaultOrder: [['sortOrder', 'asc']] },
  quickAttractions: { collection: 'quick_attractions', keywordField: 'name', defaultOrder: [['createdAt', 'desc']] },
  feedbacks: { collection: 'feedbacks', defaultOrder: [['createdAt', 'desc']] },
  userSpots: { collection: 'user_spots', keywordField: 'placeName', defaultOrder: [['createdAt', 'desc']] },
  banners: { collection: 'banners', defaultOrder: [['sort', 'asc'], ['createdAt', 'desc']] },
  users: { collection: 'users', keywordField: 'nickname', defaultOrder: [['createdAt', 'desc']] },
  viewStats: { collection: 'place_view_stats', defaultOrder: [['date', 'desc']] },
  userStats: { collection: 'user_stats', defaultOrder: [['date', 'desc']] },
  images: { collection: 'beImages', defaultOrder: [['createdAt', 'desc']] },
  imageFolders: { collection: 'beImage_folder', defaultOrder: [['createdAt', 'desc']] }
};

async function requireAdmin(adminId) {
  if (!adminId) throw new Error('管理员身份已失效，请重新登录');
  const result = await db.collection(ADMIN_COLLECTION).doc(String(adminId)).get();
  const admin = result && result.data;
  if (!admin || !['admin', 'operator', 'viewer'].includes(admin.role || 'admin')) {
    throw new Error('管理员身份无效');
  }
  return admin;
}

async function requireEditor(adminId) {
  const admin = await requireAdmin(adminId);
  if (!['admin', 'operator'].includes(admin.role || 'admin')) throw new Error('当前账号没有编辑权限');
  return admin;
}

async function adminLogin(data = {}) {
  try {
    const username = String(data.username || '').trim();
    const password = String(data.password || '');
    if (!username || !password) throw new Error('请输入用户名和密码');
    const passwordHash = crypto.createHash('md5').update(password).digest('hex');
    const result = await db.collection(ADMIN_COLLECTION).where({ username, password: passwordHash }).limit(1).get();
    const admin = result.data && result.data[0];
    if (!admin) throw new Error('用户名或密码错误');
    await db.collection(ADMIN_COLLECTION).doc(admin._id).update({ data: { lastLoginAt: Date.now() } });
    return { success: true, user: {
      id: admin._id,
      username: admin.username || '',
      nickname: admin.nickname || admin.username || '',
      role: admin.role || 'admin',
      permissions: admin.permissions || ['*'],
      createdAt: admin.createdAt || 0,
      lastLoginAt: Date.now()
    } };
  } catch (error) {
    return { success: false, error: error.message || '登录失败' };
  }
}

async function adminRegister(data = {}) {
  try {
    const existing = await db.collection(ADMIN_COLLECTION).count();
    if (existing.total > 0) throw new Error('管理员已存在，请联系现有管理员添加账号');
    const username = String(data.username || '').trim();
    const password = String(data.password || '');
    if (!username || password.length < 6) throw new Error('用户名不能为空，密码至少6位');
    const now = Date.now();
    await db.collection(ADMIN_COLLECTION).add({ data: {
      username,
      password: crypto.createHash('md5').update(password).digest('hex'),
      nickname: String(data.nickname || username).trim(),
      role: 'admin', permissions: ['*'], createdAt: now, lastLoginAt: now
    } });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || '注册失败' };
  }
}

function getResource(name) {
  const resource = RESOURCES[name];
  if (!resource) throw new Error('不支持的数据资源');
  return resource;
}

function buildCondition(resource, data) {
  const condition = {};
  const filters = data.filters && typeof data.filters === 'object' ? data.filters : {};
  Object.keys(filters).forEach((key) => {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '' && value !== 'all') condition[key] = value;
  });
  const keyword = String(data.keyword || '').trim();
  if (keyword && resource.keywordField) {
    condition[resource.keywordField] = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
  }
  return condition;
}

async function resolveCloudUrls(items, fields) {
  const fileIds = [];
  const getValue = (item, path) => path.split('.').reduce((value, key) => value && value[key], item);
  const setValue = (item, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((current, key) => current && current[key], item);
    if (target && last) target[last] = value;
  };
  items.forEach((item) => fields.forEach((field) => {
    const value = getValue(item, field);
    if (typeof value === 'string' && value.startsWith('cloud://') && !fileIds.includes(value)) fileIds.push(value);
  }));
  if (!fileIds.length) return;
  const result = await cloud.getTempFileURL({ fileList: fileIds });
  const urlMap = {};
  (result.fileList || []).forEach((file) => { if (file.fileID && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL; });
  items.forEach((item) => fields.forEach((field) => {
    const value = getValue(item, field);
    if (urlMap[value]) setValue(item, field, urlMap[value]);
  }));
}

async function adminDataList(data = {}) {
  try {
    await requireAdmin(data.adminId);
    const resource = getResource(data.resource);
    const page = Math.max(1, Number(data.page) || 1);
    const pageSize = Math.max(1, Math.min(Number(data.pageSize) || 10, 2000));
    const condition = buildCondition(resource, data);
    const base = db.collection(resource.collection);
    const countQuery = Object.keys(condition).length ? base.where(condition) : base;
    let listQuery = Object.keys(condition).length ? db.collection(resource.collection).where(condition) : db.collection(resource.collection);
    const order = Array.isArray(data.orderBy) && data.orderBy.length ? data.orderBy : resource.defaultOrder;
    order.forEach((entry) => {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && ['asc', 'desc'].includes(entry[1])) {
        listQuery = listQuery.orderBy(entry[0], entry[1]);
      }
    });
    const [countResult, listResult] = await Promise.all([
      countQuery.count(),
      listQuery.skip((page - 1) * pageSize).limit(pageSize).get()
    ]);
    const items = listResult.data || [];
    const cloudFields = Array.isArray(data.cloudFields) ? data.cloudFields.filter((field) => typeof field === 'string') : [];
    if (cloudFields.length) await resolveCloudUrls(items, cloudFields);
    return { success: true, items, total: countResult.total || 0, page, pageSize };
  } catch (error) {
    console.error('admin data list failed:', error);
    return { success: false, error: error.message || '数据加载失败' };
  }
}

async function adminDataGet(data = {}) {
  try {
    await requireAdmin(data.adminId);
    const resource = getResource(data.resource);
    if (!data.id) throw new Error('数据ID不能为空');
    const result = await db.collection(resource.collection).doc(String(data.id)).get();
    return { success: true, item: result.data || null };
  } catch (error) {
    return { success: false, error: error.message || '数据读取失败' };
  }
}

async function adminDataCreate(data = {}) {
  try {
    await requireEditor(data.adminId);
    const resource = getResource(data.resource);
    const payload = data.payload && typeof data.payload === 'object' ? { ...data.payload } : {};
    delete payload._id;
    const result = await db.collection(resource.collection).add({ data: payload });
    return { success: true, id: result._id };
  } catch (error) {
    return { success: false, error: error.message || '数据创建失败' };
  }
}

async function adminDataUpdate(data = {}) {
  try {
    await requireEditor(data.adminId);
    const resource = getResource(data.resource);
    if (!data.id) throw new Error('数据ID不能为空');
    const payload = data.payload && typeof data.payload === 'object' ? { ...data.payload } : {};
    delete payload._id;
    await db.collection(resource.collection).doc(String(data.id)).update({ data: payload });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || '数据更新失败' };
  }
}

async function adminDataDelete(data = {}) {
  try {
    await requireEditor(data.adminId);
    const resource = getResource(data.resource);
    if (!data.id) throw new Error('数据ID不能为空');
    if (data.resource === 'imageFolders') {
      const images = await db.collection(RESOURCES.images.collection).where({ folderId: String(data.id) }).count();
      if (images.total > 0) throw new Error('文件夹下有图片，请先删除图片');
    }
    await db.collection(resource.collection).doc(String(data.id)).remove();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || '数据删除失败' };
  }
}

async function adminDataBatchCreate(data = {}) {
  try {
    await requireEditor(data.adminId);
    const resource = getResource(data.resource);
    const items = Array.isArray(data.items) ? data.items.slice(0, 500) : [];
    let count = 0;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const payload = { ...item };
      delete payload._id;
      await db.collection(resource.collection).add({ data: payload });
      count += 1;
    }
    return { success: true, count };
  } catch (error) {
    return { success: false, error: error.message || '批量创建失败' };
  }
}

async function adminSpotPublish(data = {}) {
  try {
    await requireEditor(data.adminId);
    const id = String(data.id || '');
    if (!id) throw new Error('数据ID不能为空');
    const result = await db.collection(RESOURCES.userSpots.collection).doc(id).get();
    const spot = result && result.data;
    if (!spot || !spot.placeName) throw new Error('景点数据不存在');
    await db.collection(RESOURCES.quickAttractions.collection).add({ data: {
      name: spot.placeName,
      location: spot.location || '',
      coverImage: spot.coverImage || '',
      createdAt: Date.now()
    } });
    await db.collection(RESOURCES.userSpots.collection).doc(id).update({ data: { status: 'approved' } });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || '景点上线失败' };
  }
}

module.exports = {
  requireAdmin,
  requireEditor,
  adminLogin,
  adminRegister,
  adminDataList,
  adminDataGet,
  adminDataCreate,
  adminDataUpdate,
  adminDataDelete,
  adminDataBatchCreate,
  adminSpotPublish
};
