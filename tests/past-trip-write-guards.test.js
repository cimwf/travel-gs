#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const authPath = path.join(apiRoot, 'handlers', 'auth.js');
const notificationPath = path.join(apiRoot, 'handlers', 'notification.js');
const tripMediaPath = path.join(apiRoot, 'handlers', 'tripMedia.js');
const tripPath = path.join(apiRoot, 'handlers', 'trip.js');
const applyPath = path.join(apiRoot, 'handlers', 'apply.js');
const tripLogPath = path.join(apiRoot, 'handlers', 'tripLog.js');

const pastTrip = {
  _id: 'past-trip',
  date: '2020-01-01',
  creatorId: 'creator-1',
  reviewStatus: 'approved',
  status: 'open',
  tripStage: 'ongoing',
  needCount: 3,
  participants: [{ userId: 'creator-1' }],
  logAuthorizedPublisherIds: ['member-1']
};

const db = {
  collection(name) {
    if (name === 'trips') {
      return {
        doc() {
          return {
            async get() { return { data: { ...pastTrip } }; },
            async update() { throw new Error('往期保护失败：不应执行数据库更新'); }
          };
        }
      };
    }
    if (name === 'users') {
      return {
        where() {
          return { async get() { return { data: [{ _id: 'user-1', openid: 'member-1', nickname: '成员' }] }; } };
        }
      };
    }
    throw new Error(`往期保护前不应访问集合: ${name}`);
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db, _: {}, cloud: {}, safeAvatar: value => value || '' }
};
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: { recordUserStatEvent: async () => {} }
};
require.cache[notificationPath] = {
  id: notificationPath,
  filename: notificationPath,
  loaded: true,
  exports: { setNotification: async () => ({ success: true }) }
};
require.cache[tripMediaPath] = {
  id: tripMediaPath,
  filename: tripMediaPath,
  loaded: true,
  exports: {
    normalizeMediaObject: value => value,
    verifyUploadSession: async () => { throw new Error('不应校验上传会话'); },
    consumeUploadSession: async () => {},
    cleanupCosMedia: async () => {}
  }
};

delete require.cache[tripPath];
const trip = require(tripPath);
delete require.cache[applyPath];
const apply = require(applyPath);
delete require.cache[tripLogPath];
const tripLog = require(tripLogPath);

async function main() {
  const joined = await trip.tripJoin('member-1', { tripId: 'past-trip' });
  assert.deepStrictEqual(joined, { success: false, error: '往期行程不能加入' });

  const applied = await apply.applyCreate('member-1', { tripId: 'past-trip', message: '' });
  assert.deepStrictEqual(applied, { success: false, error: '往期行程不能申请加入' });

  const edited = await trip.tripUpdate('creator-1', { tripId: 'past-trip', tripTitle: '绕过编辑' });
  assert.deepStrictEqual(edited, { success: false, error: '往期行程不能编辑' });

  const statusChanged = await trip.tripUpdateStatus('creator-1', { tripId: 'past-trip', status: 'stopped' });
  assert.deepStrictEqual(statusChanged, { success: false, error: '往期行程不能编辑' });

  const started = await tripLog.tripLogStart('creator-1', { tripId: 'past-trip' });
  assert.deepStrictEqual(started, { success: false, error: '往期行程不能开始' });

  const logged = await tripLog.tripLogCreate('creator-1', {
    tripId: 'past-trip', content: '绕过发布', images: []
  });
  assert.deepStrictEqual(logged, { success: false, error: '往期行程不能发布日志' });

  console.log('PASS past trip join, apply, edit, status and log handlers reject before writes');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
