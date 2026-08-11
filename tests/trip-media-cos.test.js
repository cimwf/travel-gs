#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('cloudfunctions/api/index.js');
const tripMedia = read('cloudfunctions/api/handlers/tripMedia.js');
const trip = read('cloudfunctions/api/handlers/trip.js');
const tripLog = read('cloudfunctions/api/handlers/tripLog.js');
const detail = read('miniprogram/pages/trip-detail/trip-detail.js');
const detailWxml = read('miniprogram/pages/trip-detail/trip-detail.wxml');
const api = read('miniprogram/utils/api.js');
const uploadUtil = read('miniprogram/utils/trip-media-upload.js');
const schema = read('database/schema.js');

assert(index.includes("require('./handlers/tripMedia')"));
assert(index.includes("case 'tripMedia/createUploadSession'"));
assert(api.includes('tripMediaCreateUploadSession'));

['trip-logs', 'trip-covers', 'trip-avatars'].forEach(directory => {
  assert(tripMedia.includes(directory), `missing COS directory ${directory}`);
});
assert(tripMedia.includes("process.env.TRIP_COS_PREFIX || 'miniapp/'"));
assert(tripMedia.includes("collection('trip_media_upload_sessions')"));
assert(tripMedia.includes('headObject'));
assert(tripMedia.includes('deleteObject'));
assert(tripMedia.includes("collection('trip_media_cleanup_tasks')"));

assert(uploadUtil.includes('cosUpload.uploadImage'));
assert(uploadUtil.includes('maxConcurrency = Math.min(3'));
assert(detail.includes("purpose: 'log'"));
assert(detail.includes("purpose: 'cover'"));
assert(detail.includes("purpose: 'avatar'"));
assert(!detail.includes('wx.cloud.uploadFile'));

assert(tripLog.includes('verifyUploadSession'));
assert(tripLog.includes('uploadSessionId'));
assert(tripLog.includes('cleanupCosMedia(log.images'));
assert(tripLog.includes("String(img.fileID).startsWith('cloud://')"));
assert(tripLog.includes('img.url || fileUrlMap[img.fileID]'));
assert(detailWxml.includes('item.url || item.tempFileURL || item.fileID'));

assert(trip.includes('customCoverImageObject'));
assert(trip.includes('coverImageObjects'));
assert(trip.includes('avatarUploadSessionId'));
assert(trip.includes('coverUploadSessionId'));
assert(trip.includes("reason: 'trip_media_replaced'"));

assert(schema.includes('trip_media_upload_sessions'));
assert(schema.includes('trip_media_cleanup_tasks'));

console.log('PASS trip logs and trip cover media use verified COS uploads with legacy cloud compatibility');
