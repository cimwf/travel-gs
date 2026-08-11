const { db, _, cloud } = require('../utils/shared');

const POSTS_COLLECTION = 'community_posts';
const NOTIFICATIONS_COLLECTION = 'notifications';
const ADMIN_COLLECTION = 'admin_users';
const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
const MACHINE_SUGGESTS = ['pass', 'review', 'risky'];

async function resolveCurrentAuthorProfiles(posts) {
  const authorIds = [];
  (posts || []).forEach((post) => {
    if (post.authorId && !authorIds.includes(post.authorId)) authorIds.push(post.authorId);
  });
  if (authorIds.length === 0) return;

  const result = await db.collection('users').where({
    openid: _.in(authorIds)
  }).get();
  const profiles = {};
  (result.data || []).forEach((user) => {
    if (user.openid) profiles[user.openid] = user;
  });
  posts.forEach((post) => {
    const profile = profiles[post.authorId];
    if (!profile) return;
    if (profile.nickname) post.authorName = profile.nickname;
    if (profile.avatar) post.authorAvatar = profile.avatar;
  });
}

async function resolveAvatarUrls(posts) {
  const fileIds = [];
  (posts || []).forEach((post) => {
    if (typeof post.authorAvatar === 'string' && post.authorAvatar.startsWith('cloud://')) {
      fileIds.push(post.authorAvatar);
    }
  });
  if (fileIds.length === 0) return;

  const result = await cloud.getTempFileURL({ fileList: fileIds });
  const urlMap = {};
  (result.fileList || []).forEach((file) => {
    if (file.fileID && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL;
  });
  posts.forEach((post) => {
    if (urlMap[post.authorAvatar]) post.authorAvatar = urlMap[post.authorAvatar];
  });
}

async function requireAdmin(adminId) {
  if (!adminId) throw new Error('管理员身份已失效，请重新登录');
  let result;
  try {
    result = await db.collection(ADMIN_COLLECTION).doc(adminId).get();
  } catch (error) {
    throw new Error('管理员身份不存在，请重新登录');
  }
  const admin = result && result.data;
  if (!admin || !['admin', 'operator'].includes(admin.role || 'admin')) {
    throw new Error('无社区审核权限');
  }
  return admin;
}

function getThumbnail(post) {
  const first = Array.isArray(post.images) ? post.images[0] : null;
  return typeof first === 'string' ? first : (first && first.url || '');
}

async function saveResultNotification(post, decision) {
  const now = Date.now();
  const type = decision === 'approved' ? 'community_review_approved' : 'community_review_rejected';
  const oppositeType = decision === 'approved' ? 'community_review_rejected' : 'community_review_approved';
  const sourceId = post._id + ':admin';
  const payload = {
    receiverId: post.authorId,
    category: 'system',
    type,
    actorId: '',
    actorName: '',
    actorAvatar: '',
    targetType: decision === 'approved' ? 'community_post' : 'my_works',
    targetId: post._id,
    sourceType: 'review',
    sourceId,
    title: decision === 'approved' ? '作品复核通过' : '作品复核未通过',
    actionText: '',
    content: decision === 'approved'
      ? '你的作品已通过人工复核并正常展示'
      : '你的作品未通过人工复核，可前往我的作品查看',
    thumbnail: getThumbnail(post),
    isRead: false,
    readAt: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };

  await db.collection(NOTIFICATIONS_COLLECTION)
    .where({ receiverId: post.authorId, type: oppositeType, sourceId })
    .remove();

  const existing = await db.collection(NOTIFICATIONS_COLLECTION)
    .where({ receiverId: post.authorId, type, sourceId })
    .limit(1)
    .get();
  if (existing.data && existing.data[0] && existing.data[0]._id) {
    await db.collection(NOTIFICATIONS_COLLECTION).doc(existing.data[0]._id).update({ data: payload });
  } else {
    await db.collection(NOTIFICATIONS_COLLECTION).add({ data: payload });
  }
}

async function adminCommunityReviewList(data = {}) {
  try {
    await requireAdmin(String(data.adminId || ''));
    const page = Math.max(1, Number(data.page) || 1);
    const pageSize = Math.max(1, Math.min(Number(data.pageSize) || 10, 50));
    const reviewStatus = REVIEW_STATUSES.includes(data.reviewStatus) ? data.reviewStatus : 'pending';
    const machineSuggest = data.machineSuggest === 'all' || MACHINE_SUGGESTS.includes(data.machineSuggest)
      ? data.machineSuggest
      : 'all';

    const condition = { status: 'active' };
    if (reviewStatus === 'approved') {
      condition.reviewStatus = 'approved';
    } else {
      condition.adminReviewStatus = reviewStatus;
    }
    condition.machineSuggest = machineSuggest === 'all'
      ? _.in(MACHINE_SUGGESTS)
      : machineSuggest;

    const results = await Promise.all([
      db.collection(POSTS_COLLECTION).where(condition).count(),
      db.collection(POSTS_COLLECTION).where(condition)
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
    ]);
    const posts = results[1].data || [];
    try {
      await resolveCurrentAuthorProfiles(posts);
      await resolveAvatarUrls(posts);
    } catch (profileError) {
      console.warn('admin community author profile resolution failed:', profileError);
    }
    return {
      success: true,
      posts,
      total: results[0].total || 0,
      page,
      pageSize
    };
  } catch (error) {
    console.error('admin community review list failed:', error);
    return { success: false, error: error.message || '审核列表加载失败' };
  }
}

async function adminCommunityReviewUpdate(data = {}) {
  try {
    const admin = await requireAdmin(String(data.adminId || ''));
    const postId = String(data.postId || '');
    const decision = data.decision;
    if (!postId) throw new Error('作品ID不能为空');
    if (decision !== 'approved' && decision !== 'rejected') throw new Error('审核结论无效');

    const postResult = await db.collection(POSTS_COLLECTION).doc(postId).get();
    const post = postResult && postResult.data;
    if (!post || post.status !== 'active') throw new Error('作品不存在或已删除');

    const now = Date.now();
    await db.collection(POSTS_COLLECTION).doc(postId).update({
      data: {
        reviewStatus: decision === 'approved' ? 'approved' : 'rejected',
        imageAuditStatus: decision === 'approved' ? 'approved' : 'rejected',
        adminReviewStatus: decision,
        adminReviewRemark: String(data.remark || '').trim().slice(0, 200),
        adminReviewedAt: now,
        adminReviewerName: String(data.reviewerName || admin.nickname || admin.username || '管理员'),
        updatedAt: now
      }
    });

    try {
      await saveResultNotification(post, decision);
    } catch (notificationError) {
      console.error('admin community review notification failed:', notificationError);
      return {
        success: true,
        message: decision === 'approved'
          ? '已审核通过，但用户通知写入失败'
          : '已审核不通过，但用户通知写入失败'
      };
    }
    return { success: true, message: decision === 'approved' ? '已审核通过' : '已审核不通过' };
  } catch (error) {
    console.error('admin community review update failed:', error);
    return { success: false, error: error.message || '审核操作失败' };
  }
}

module.exports = {
  adminCommunityReviewList,
  adminCommunityReviewUpdate
};
