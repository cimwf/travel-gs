const { db, safeAvatar } = require('../utils/shared');

async function feedbackCreate(openid, data) {
  const { title, content, contact } = data;

  if (!content || !content.trim()) {
    return { success: false, error: '详细描述不能为空' };
  }

  let userInfo = null;
  if (openid) {
    try {
      const userRes = await db.collection('users').where({ openid }).get();
      if (userRes.data.length > 0) {
        userInfo = {
          nickname: userRes.data[0].nickname,
          avatar: safeAvatar(userRes.data[0].avatar)
        };
      }
    } catch (err) {
      console.warn('获取用户信息失败', err);
    }
  }

  const newFeedback = {
    title: title ? title.trim() : '',
    content: content.trim(),
    contact: contact ? contact.trim() : '',
    userId: openid || '',
    userInfo: userInfo,
    status: 'pending',
    createdAt: Date.now()
  };

  const res = await db.collection('feedbacks').add({ data: newFeedback });
  newFeedback._id = res._id;

  return { success: true, feedback: newFeedback };
}

module.exports = {
  feedbackCreate
};
