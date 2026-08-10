#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const pagePath = path.resolve(__dirname, '../miniprogram/pages/community-detail/community-detail.js');
let definition;

global.getApp = () => ({ globalData: {} });
global.Page = (value) => { definition = value; };
global.wx = {
  getStorageSync: () => '',
  nextTick: (callback) => callback(),
};

delete require.cache[pagePath];
require(pagePath);

function createPage() {
  const page = Object.assign({}, definition);
  page.data = JSON.parse(JSON.stringify(definition.data));
  page.setData = function (patch, callback) {
    Object.keys(patch).forEach((key) => {
      this.data[key] = patch[key];
    });
    if (callback) callback.call(this);
  };
  return page;
}

const page = createPage();
page.data.post = {
  _id: 'post-1',
  authorName: '缓存作者',
  authorAvatar: 'https://example.com/cached-avatar.jpg',
  content: '缓存内容',
  images: [],
  likeCount: 1,
  commentCount: 1,
  isLiked: false,
};
page.data.likers = [{ userId: 'liker-1', userAvatar: 'https://example.com/liker.jpg' }];
page.data.comments = [{ _id: 'comment-1', content: '已经加载的评论' }];
page._postDataPriority = 1;
page._likersPostId = 'post-1';
page._commentsPostId = 'post-1';

page.applyPost({
  _id: 'post-1',
  authorName: '服务器作者',
  authorAvatar: '',
  content: '服务器内容',
  images: [],
  likeCount: 2,
  commentCount: 1,
  isLiked: true,
}, { source: 'server' });

assert.strictEqual(page.data.comments.length, 1, 'server refresh must not clear loaded comments');
assert.strictEqual(page.data.comments[0]._id, 'comment-1');
assert.strictEqual(page.data.likers.length, 1, 'server refresh must not clear loaded likers');
assert.strictEqual(page.data.post.authorAvatar, 'https://example.com/cached-avatar.jpg', 'empty server avatar must not erase cached avatar');
assert.strictEqual(page.data.post.content, '服务器内容');

page.applyPost({
  _id: 'post-1',
  content: '迟到的上一页内容',
  images: [],
}, { source: 'opener' });

assert.strictEqual(page.data.post.content, '服务器内容', 'late opener data must not overwrite server data');
assert.strictEqual(page.data.comments.length, 1);
assert.strictEqual(page.data.likers.length, 1);

console.log('PASS community detail preserves independently loaded state across data races');
