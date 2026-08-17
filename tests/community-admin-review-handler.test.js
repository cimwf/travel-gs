#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'adminCommunity.js');

const posts = [
  { _id: 'post-3', authorId: 'user-3', authorAvatar: '', status: 'active', reviewStatus: 'approved', adminReviewStatus: 'not_required', machineSuggest: 'pass', createdAt: 300, images: [] },
  { _id: 'post-2', authorId: 'user-2', status: 'active', reviewStatus: 'approved', adminReviewStatus: 'pending', machineSuggest: 'review', createdAt: 200, images: [] },
  { _id: 'post-1', authorId: 'user-1', status: 'active', reviewStatus: 'approved', adminReviewStatus: 'pending', machineSuggest: 'risky', createdAt: 100, images: [] }
];
const notifications = [];

function matches(row, condition) {
  return Object.keys(condition || {}).every(key => {
    const expected = condition[key];
    if (expected && expected.$op === 'in') return expected.values.includes(row[key]);
    return row[key] === expected;
  });
}

function makeQuery(rows, condition = {}) {
  let skip = 0;
  let limit = 100;
  return {
    orderBy() { return this; },
    skip(value) { skip = value; return this; },
    limit(value) { limit = value; return this; },
    async get() { return { data: rows.filter(row => matches(row, condition)).slice(skip, skip + limit) }; },
    async count() { return { total: rows.filter(row => matches(row, condition)).length }; },
    async remove() {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matches(rows[index], condition)) rows.splice(index, 1);
      }
      return { stats: { removed: 1 } };
    }
  };
}

const db = {
  collection(name) {
    if (name === 'admin_users') {
      return {
        doc(id) {
          return { async get() { return { data: id === 'admin-1' ? { _id: id, role: 'admin', nickname: '审核员' } : null }; } };
        }
      };
    }
    if (name === 'community_posts') {
      return {
        where(condition) { return makeQuery(posts, condition); },
        doc(id) {
          return {
            async get() { return { data: posts.find(post => post._id === id) || null }; },
            async update(payload) {
              Object.assign(posts.find(post => post._id === id), payload.data);
              return { stats: { updated: 1 } };
            }
          };
        }
      };
    }
    if (name === 'users') {
      return {
        where(condition) {
          const users = [{ openid: 'user-3', nickname: '新昵称', avatar: 'cloud://avatar/user-3.jpg' }];
          return makeQuery(users, condition);
        }
      };
    }
    if (name === 'notifications') {
      return {
        where(condition) { return makeQuery(notifications, condition); },
        doc(id) {
          return { async update(payload) { Object.assign(notifications.find(item => item._id === id), payload.data); } };
        },
        async add(payload) {
          notifications.push({ _id: `notification-${notifications.length + 1}`, ...payload.data });
          return { _id: notifications[notifications.length - 1]._id };
        }
      };
    }
    throw new Error(`Unexpected collection: ${name}`);
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: {
    db,
    _: { in(values) { return { $op: 'in', values }; } },
    cloud: {
      async getTempFileURL({ fileList }) {
        return { fileList: fileList.map(fileID => ({ fileID, tempFileURL: 'https://temp.example/avatar.jpg' })) };
      }
    }
  }
};

delete require.cache[handlerPath];
const handler = require(handlerPath);

async function main() {
  const forbidden = await handler.adminCommunityReviewList({ adminId: 'missing' });
  assert.strictEqual(forbidden.success, false);

  const pending = await handler.adminCommunityReviewList({
    adminId: 'admin-1',
    reviewStatus: 'pending',
    machineSuggest: 'all',
    page: 1,
    pageSize: 1
  });
  assert.strictEqual(pending.success, true);
  assert.strictEqual(pending.total, 2);
  assert.deepStrictEqual(pending.posts.map(post => post._id), ['post-2']);

  const approved = await handler.adminCommunityReviewList({
    adminId: 'admin-1',
    reviewStatus: 'approved',
    machineSuggest: 'all'
  });
  assert.deepStrictEqual(approved.posts.map(post => post._id), ['post-3']);
  assert.strictEqual(approved.posts[0].authorName, '新昵称');
  assert.strictEqual(approved.posts[0].authorAvatar, 'https://temp.example/avatar.jpg');

  const reviewed = await handler.adminCommunityReviewUpdate({
    adminId: 'admin-1',
    postId: 'post-1',
    decision: 'approved',
    remark: '人工确认通过'
  });
  assert.strictEqual(reviewed.success, true);
  assert.strictEqual(posts.find(post => post._id === 'post-1').reviewStatus, 'approved');
  assert.strictEqual(posts.find(post => post._id === 'post-1').adminReviewStatus, 'approved');
  assert.strictEqual(notifications.length, 1);
  assert.strictEqual(notifications[0].receiverId, 'user-1');

  console.log('PASS admin community review runs through cloud-function handlers');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
