#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'community.js');

const state = {
  suggest: 'pass',
  post: {
    _id: 'post-comment-test',
    authorId: 'openid-author',
    status: 'active',
    reviewStatus: 'approved',
    commentCount: 0
  },
  comments: []
};

function postDocument(id) {
  return {
    async get() {
      return { data: state.post && state.post._id === id ? { ...state.post } : null };
    },
    async update({ data }) {
      Object.assign(state.post, data);
    }
  };
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
                  nickname: '评论用户',
                  avatar: 'https://example.com/commenter.jpg'
                }]
              };
            }
          };
        }
      };
    }
    if (name === 'community_posts') {
      return {
        doc(id) {
          return postDocument(id);
        }
      };
    }
    if (name === 'community_comments') {
      let limitCount = 20;
      const query = {
        where() {
          return query;
        },
        orderBy() {
          return query;
        },
        limit(count) {
          limitCount = count;
          return query;
        },
        async get() {
          return {
            data: state.comments
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, limitCount)
          };
        }
      };
      return query;
    }
    throw new Error(`Unexpected collection: ${name}`);
  },
  async runTransaction(callback) {
    return callback({
      collection(name) {
        if (name === 'community_posts') {
          return {
            doc(id) {
              return postDocument(id);
            }
          };
        }
        if (name === 'community_comments') {
          return {
            async add({ data }) {
              const _id = `comment-${state.comments.length + 1}`;
              state.comments.push({ _id, ...data });
              return { _id };
            },
            doc(id) {
              return {
                async get() {
                  return {
                    data: state.comments.find((comment) => comment._id === id) || null
                  };
                },
                async update({ data }) {
                  const comment = state.comments.find((item) => item._id === id);
                  if (comment) Object.assign(comment, data);
                }
              };
            }
          };
        }
        throw new Error(`Unexpected transaction collection: ${name}`);
      }
    });
  }
};

const cloud = {
  openapi: {
    security: {
      async msgSecCheck() {
        return { result: { suggest: state.suggest, label: 100 } };
      }
    }
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db, _: {}, cloud }
};

delete require.cache[handlerPath];
const community = require(handlerPath);

async function main() {
  const created = await community.communityCommentCreate('openid-commenter', {
    postId: state.post._id,
    content: '  来聊聊这个话题吧  '
  });
  assert.strictEqual(created.success, true);
  assert.strictEqual(created.comment.content, '来聊聊这个话题吧');
  assert.strictEqual(created.comment.authorId, 'openid-commenter');
  assert.strictEqual(created.comment.authorName, '评论用户');
  assert.strictEqual(created.comment.authorAvatar, 'https://example.com/commenter.jpg');
  assert.strictEqual(created.commentCount, 1);
  assert.strictEqual(state.post.commentCount, 1);
  assert.strictEqual(state.comments.length, 1);

  const listed = await community.communityCommentList('', {
    postId: state.post._id,
    pageSize: 20
  });
  assert.strictEqual(listed.success, true);
  assert.strictEqual(listed.comments.length, 1);
  assert.strictEqual(listed.comments[0].content, '来聊聊这个话题吧');
  assert.strictEqual(listed.commentCount, 1);
  assert.strictEqual(listed.hasMore, false);

  const deletedByCommenter = await community.communityCommentDelete('openid-commenter', {
    postId: state.post._id,
    commentId: created.comment._id
  });
  assert.strictEqual(deletedByCommenter.success, true);
  assert.strictEqual(deletedByCommenter.commentCount, 0);
  assert.strictEqual(state.post.commentCount, 0);
  assert.strictEqual(state.comments[0].status, 'deleted');

  const second = await community.communityCommentCreate('openid-commenter', {
    postId: state.post._id,
    content: '作品作者也可以删除'
  });
  const deletedByPostAuthor = await community.communityCommentDelete('openid-author', {
    postId: state.post._id,
    commentId: second.comment._id
  });
  assert.strictEqual(deletedByPostAuthor.success, true);
  assert.strictEqual(state.post.commentCount, 0);
  assert.strictEqual(state.comments[1].status, 'deleted');

  const third = await community.communityCommentCreate('openid-commenter', {
    postId: state.post._id,
    content: '其他用户不能删除'
  });
  const unauthorized = await community.communityCommentDelete('openid-other', {
    postId: state.post._id,
    commentId: third.comment._id
  });
  assert.strictEqual(unauthorized.success, false);
  assert(unauthorized.error.includes('无权删除'));
  assert.strictEqual(state.post.commentCount, 1);
  assert.strictEqual(state.comments[2].status, 'active');

  state.suggest = 'risky';
  const blocked = await community.communityCommentCreate('openid-commenter', {
    postId: state.post._id,
    content: '违规内容'
  });
  assert.strictEqual(blocked.success, false);
  assert(blocked.error.includes('未通过安全检测'));
  assert.strictEqual(state.post.commentCount, 1);
  assert.strictEqual(state.comments.length, 3);

  const empty = await community.communityCommentCreate('openid-commenter', {
    postId: state.post._id,
    content: '   '
  });
  assert.strictEqual(empty.success, false);
  assert(empty.error.includes('不能为空'));

  state.suggest = 'pass';
  state.post.reviewStatus = 'reviewing';
  const unavailable = await community.communityCommentCreate('openid-commenter', {
    postId: state.post._id,
    content: '等待审核'
  });
  assert.strictEqual(unavailable.success, false);
  assert(unavailable.error.includes('暂不可评论'));

  console.log('PASS community comments are secured and counted atomically');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
