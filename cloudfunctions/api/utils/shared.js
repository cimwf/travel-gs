const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const crypto = require('./crypto');

function isLocalTempFilePath(path) {
  return typeof path === 'string' && (
    path.startsWith('wxfile://') ||
    path.startsWith('http://tmp') ||
    path.startsWith('https://tmp') ||
    path.startsWith('tmp/')
  );
}

function normalizeAvatarForDb(avatar) {
  if (!avatar || isLocalTempFilePath(avatar)) {
    return '';
  }
  return avatar;
}

function safeAvatar(avatar) {
  return normalizeAvatarForDb(avatar);
}

module.exports = {
  cloud,
  db,
  _,
  crypto,
  isLocalTempFilePath,
  normalizeAvatarForDb,
  safeAvatar
};
