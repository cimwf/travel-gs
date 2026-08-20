#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'tripPoster.js');
const cosPath = require.resolve('cos-nodejs-sdk-v5', { paths: [apiRoot] });

const trip = {
  _id: 'trip-poster-1',
  creatorId: 'user-1',
  reviewStatus: 'approved',
  dataEnv: 'test'
};
const storedObjects = new Map();
let openApiCalls = 0;
let lastCodeRequest = null;

class MockCos {
  headObject(options, callback) {
    callback(storedObjects.has(options.Key) ? null : new Error('not found'));
  }

  putObject(options, callback) {
    storedObjects.set(options.Key, options.Body);
    callback(null, { statusCode: 200 });
  }
}

const db = {
  collection(name) {
    assert.strictEqual(name, 'trips');
    return {
      doc(id) {
        return {
          async get() { return { data: id === trip._id ? trip : null }; },
          async update(payload) { Object.assign(trip, payload.data); }
        };
      },
      where(condition) {
        return {
          limit() { return this; },
          async get() {
            return { data: trip.posterShareCode === condition.posterShareCode ? [trip] : [] };
          }
        };
      }
    };
  }
};

const cloud = {
  openapi: {
    wxacode: {
      async getUnlimited(options) {
        openApiCalls += 1;
        lastCodeRequest = options;
        return { buffer: Buffer.from('mini-program-code') };
      }
    }
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db, cloud }
};
require.cache[cosPath] = {
  id: cosPath,
  filename: cosPath,
  loaded: true,
  exports: MockCos
};

process.env.COS_SECRET_ID = 'test-secret-id';
process.env.COS_SECRET_KEY = 'test-secret-key';
delete require.cache[handlerPath];
const handler = require(handlerPath);

async function main() {
  const environment = { runtimeEnv: 'trial', readEnvs: ['test'] };
  const first = await handler.tripPosterCodeGet('viewer-1', { tripId: trip._id }, environment);
  assert.strictEqual(first.success, true);
  assert(handler.SHARE_CODE_PATTERN.test(first.shareCode));
  assert.strictEqual(first.runtimeEnv, 'trial');
  assert(first.codeUrl.includes('/miniapp/trip-posters/codes/trial/'));
  assert.strictEqual(openApiCalls, 1);
  assert.strictEqual(lastCodeRequest.scene, first.shareCode);
  assert.strictEqual(lastCodeRequest.page, 'pages/trip-detail/trip-detail');
  assert.strictEqual(lastCodeRequest.envVersion, 'trial');
  assert(lastCodeRequest.scene.length <= 32);

  const second = await handler.tripPosterCodeGet('viewer-1', { tripId: trip._id }, environment);
  assert.strictEqual(second.success, true);
  assert.strictEqual(second.shareCode, first.shareCode);
  assert.strictEqual(openApiCalls, 1, 'cached COS code should avoid repeated WeChat API calls');

  const resolved = await handler.tripPosterSceneResolve('viewer-1', { scene: first.shareCode }, environment);
  assert.deepStrictEqual(resolved, { success: true, tripId: trip._id });
  const wrongEnvironment = await handler.tripPosterSceneResolve(
    'viewer-1',
    { scene: first.shareCode },
    { runtimeEnv: 'release', readEnvs: ['prod'] }
  );
  assert.strictEqual(wrongEnvironment.success, false, 'poster scene must respect dataEnv isolation');

  const detailJs = fs.readFileSync(path.join(root, 'miniprogram/pages/trip-detail/trip-detail.js'), 'utf8');
  const detailWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/trip-detail/trip-detail.wxml'), 'utf8');
  const detailWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/trip-detail/trip-detail.wxss'), 'utf8');
  const cloudConfig = fs.readFileSync(path.join(root, 'cloudfunctions/api/config.json'), 'utf8');
  const posterDrawSource = detailJs.slice(detailJs.indexOf('drawTripPoster: async function'));
  assert(detailJs.includes('tripResolvePosterScene'));
  assert(detailJs.includes('wx.canvasToTempFilePath'));
  assert(detailJs.includes('const targetScale = 2'));
  assert(detailJs.includes('const maxCanvasEdge = 4096'));
  assert(detailJs.includes('const maxCanvasPixels = 12000000'));
  assert(detailJs.includes('const edgeScale = maxCanvasEdge / Math.max(logicalWidth, logicalHeight)'));
  assert(detailJs.includes('const areaScale = Math.sqrt(maxCanvasPixels / (logicalWidth * logicalHeight))'));
  assert(detailJs.includes('Math.floor(safeScale * 1000) / 1000'));
  assert(detailJs.includes('ctx.scale(renderScale, renderScale)'));
  assert(detailJs.includes('width: physicalWidth'));
  assert(detailJs.includes('height: physicalHeight'));
  assert(detailJs.includes('destWidth: physicalWidth'));
  assert(detailJs.includes('destHeight: physicalHeight'));
  assert(detailJs.includes("fileType: 'png'"));
  assert(!detailJs.includes("fileType: 'jpg'"));
  assert(!detailJs.includes('wx.saveImageToPhotosAlbum'));
  assert(!detailJs.includes('onSavePoster'));
  assert(detailJs.includes('drawPosterCalendarIcon'));
  assert(detailJs.includes('drawPosterLocationIcon'));
assert(detailJs.includes("'/images/xing-logo.png'"));
assert(!detailJs.includes('xing-logo-clean.png'));
assert(detailJs.includes("ctx.fillStyle = '#eaf3ff'"));
assert(detailJs.includes('ctx.arc(logoCenterX, logoCenterY, 48, 0, Math.PI * 2)'));
assert(detailJs.includes('ctx.arc(logoCenterX, logoCenterY, 32, 0, Math.PI * 2)'));
assert(detailJs.includes('ctx.drawImage(logo, logoCenterX - 32, logoCenterY - 32, 64, 64)'));
  assert(!detailJs.includes('onPreviewPoster'));
  assert(detailJs.includes("ctx.fillText('行程说明'"));
  assert(detailJs.includes("ctx.fillText('行程信息'"));
  assert(detailJs.includes("ctx.fillText('周末约行'"));
  assert(detailJs.includes("ctx.fillText('发现同路的人，记录真实旅途'"));
  assert(detailJs.includes("ctx.fillText('微信扫码，查看行程详情'"));
  assert(detailJs.includes('const codeCenterX = 594'));
  assert(detailJs.includes('const overviewTop = 398'));
  assert(detailJs.includes('const brandHeight = 230'));
  assert(detailJs.includes('this.drawPosterCover(ctx, cover, 0, 0, width, 430)'));
  assert(detailJs.includes('row.height = Math.max(86'));
  assert(detailJs.includes('this.drawPosterRoundRect(ctx, 24, top, 702, cardHeight, 22)'));
  assert(!posterDrawSource.includes('icon-profile-calendar.svg'));
  assert(!posterDrawSource.includes('icon-profile-location.svg'));
  ['发起人', '已加入成员', '旅途记录', '评论'].forEach(copy => {
    assert(!posterDrawSource.includes("ctx.fillText('" + copy), 'poster must not render ' + copy);
  });
  assert(detailWxml.includes('open-type="share"'));
  assert(detailWxml.includes('微信好友'));
  assert(detailWxml.includes('生成海报'));
  assert(detailWxml.includes('trip-share-actions'));
  assert(detailWxml.includes('class="trip-share-wechat-image" src="/images/wechat.png" mode="aspectFit"'));
  assert(!detailWxml.includes('trip-share-wechat-bubble'));
  assert(detailWxml.includes('trip-share-poster-frame'));
  assert(/\.trip-share-actions\s*\{[^}]*width:\s*100%;[^}]*justify-content:\s*space-around;/s.test(detailWxss));
  assert(/\.trip-share-action-icon-wechat\s*\{[^}]*background:\s*transparent;/s.test(detailWxss));
  assert(/\.trip-share-action\s*\{[^}]*flex:\s*1;[^}]*width:\s*0;[^}]*min-width:\s*0;/s.test(detailWxss));
  assert(/\.trip-share-wechat-image\s*\{[^}]*width:\s*104rpx;[^}]*height:\s*104rpx;/s.test(detailWxss));
  assert(detailWxml.includes('scroll-y'));
  assert(detailWxml.includes('mode="widthFix"'));
  assert(detailWxml.includes('show-menu-by-longpress="true"'));
  assert(detailWxml.includes('长按海报保存到相册'));
  assert(!detailWxml.includes('bindtap="onSavePoster"'));
  assert(!detailWxml.includes('预览大图'));
  assert(!detailWxml.includes('bindtap="onPreviewPoster"'));
  assert(detailWxml.includes('发现同路的人') === false, 'brand copy is rendered into canvas, not duplicated in modal DOM');
  assert(cloudConfig.includes('wxacode.getUnlimited'), 'api cloud function must declare mini-program code permission');

  console.log('PASS trip poster uses version-aware official mini-program code, COS cache and save flow');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
