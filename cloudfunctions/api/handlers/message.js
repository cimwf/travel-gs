const { db, safeAvatar } = require('../utils/shared');

async function messageSend(openid, data) {
  const { toUserId, content, type = 'text', conversationId } = data;

  const userRes = await db.collection('users').where({ openid }).get();
  const user = userRes.data[0];

  const newMessage = {
    conversationId,
    fromUserId: openid,
    fromUserName: user.nickname,
    fromUserAvatar: safeAvatar(user.avatar),
    toUserId,
    content,
    type,
    read: false,
    createdAt: Date.now()
  };

  const res = await db.collection('messages').add({ data: newMessage });
  newMessage._id = res._id;

  return { success: true, message: newMessage };
}

async function messageList(openid, data) {
  const { conversationId, page = 1, pageSize = 50 } = data;

  const res = await db.collection('messages')
    .where({ conversationId })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return { success: true, messages: res.data.reverse() };
}

async function messageRead(messageId) {
  await db.collection('messages').doc(messageId).update({
    data: { read: true }
  });

  return { success: true };
}

module.exports = {
  messageSend,
  messageList,
  messageRead
};
