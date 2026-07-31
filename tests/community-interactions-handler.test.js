#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'community.js');
const stsPath = require.resolve('qcloud-cos-sts', {
  paths: [path.join(apiRoot, 'node_modules')]
});

const now = Date.now();
const posts = {
  'post-liked': {
    _id: 'post-liked',
    authorId: 'author-a',
    authorName: '小鹿在路上',
    authorAvatar: 'https://example.com/a.jpg',
    content: '周末去了京西古道。',
    images: [{ key: 'a', url: 'https://example.com/trail.jpg' }],
    likeCount: 8,
    commentCount: 2,
    status: 'active',
    reviewStatus: 'approved',
    createdAt: now - 10000
  },
  'post-commented': {
    _id: 'post-commented',
    authorId: 'author-b',
    authorName: '山野奇遇记',
    authorAvatar: 'https://example.com/b.jpg',
    content: '延庆湖边露营。',
    images: [],
    likeCount: 3,
    commentCount: 4,
    status: 'active',
    reviewStatus: 'approved',
    createdAt: now - 20000
  }
};

function makeQuery(rows) {
  return {
    orderBy() { return this; },
    limit() { return this; },
    async get() { return { data: rows }; }
  };
}

const db = {
  collection(name) {
    if (name === 'community_likes') {
      return {
        where(query) {
          if (query && query.postId) {
            return makeQuery([{ _id: 'like-1', postId: 'post-liked', userId: 'openid-me' }]);
          }
          return makeQuery([{
            _id: 'like-1',
            postId: 'post-liked',
            userId: 'openid-me',
            createdAt: now
          }]);
        }
      };
    }
    if (name === 'community_comments') {
      return {
        where() {
          return makeQuery([{
            _id: 'comment-1',
            postId: 'post-commented',
            authorId: 'openid-me',
            content: '路线看起来很舒服。',
            status: 'active',
            createdAt: now - 1000
          }]);
        }
      };
    }
    if (name === 'community_comment_replies') {
      return {
        where() {
          return makeQuery([{
            _id: 'reply-1',
            postId: 'post-liked',
            authorId: 'openid-me',
            content: '周六有时间，可以一起。',
            status: 'active',
            createdAt: now - 2000
          }]);
        }
      };
    }
    if (name === 'community_posts') {
      return {
        doc(id) {
          return {
            async get() {
              return { data: posts[id] || null };
            }
          };
        }
      };
    }
    throw new Error(`Unexpected collection: ${name}`);
  }
};

const command = {
  lt(value) { return { lt: value }; },
  eq(value) { return { eq: value }; },
  or(value) { return { or: value }; },
  and(value) { return { and: value }; },
  in(value) { return { in: value }; }
};

const cloud = {
  async getTempFileURL() {
    return { fileList: [] };
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db, _: command, cloud }
};

require.cache[stsPath] = {
  id: stsPath,
  filename: stsPath,
  loaded: true,
  exports: {}
};

delete require.cache[handlerPath];
const community = require(handlerPath);

async function main() {
  const liked = await community.communityInteractions('openid-me', {
    type: 'liked',
    pageSize: 10
  });
  assert.strictEqual(liked.success, true);
  assert.strictEqual(liked.interactions.length, 1);
  assert.strictEqual(liked.interactions[0].post._id, 'post-liked');
  assert.strictEqual(liked.interactions[0].post.isLiked, true);

  const commented = await community.communityInteractions('openid-me', {
    type: 'commented',
    pageSize: 10
  });
  assert.strictEqual(commented.success, true);
  assert.deepStrictEqual(
    commented.interactions.map((item) => item.sourceType),
    ['comment', 'reply']
  );
  assert.deepStrictEqual(
    commented.interactions.map((item) => item.interactionContent),
    ['路线看起来很舒服。', '周六有时间，可以一起。']
  );

  const invalid = await community.communityInteractions('openid-me', { type: 'unknown' });
  assert.strictEqual(invalid.success, false);
  console.log('PASS community interactions merge liked, comments and replies');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
