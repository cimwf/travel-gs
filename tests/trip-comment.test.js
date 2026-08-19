#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const handler = read('cloudfunctions/api/handlers/tripComment.js');
const routes = read('cloudfunctions/api/index.js');
const api = read('miniprogram/utils/api.js');
const page = read('miniprogram/pages/trip-detail/trip-detail.js');
const wxml = read('miniprogram/pages/trip-detail/trip-detail.wxml');
const schema = read('database/schema.js');

[
  "data-tab=\"trip\"",
  "data-tab=\"log\"",
  "data-tab=\"comment\"",
  "activeTab === 'comment'",
  'bindconfirm="onCommentConfirm"',
  'bindtap="onChooseCommentImages"',
  'detail-v2-comment-draft-images',
  'detail-v2-comment-images',
  'bindlongpress="onCommentLongPress"',
  '出发后才能发布日志'
].forEach((value) => assert.ok(wxml.includes(value) || page.includes(value), `missing ${value}`));

assert.ok(page.includes("showTabs: true"), 'three tabs must always be visible');
assert.ok(page.includes('api.tripCommentList'), 'detail should load trip comments');
assert.ok(page.includes('api.tripCommentCreate'), 'detail should create trip comments');
assert.ok(page.includes('api.tripCommentDelete'), 'detail should delete trip comments');
assert.ok(page.includes('api.tripReplyList'), 'detail should page replies');
assert.ok(page.includes("purpose: 'comment'"), 'trip comments should upload images through a verified COS session');
assert.ok(page.includes('commentImages: []'), 'trip comment image draft state missing');
assert.ok(page.includes('const hasImages = this.data.commentImages.length > 0'), 'image-only comments should be supported');

[
  "case 'tripComment/list'",
  "case 'tripComment/replyList'",
  "case 'tripComment/create'",
  "case 'tripComment/delete'"
].forEach((value) => assert.ok(routes.includes(value), `missing route ${value}`));

[
  'function tripCommentList',
  'function tripReplyList',
  'function tripCommentCreate',
  'function tripCommentDelete'
].forEach((value) => assert.ok(api.includes(value), `missing client API ${value}`));

assert.ok(handler.includes("collection('trip_comments')"), 'trip comment collection missing');
assert.ok(handler.includes("collection('trip_comment_replies')"), 'trip reply collection missing');
assert.ok(handler.includes('msgSecCheck'), 'text security check missing');
assert.ok(handler.includes("suggest === 'pass'"), 'only pass should be accepted');
assert.ok(handler.includes('MAX_COMMENT_IMAGES = 3'), 'trip comments should allow at most three images');
assert.ok(handler.includes('verifyUploadSession'), 'trip comment COS objects must be verified server-side');
assert.ok(handler.includes('mediaCheckAsync'), 'trip comment images should enter async security review');
assert.ok(handler.includes("collection('trip_comment_image_audits')"), 'trip comment image audit mapping missing');
assert.ok(handler.includes("type: isReply ? 'trip_reply' : 'trip_comment'"), 'notifications missing');
assert.ok(handler.includes("trip.creatorId !== openid"), 'trip creator delete permission missing');

assert.ok(schema.includes('trip_comments:'), 'trip comment index documentation missing');
assert.ok(schema.includes('trip_comment_replies:'), 'trip reply index documentation missing');
assert.ok(schema.includes('trip_comment_image_audits:'), 'trip comment image audit documentation missing');

console.log('PASS trip detail always shows three tabs and supports secure threaded comments');
