#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'user.js');

const state = {
  users: {
    'user-viewer': {
      _id: 'user-viewer', openid: 'openid-viewer', userId: 'viewer',
      nickname: '关注者', avatar: 'https://example.com/viewer.jpg', following: 0, followers: 0
    },
    'user-target': {
      _id: 'user-target', openid: 'openid-target', userId: 'target',
      nickname: '被关注者', avatar: 'https://example.com/target.jpg', following: 0, followers: 0
    }
  },
  follows: {},
  notifications: {}
};

function userDoc(id) {
  return {
    async get() { return { data: state.users[id] || null }; },
    async update({ data }) { Object.assign(state.users[id], data); }
  };
}

function followDoc(id) {
  return {
    async get() { return { data: state.follows[id] || null }; },
    async set({ data }) { state.follows[id] = { _id: id, ...data }; },
    async remove() { delete state.follows[id]; }
  };
}

function notificationDoc(id) {
  return {
    async set({ data }) { state.notifications[id] = { _id: id, ...data }; },
    async remove() { delete state.notifications[id]; }
  };
}

function usersCollection() {
  return {
    doc: userDoc,
    where(condition) {
      let limit = 100;
      return {
        limit(value) { limit = value; return this; },
        async get() {
          return {
            data: Object.values(state.users)
              .filter(user => Object.keys(condition).every(key => user[key] === condition[key]))
              .slice(0, limit)
          };
        }
      };
    }
  };
}

const db = {
  collection(name) {
    if (name === 'users') return usersCollection();
    if (name === 'user_follows') return { doc: followDoc };
    if (name === 'community_likes') {
      return { where() { return { async count() { return { total: 0 }; } }; } };
    }
    throw new Error('Unexpected collection: ' + name);
  },
  async runTransaction(callback) {
    return callback({
      collection(name) {
        if (name === 'users') return { doc: userDoc };
        if (name === 'user_follows') return { doc: followDoc };
        if (name === 'notifications') return { doc: notificationDoc };
        throw new Error('Unexpected transaction collection: ' + name);
      }
    });
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: {
    db,
    _: {},
    cloud: {},
    crypto: {},
    normalizeAvatarForDb: value => value || '',
    isLocalTempFilePath: () => false
  }
};

delete require.cache[handlerPath];
const user = require(handlerPath);

async function main() {
  const followed = await user.userFollowToggle('openid-viewer', { userId: 'openid-target' });
  assert.strictEqual(followed.success, true);
  assert.strictEqual(followed.isFollowing, true);
  assert.strictEqual(followed.followingCount, 1);
  assert.strictEqual(followed.followerCount, 1);
  assert.strictEqual(Object.keys(state.notifications).length, 1);
  const notification = Object.values(state.notifications)[0];
  assert.strictEqual(notification.type, 'user_follow');
  assert.strictEqual(notification.receiverId, 'openid-target');
  assert.strictEqual(notification.actorId, 'openid-viewer');
  assert.strictEqual(notification.targetType, 'user');
  assert.strictEqual(notification.targetId, 'openid-viewer');

  const unfollowed = await user.userFollowToggle('openid-viewer', { userId: 'openid-target' });
  assert.strictEqual(unfollowed.success, true);
  assert.strictEqual(unfollowed.isFollowing, false);
  assert.strictEqual(Object.keys(state.notifications).length, 0);

  const selfFollow = await user.userFollowToggle('openid-viewer', { userId: 'openid-viewer' });
  assert.strictEqual(selfFollow.success, false);
  assert(selfFollow.error.includes('不能关注自己'));
  assert.strictEqual(Object.keys(state.notifications).length, 0);

  console.log('PASS follow notifications are created once and removed on unfollow');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
