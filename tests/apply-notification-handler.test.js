#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'apply.js');

const state = {
  applies: [],
  notifications: {},
  users: [{ _id: 'user-applicant', openid: 'openid-applicant', nickname: '申请人', avatar: 'avatar.jpg' }],
  trip: {
    _id: 'trip-1', creatorId: 'openid-creator', creatorName: '发起人',
    tripTitle: '周末徒步', placeName: '京西古道', placeId: 'place-1',
    customCoverImage: 'cover.jpg', status: 'open', tripStage: 'not_started',
    needCount: 3, participants: [{ userId: 'openid-creator' }]
  }
};

function applyDoc(id) {
  return {
    async get() { return { data: state.applies.find(item => item._id === id) || null }; },
    async update({ data }) {
      const item = state.applies.find(row => row._id === id);
      if (item) Object.assign(item, data);
    },
    async remove() {
      state.applies = state.applies.filter(item => item._id !== id);
    }
  };
}

function appliesCollection() {
  let condition = {};
  return {
    async add({ data }) {
      const _id = 'apply-' + (state.applies.length + 1);
      state.applies.push({ _id, ...data });
      return { _id };
    },
    doc: applyDoc,
    where(nextCondition) {
      condition = nextCondition || {};
      return this;
    },
    orderBy() { return this; },
    skip() { return this; },
    limit() { return this; },
    async get() {
      return {
        data: state.applies.filter(item => Object.keys(condition).every(key => {
          const expected = condition[key];
          if (expected && expected.$neq !== undefined) return item[key] !== expected.$neq;
          return item[key] === expected;
        }))
      };
    }
  };
}

const db = {
  collection(name) {
    if (name === 'users') {
      return {
        where(condition) {
          return { async get() { return { data: state.users.filter(item => item.openid === condition.openid) }; } };
        }
      };
    }
    if (name === 'trips') {
      return {
        doc() {
          return {
            async get() { return { data: state.trip }; },
            async update() { return {}; }
          };
        }
      };
    }
    if (name === 'applies') return appliesCollection();
    if (name === 'notifications') {
      return {
        doc(id) {
          return { async set({ data }) { state.notifications[id] = { _id: id, ...data }; } };
        }
      };
    }
    throw new Error('Unexpected collection: ' + name);
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: {
    db,
    _: { neq(value) { return { $neq: value }; }, inc(value) { return value; }, push(value) { return value; } },
    cloud: {},
    crypto: {},
    safeAvatar: value => value || ''
  }
};

delete require.cache[handlerPath];
const apply = require(handlerPath);

async function main() {
  const created = await apply.applyCreate('openid-applicant', {
    tripId: 'trip-1',
    placeName: '京西古道',
    toUserId: 'openid-creator',
    toUserName: '发起人',
    message: '想一起徒步'
  });
  assert.strictEqual(created.success, true);
  assert.strictEqual(state.applies.length, 2);
  assert(Object.values(state.notifications).some(item =>
    item.type === 'trip_apply_received' && item.receiverId === 'openid-creator'));

  const received = state.applies.find(item => item.ownerId === 'openid-creator');
  const rejected = await apply.applyHandle('openid-creator', { applyId: received._id, accept: false });
  assert.strictEqual(rejected.success, true);
  assert(!Object.values(state.notifications).some(item =>
    item.type === 'trip_apply_rejected' && item.receiverId === 'openid-applicant'));

  const createdAgain = await apply.applyCreate('openid-applicant', {
    tripId: 'trip-1', toUserId: 'openid-creator', toUserName: '发起人'
  });
  assert.strictEqual(createdAgain.success, true);
  const receivedPending = state.applies.filter(item =>
    item.ownerId === 'openid-creator' && item.status === 'pending').pop();
  const accepted = await apply.applyHandle('openid-creator', {
    applyId: receivedPending._id,
    accept: true
  });
  assert.strictEqual(accepted.success, true);
  const acceptedNotification = Object.values(state.notifications).find(item =>
    item.type === 'trip_apply_accepted' && item.receiverId === 'openid-applicant');
  assert(acceptedNotification, 'accepted application should notify applicant');
  assert.strictEqual(acceptedNotification.content, '恭喜你已通过申请，期待与你一起出发');

  const createdThird = await apply.applyCreate('openid-applicant', {
    tripId: 'trip-1', toUserId: 'openid-creator', toUserName: '发起人'
  });
  assert.strictEqual(createdThird.success, true);
  const sentPending = state.applies.filter(item =>
    item.ownerId === 'openid-applicant' && item.status === 'pending').pop();
  const cancelled = await apply.applyCancel('openid-applicant', { applyId: sentPending._id });
  assert.strictEqual(cancelled.success, true);
  assert(Object.values(state.notifications).some(item =>
    item.type === 'trip_apply_cancelled' && item.receiverId === 'openid-creator'));

  console.log('PASS trip application handles direct apply, approval notice and silent rejection');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
