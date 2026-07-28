#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'community.js');

const state = {
  post: {
    _id: 'post-like-test',
    authorId: 'openid-author',
    status: 'active',
    reviewStatus: 'approved',
    likeCount: 0
  },
  likes: {}
};

function documentFor(collectionName, id) {
  if (collectionName === 'community_posts') {
    return {
      async get() {
        return { data: state.post && state.post._id === id ? { ...state.post } : null };
      },
      async update({ data }) {
        Object.assign(state.post, data);
      }
    };
  }
  if (collectionName === 'community_likes') {
    return {
      async get() {
        return { data: state.likes[id] ? { ...state.likes[id] } : null };
      },
      async set({ data }) {
        state.likes[id] = { _id: id, ...data };
      },
      async remove() {
        delete state.likes[id];
      }
    };
  }
  throw new Error(`Unexpected transaction collection: ${collectionName}`);
}

const db = {
  collection(name) {
    if (name === 'users') {
      return {
        where(query) {
          return {
            async get() {
              return {
                data: [{
                  openid: query.openid,
                  nickname: '点赞用户',
                  avatar: 'https://example.com/liker.jpg'
                }]
              };
            }
          };
        }
      };
    }
    throw new Error(`Unexpected collection: ${name}`);
  },
  async runTransaction(callback) {
    return callback({
      collection(name) {
        return {
          doc(id) {
            return documentFor(name, id);
          }
        };
      }
    });
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db, _: {}, cloud: {} }
};

delete require.cache[handlerPath];
const community = require(handlerPath);

async function main() {
  const liked = await community.communityToggleLike('openid-liker', {
    postId: state.post._id
  });
  assert.deepStrictEqual(liked, {
    success: true,
    liked: true,
    likeCount: 1
  });
  assert.strictEqual(state.post.likeCount, 1);
  assert.strictEqual(Object.keys(state.likes).length, 1);
  const like = Object.values(state.likes)[0];
  assert.strictEqual(like.postId, state.post._id);
  assert.strictEqual(like.postAuthorId, state.post.authorId);
  assert.strictEqual(like.userId, 'openid-liker');
  assert.strictEqual(like.userName, '点赞用户');
  assert.strictEqual(like.userAvatar, 'https://example.com/liker.jpg');
  assert(Number.isFinite(like.createdAt));

  const unliked = await community.communityToggleLike('openid-liker', {
    postId: state.post._id
  });
  assert.deepStrictEqual(unliked, {
    success: true,
    liked: false,
    likeCount: 0
  });
  assert.strictEqual(state.post.likeCount, 0);
  assert.strictEqual(Object.keys(state.likes).length, 0);

  state.post.reviewStatus = 'reviewing';
  const blocked = await community.communityToggleLike('openid-liker', {
    postId: state.post._id
  });
  assert.strictEqual(blocked.success, false);
  assert(blocked.error.includes('暂不可点赞'));
  assert.strictEqual(state.post.likeCount, 0);

  console.log('PASS community likes store profile snapshots and toggle atomically');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
