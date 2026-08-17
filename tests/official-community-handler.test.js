#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'adminOfficialCommunity.js');

const data = {
  admin_users: [{ _id: 'admin-1', role: 'admin', nickname: '运营员' }],
  users: [],
  community_posts: [],
  official_upload_sessions: []
};

function matches(row, condition) {
  return Object.keys(condition || {}).every((key) => row[key] === condition[key]);
}

function collection(name) {
  const rows = data[name];
  if (!rows) throw new Error(`Unexpected collection ${name}`);
  return {
    doc(id) {
      return {
        async get() {
          const row = rows.find((item) => item._id === id);
          if (!row) throw new Error('not found');
          return { data: row };
        },
        async update(payload) {
          const row = rows.find((item) => item._id === id);
          if (!row) throw new Error('not found');
          Object.assign(row, payload.data);
          return { stats: { updated: 1 } };
        }
      };
    },
    where(condition) {
      let skip = 0;
      let limit = 100;
      return {
        orderBy() { return this; },
        skip(value) { skip = value; return this; },
        limit(value) { limit = value; return this; },
        async get() { return { data: rows.filter((row) => matches(row, condition)).slice(skip, skip + limit) }; },
        async count() { return { total: rows.filter((row) => matches(row, condition)).length }; }
      };
    },
    async add(payload) {
      rows.push({ ...payload.data });
      return { _id: payload.data._id };
    }
  };
}

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db: { collection } }
};

delete require.cache[handlerPath];
const handler = require(handlerPath);

async function main() {
  const unauthorized = await handler.adminOfficialAccountList({ adminId: 'missing' });
  assert.strictEqual(unauthorized.success, false);

  const created = await handler.adminOfficialAccountSave({
    adminId: 'admin-1', nickname: '北京周末情报', bio: '发现北京周末的新鲜玩法', region: '朝阳区'
  });
  assert.strictEqual(created.success, true);
  const account = data.users[0];
  assert.strictEqual(account.openid, created.accountId);
  assert.strictEqual(account.accountType, 'official');
  assert.strictEqual(account.isOfficial, true);

  const published = await handler.adminOfficialPostCreate({
    adminId: 'admin-1', accountId: created.accountId, content: '本周末公园市集开放。', dataEnv: 'prod'
  });
  assert.strictEqual(published.success, true);
  assert.strictEqual(data.community_posts[0].authorId, account.openid);
  assert.strictEqual(data.community_posts[0].reviewStatus, 'approved');
  assert.strictEqual(data.community_posts[0].dataEnv, 'dev');

  const listed = await handler.adminOfficialPostList({ adminId: 'admin-1', page: 1, pageSize: 10 });
  assert.strictEqual(listed.success, true);
  assert.strictEqual(listed.total, 1);

  const edited = await handler.adminOfficialPostUpdate({
    adminId: 'admin-1',
    postId: published.postId,
    mode: 'edit',
    accountId: created.accountId,
    content: '这条内容仍然保留在测试环境。',
    dataEnv: 'prod',
    existingImages: []
  });
  assert.strictEqual(edited.success, true);
  assert.strictEqual(data.community_posts[0].content, '这条内容仍然保留在测试环境。');
  assert.strictEqual(data.community_posts[0].dataEnv, 'dev');

  data.community_posts[0].createdAt = 1000;
  const promoted = await handler.adminOfficialPostUpdate({
    adminId: 'admin-1', postId: published.postId, mode: 'publish'
  });
  assert.strictEqual(promoted.success, true);
  assert.strictEqual(data.community_posts[0].dataEnv, 'prod');
  assert.strictEqual(data.community_posts[0].createdAt > 1000, true);
  assert.strictEqual(data.community_posts[0].publishedAt, data.community_posts[0].createdAt);

  const removed = await handler.adminOfficialPostUpdate({ adminId: 'admin-1', postId: published.postId, status: 'deleted' });
  assert.strictEqual(removed.success, true);
  assert.strictEqual(data.community_posts[0].status, 'deleted');
  console.log('PASS official accounts and text posts run through admin cloud-function handlers');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
