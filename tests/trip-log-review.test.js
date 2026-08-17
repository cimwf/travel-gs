#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const handler = read('cloudfunctions/api/handlers/tripLog.js');
const callback = read('cloudfunctions/community-media-check-result/index.js');
const api = read('cloudfunctions/api/index.js');
const detailJs = read('miniprogram/pages/trip-detail/trip-detail.js');
const detailWxml = read('miniprogram/pages/trip-detail/trip-detail.wxml');
const adminHandler = read('cloudfunctions/api/handlers/adminTripLog.js');
const adminPage = read('../travel-be-gs/src/pages/tripLogReviews/index.tsx');
const adminRouter = read('../travel-be-gs/src/router/index.tsx');

assert(handler.includes('security.msgSecCheck'), '旅行记录文字必须经过 msgSecCheck');
assert(handler.includes('security.mediaCheckAsync'), '旅行记录图片必须提交异步审核');
assert(handler.includes("reviewStatus: 'approved'"), '旅行记录发布后应立即公开展示');
assert(handler.includes("adminReviewStatus: textMachineSuggest === 'pass' ? 'not_required' : 'pending'"), '文字 review/risky 应进入人工审核');
assert(handler.includes("log.reviewStatus === 'approved'"), '公开列表必须只展示已通过记录');
assert(handler.includes("log.publisherId === openid"), '发布者应能看到自己的审核中记录');
assert(callback.includes("collection: 'trip_log_image_audits'"), '图片回调必须识别旅行记录审核映射');
assert(callback.includes('reconcileTripLogWithRetry'), '旅行记录多图回调必须安全汇总');
assert(api.includes("case 'admin/tripLogReviewList':"), '云函数必须暴露旅行记录审核列表');
assert(api.includes("case 'admin/tripLogReviewUpdate':"), '云函数必须暴露旅行记录审核操作');
assert(adminHandler.includes("adminReviewStatus: decision"), '后台审核结论必须落库');
assert(adminPage.includes('旅行记录审核'), '后台必须有旅行记录审核页面');
assert(adminRouter.includes("path: 'trip-log-reviews'"), '后台必须注册旅行记录审核路由');
assert(detailJs.includes("'已发布 · 待复核'"), '机器标记的记录应提示已发布待复核');
assert(detailWxml.includes('log.reviewStatusText'), '发布者应看到自己的审核状态');

console.log('PASS trip logs use community-style automatic and admin review flow');
