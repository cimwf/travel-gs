#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'community.js');

function likeId(postId, openid) {
  return crypto.createHash('sha256')
    .update(`${postId}\n${openid}`)
    .digest('hex')
    .slice(0, 32);
}

const posts = {
  approved: {
    _id: 'approved',
    authorId: 'author-1',
    authorName: '作者',
    authorAvatar: 'https://example.com/avatar.jpg',
    content: '公开作品',
    images: [],
    likeCount: 2,
    commentCount: 3,
    reviewStatus: 'approved',
    status: 'active',
    createdAt: 1,
  },
  hidden: {
    _id: 'hidden',
    authorId: 'author-1',
    authorName: '作者',
    authorAvatar: '',
    content: '待审核作品',
    images: [],
    reviewStatus: 'manual_review',
    status: 'active',
    createdAt: 2,
  },
  deleted: {
    _id: 'deleted',
    authorId: 'author-1',
    reviewStatus: 'approved',
    status: 'deleted',
    createdAt: 3,
  },
};

const likes = {
  [likeId('approved', 'viewer-1')]: { _id: 'like-1' },
};

const db = {
  collection(name) {
    if (name === 'community_posts') {
      return {
        doc(id) {
          return {
            async get() {
              if (!posts[id]) {
                const error = new Error('document not found');
                error.code = 'DATABASE_DOCUMENT_NOT_EXIST';
                throw error;
              }
              return { data: { ...posts[id] } };
            },
          };
        },
      };
    }
    if (name === 'community_likes') {
      return {
        doc(id) {
          return {
            async get() {
              if (!likes[id]) {
                const error = new Error('document not found');
                error.code = 'DATABASE_DOCUMENT_NOT_EXIST';
                throw error;
              }
              return { data: likes[id] };
            },
          };
        },
      };
    }
    if (name === 'users') {
      return {
        where() {
          return {
            async get() {
              return {
                data: [{
                  openid: 'author-1',
                  nickname: '当前昵称',
                  avatar: 'https://example.com/current-avatar.jpg',
                  region: '海淀区',
                }],
              };
            },
          };
        },
      };
    }
    throw new Error(`Unexpected collection: ${name}`);
  },
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: {
    db,
    _: { in: (values) => ({ $in: values }) },
    cloud: {},
  },
};

delete require.cache[handlerPath];
const community = require(handlerPath);

async function main() {
  let result = await community.communityGet('viewer-1', { postId: 'approved' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.post.isAuthor, false);
  assert.strictEqual(result.post.isLiked, true);
  assert.strictEqual(result.post.authorRegion, '海淀区');
  assert.strictEqual(result.post.authorName, '当前昵称');
  assert.strictEqual(result.post.authorAvatar, 'https://example.com/current-avatar.jpg');

  result = await community.communityGet('viewer-1', { postId: 'hidden' });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'POST_UNAVAILABLE');

  result = await community.communityGet('author-1', { postId: 'hidden' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.post.isAuthor, true);

  result = await community.communityGet('viewer-1', { postId: 'deleted' });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'POST_UNAVAILABLE');

  result = await community.communityGet('viewer-1', { postId: 'missing' });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.errorCode, 'POST_UNAVAILABLE');

  console.log('PASS community detail loads by ID with visibility and deletion rules');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
