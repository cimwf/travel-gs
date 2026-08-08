#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'community.js');

const users = [
  { _id: 'user-1', openid: 'author-1', region: '朝阳区' },
  { _id: 'user-2', openid: 'author-2', region: '海淀区' },
  { _id: 'user-3', openid: 'author-3', region: '朝阳区' }
];
const follows = [
  { _id: 'follow-1', followerId: 'viewer', followingId: 'author-1' },
  { _id: 'follow-2', followerId: 'viewer', followingId: 'author-2' }
];
const posts = [
  { _id: 'post-1', authorId: 'author-1', status: 'active', reviewStatus: 'approved', createdAt: 300 },
  { _id: 'post-2', authorId: 'author-2', status: 'active', reviewStatus: 'approved', createdAt: 200 },
  { _id: 'post-3', authorId: 'author-3', status: 'active', reviewStatus: 'approved', createdAt: 100 }
];

function matches(value, expected) {
  if (expected && expected.$in) return expected.$in.includes(value);
  return value === expected;
}

function filterRows(rows, condition) {
  return rows.filter(row => Object.keys(condition || {}).every(key => matches(row[key], condition[key])));
}

function queryFor(rows, condition) {
  let limit = 100;
  return {
    where(nextCondition) {
      condition = nextCondition;
      return this;
    },
    orderBy() {
      return this;
    },
    limit(value) {
      limit = value;
      return this;
    },
    async get() {
      return {
        data: filterRows(rows, condition)
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt || String(b._id).localeCompare(String(a._id)))
          .slice(0, limit)
      };
    }
  };
}

const db = {
  collection(name) {
    if (name === 'community_posts') return queryFor(posts, {});
    if (name === 'user_follows') return queryFor(follows, {});
    if (name === 'users') return queryFor(users, {});
    if (name === 'community_likes') return queryFor([], {});
    throw new Error(`Unexpected collection: ${name}`);
  }
};

const command = {
  in(values) {
    return { $in: values };
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db, _: command, cloud: {} }
};

delete require.cache[handlerPath];
const community = require(handlerPath);

async function main() {
  const all = await community.communityList('viewer', { pageSize: 10 });
  assert.strictEqual(all.success, true);
  assert.deepStrictEqual(all.posts.map(post => post._id), ['post-1', 'post-2', 'post-3']);
  assert.strictEqual(all.posts[0].authorRegion, '朝阳区');

  const following = await community.communityList('viewer', {
    pageSize: 10,
    feedType: 'following'
  });
  assert.strictEqual(following.success, true);
  assert.deepStrictEqual(following.posts.map(post => post._id), ['post-1', 'post-2']);

  const region = await community.communityList('viewer', {
    pageSize: 10,
    region: '朝阳区'
  });
  assert.strictEqual(region.success, true);
  assert.deepStrictEqual(region.posts.map(post => post._id), ['post-1', 'post-3']);

  const combined = await community.communityList('viewer', {
    pageSize: 10,
    feedType: 'following',
    region: '朝阳区'
  });
  assert.strictEqual(combined.success, true);
  assert.deepStrictEqual(combined.posts.map(post => post._id), ['post-1']);

  const anonymousFollowing = await community.communityList('', {
    feedType: 'following'
  });
  assert.strictEqual(anonymousFollowing.success, false);
  assert(anonymousFollowing.error.includes('登录'));

  const invalidRegion = await community.communityList('viewer', {
    region: '上海市'
  });
  assert.strictEqual(invalidRegion.success, false);

  console.log('PASS community feed filters by follows and current profile region');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
