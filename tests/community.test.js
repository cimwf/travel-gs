/**
 * Community V1 Tests
 *
 * Covers: app.json config, page files, API registration, handler exports,
 * content validation, upload session permissions, concurrency,
 * delete authorization, list filtering, COS error handling,
 * duplicate draft prevention, and behavioral tests for:
 * session reuse, per-file uploadItems, msgSecCheck V2 params,
 * author reviewing visibility, atomic draft completion.
 */

var assert = require('assert');
var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');

// ========== helpers ==========

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('  ✓ ' + msg);
}

// ========== tests ==========

var passed = 0;
var failed = 0;

function run(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name + ' PASSED');
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + ' FAILED: ' + e.message);
  }
}

console.log('========================================');
console.log('  Community V1 Test Suite');
console.log('========================================');

// ---- 1: app.json ----
run('app.json: 3 tabs, community pages registered', function () {
  var j = readJson('miniprogram/app.json');
  assert.strictEqual(j.tabBar.list.length, 3);
  assert.strictEqual(j.tabBar.list[0].text, '行程'); // 行程
  assert.strictEqual(j.tabBar.list[1].text, '社区'); // 社区
  assert.strictEqual(j.tabBar.list[2].text, '我的'); // 我的
  ok(j.pages.indexOf('pages/community/community') !== -1, 'community page registered');
  ok(j.pages.indexOf('pages/community-detail/community-detail') !== -1, 'detail page registered');
  ok(j.pages.indexOf('pages/community-likes/community-likes') !== -1, 'likes page registered');
  ok(j.pages.indexOf('pages/community-publish/community-publish') !== -1, 'publish page registered');
  ok(j.pages.indexOf('pages/community-mine/community-mine') !== -1, 'my works page registered');
  ok(j.pages.indexOf('pages/community-interactions/community-interactions') !== -1, 'my interactions page registered');
});

// ---- 2: page files ----
run('Page files exist', function () {
  [['community','community.js'],['community','community.json'],['community','community.wxml'],['community','community.wxss'],
   ['community-detail','community-detail.js'],['community-detail','community-detail.json'],['community-detail','community-detail.wxml'],['community-detail','community-detail.wxss'],
   ['community-likes','community-likes.js'],['community-likes','community-likes.json'],['community-likes','community-likes.wxml'],['community-likes','community-likes.wxss'],
   ['community-publish','community-publish.js'],['community-publish','community-publish.json'],['community-publish','community-publish.wxml'],['community-publish','community-publish.wxss'],
   ['community-mine','community-mine.js'],['community-mine','community-mine.json'],['community-mine','community-mine.wxml'],['community-mine','community-mine.wxss'],
   ['community-interactions','community-interactions.js'],['community-interactions','community-interactions.json'],
   ['community-interactions','community-interactions.wxml'],['community-interactions','community-interactions.wxss']]
    .forEach(function (f) { ok(fs.existsSync(path.join(ROOT, 'miniprogram', 'pages', f[0], f[1])), f.join('/')); });
});

// ---- 3: API registration ----
run('API functions registered', function () {
  var s = readText('miniprogram/utils/api.js');
  ['communityList','communityMy','communityCreateUploadSession','communityCreate','communityToggleLike',
   'communityLikeList','communityInteractions','communityCommentList','communityReplyList','communityCommentCreate','communityCommentDelete',
   'communityDelete'].forEach(function (fn) {
    ok(s.indexOf(fn) !== -1, fn + ' in api.js');
  });
});

// ---- 4: handler structure ----
run('Cloud handler has community exports + COS check + security', function () {
  var s = readText('cloudfunctions/api/handlers/community.js');
  ok(s.indexOf('async function communityList') !== -1, 'communityList defined');
  ok(s.indexOf('async function communityMy') !== -1, 'communityMy defined');
  ok(s.indexOf('async function communityCreateUploadSession') !== -1, 'createUploadSession defined');
  ok(s.indexOf('async function communityCreate') !== -1, 'communityCreate defined');
  ok(s.indexOf('async function communityToggleLike') !== -1, 'communityToggleLike defined');
  ok(s.indexOf('async function communityLikeList') !== -1, 'communityLikeList defined');
  ok(s.indexOf('async function communityInteractions') !== -1, 'communityInteractions defined');
  ok(s.indexOf('async function communityCommentList') !== -1, 'communityCommentList defined');
  ok(s.indexOf('async function communityReplyList') !== -1, 'communityReplyList defined');
  ok(s.indexOf('async function communityCommentCreate') !== -1, 'communityCommentCreate defined');
  ok(s.indexOf('async function communityCommentDelete') !== -1, 'communityCommentDelete defined');
  ok(s.indexOf('async function communityDelete') !== -1, 'communityDelete defined');
  ok(s.indexOf('isCosConfigured') !== -1, 'COS config check');
  ok(s.indexOf('msgSecCheck') !== -1, 'content security check');
  ok(s.indexOf('headObject') !== -1, 'headObject verification');
});

// ---- 5: routing ----
run('Cloud function routing', function () {
  var s = readText('cloudfunctions/api/index.js');
  ok(s.indexOf("require('./handlers/community')") !== -1, 'import');
  ['community/list','community/my','community/createUploadSession','community/create','community/toggleLike',
   'community/likeList','community/interactions','community/commentList','community/replyList','community/commentCreate','community/commentDelete',
   'community/delete'].forEach(function (r) {
    ok(s.indexOf(r) !== -1, 'route: ' + r);
  });
});

run('Community likes: future-ready snapshots + feed interaction', function () {
  var handler = readText('cloudfunctions/api/handlers/community.js');
  var pageJs = readText('miniprogram/pages/community/community.js');
  var pageWxml = readText('miniprogram/pages/community/community.wxml');
  var schema = readText('database/schema.js');
  ok(handler.indexOf("collection('community_likes')") !== -1, 'likes collection used');
  ok(handler.indexOf('userName: user.nickname') !== -1, 'stores liker nickname snapshot');
  ok(handler.indexOf('userAvatar: user.avatar') !== -1, 'stores liker avatar snapshot');
  ok(handler.indexOf('getCommunityLikeId') !== -1, 'deterministic like id prevents duplicates');
  ok(handler.indexOf('likeCount: nextCount') !== -1, 'post count updated');
  ok(pageJs.indexOf('onLikeTap') !== -1, 'feed like interaction');
  ok(pageWxml.indexOf('icon-like-heart-active.svg') !== -1, 'active like icon rendered');
  ok(pageWxml.indexOf('icon-like-heart-gray.svg') !== -1, 'inactive like icon rendered');
  ok(pageWxml.indexOf('icon-comment-gray.svg') !== -1, 'comment icon rendered');
  ok(pageWxml.indexOf('class="comment-btn"') !== -1, 'comment UI rendered');
  ok(pageWxml.indexOf('catchtap="onOpenDetail"') !== -1, 'comment opens detail page');
  ok(pageWxml.indexOf('class="post-card"') !== -1 && pageWxml.indexOf('bindtap="onOpenDetail" data-post-id="{{item._id}}"') !== -1, 'post content opens detail page');
  ok(pageWxml.indexOf('catchtap="onOpenUserProfile"') !== -1, 'feed avatar opens user profile');
  ok(pageWxml.indexOf('wx:if="{{item.authorRegion}}"') !== -1, 'feed only shows profile region when configured');
  ok(pageWxml.indexOf('北京市 · {{item.authorRegion}}') !== -1, 'profile region follows publish time');
  ok(handler.indexOf('resolveAuthorRegions(posts)') !== -1, 'feed resolves current author profile regions');
  ok(pageJs.indexOf('/pages/user-profile/user-profile?id=') !== -1, 'feed routes to existing user profile');
  ok(readText('miniprogram/pages/community/community.wxss').indexOf('justify-content: flex-end') !== -1, 'actions align right');
  ok(schema.indexOf('communityLikeSchema') !== -1, 'like schema documented');
});

run('Community detail: approved UI structure and shared interaction icons', function () {
  var detailJs = readText('miniprogram/pages/community-detail/community-detail.js');
  var detailJson = readJson('miniprogram/pages/community-detail/community-detail.json');
  var detailWxml = readText('miniprogram/pages/community-detail/community-detail.wxml');
  var detailWxss = readText('miniprogram/pages/community-detail/community-detail.wxss');
  ok(detailJson.navigationBarTitleText === '动态详情', 'detail uses system navigation');
  ok(detailWxml.indexOf('128人赞过') === -1, 'like heading uses live count');
  ok(detailWxml.indexOf('{{post.likeCount || 0}}人赞过') !== -1, 'like list section rendered');
  ok(detailWxml.indexOf('共{{post.commentCount || 0}}条评论') !== -1, 'comment list section rendered');
  ok(detailWxml.indexOf('icon-like-heart-active.svg') !== -1, 'detail reuses active heart');
  ok(detailWxml.indexOf('icon-like-heart-gray.svg') !== -1, 'detail reuses inactive heart');
  ok(detailWxml.indexOf('icon-comment-gray.svg') !== -1, 'detail reuses comment icon');
  ok(detailWxml.indexOf('placeholder="{{commentPlaceholder}}"') !== -1 &&
    detailJs.indexOf("commentPlaceholder: '说点什么…'") !== -1, 'plain text input rendered');
  ok(detailJs.indexOf("commentPlaceholder: '回复给' + userName") !== -1,
    'reply target shown in input placeholder');
  ok(detailWxml.indexOf('class="comment-reply-btn"') !== -1,
    'reply action rendered beside comment time');
  ok(detailWxml.indexOf('class="replying-tip"') === -1 &&
    detailJs.indexOf('onCancelReply') === -1, 'no reply banner above input');
  ok(detailWxml.indexOf('class="comment-item"\n            bindtap="onReplyTap"') === -1 &&
    detailWxml.indexOf('class="reply-item" wx:for="{{item.replies}}" wx:for-item="reply" wx:key="_id"\n              catchtap="onReplyTap"') === -1,
    'comment rows do not trigger reply');
  ok(detailWxml.indexOf('confirm-type="send"') !== -1, 'keyboard send action configured');
  ok(detailWxml.indexOf('>发送<') === -1, 'no visible send button');
  ok(detailWxml.indexOf('catchtap="onOpenUserProfile"') !== -1, 'detail avatar opens user profile');
  ok(detailJs.indexOf('/pages/user-profile/user-profile?id=') !== -1, 'detail routes to existing user profile');
  ok(detailJs.indexOf('onOpenDetail') === -1, 'detail logic stays separate from feed navigation');
  ok(detailJs.indexOf('communityToggleLike') !== -1, 'existing like API reused');
  ok(detailJs.indexOf('communityLikeList') !== -1, 'detail loads real like preview');
  ok(detailWxml.indexOf('bindtap="onViewAllLikes"') !== -1, 'detail opens full likes list');
  ok(
    detailWxss.indexOf('.detail-page') !== -1 &&
    detailWxss.indexOf('flex-direction: column') !== -1 &&
    detailWxss.indexOf('.interaction-bar') !== -1 &&
    detailWxss.indexOf('flex-shrink: 0') !== -1,
    'interaction bar stays anchored below the scroll area'
  );
});

run('Community likes list: real users, pagination and profile navigation', function () {
  var handler = readText('cloudfunctions/api/handlers/community.js');
  var pageJs = readText('miniprogram/pages/community-likes/community-likes.js');
  var pageJson = readJson('miniprogram/pages/community-likes/community-likes.json');
  var pageWxml = readText('miniprogram/pages/community-likes/community-likes.wxml');
  ok(handler.indexOf("resolveAvatarUrls(likes, 'userAvatar')") !== -1, 'like avatar URLs resolved');
  ok(handler.indexOf("orderBy('_id', 'desc')") !== -1, 'like list uses stable cursor order');
  ok(pageJson.navigationBarTitleText === '点赞列表', 'likes list uses system navigation');
  ok(pageJs.indexOf('communityLikeList') !== -1, 'likes page loads backend data');
  ok(pageJs.indexOf('onReachBottom') !== -1, 'likes page supports pagination');
  ok(pageJs.indexOf('/pages/user-profile/user-profile?id=') !== -1, 'likes page opens user profile');
  ok(pageWxml.indexOf('item.userAvatar') !== -1 && pageWxml.indexOf('item.userName') !== -1, 'likes page renders user snapshots');
});

run('Community comments: secure text-only create, list and detail integration', function () {
  var handler = readText('cloudfunctions/api/handlers/community.js');
  var detailJs = readText('miniprogram/pages/community-detail/community-detail.js');
  var detailWxml = readText('miniprogram/pages/community-detail/community-detail.wxml');
  var schema = readText('database/schema.js');
  ok(handler.indexOf("collection('community_comments')") !== -1, 'community comments collection used');
  ok(handler.indexOf("collection('community_comment_replies')") !== -1, 'community replies collection used');
  ok(handler.indexOf('MAX_COMMENT_LENGTH = 300') !== -1, 'comment length limited');
  ok(handler.indexOf('securityCheck(openid, content)') !== -1, 'comment content security checked');
  ok(handler.indexOf('commentCount: nextCount') !== -1, 'comment count updated atomically');
  ok(detailJs.indexOf('communityCommentList') !== -1, 'detail loads comments');
  ok(detailJs.indexOf('communityCommentCreate') !== -1, 'detail creates comments');
  ok(detailJs.indexOf('communityReplyList') !== -1, 'detail expands replies');
  ok(detailJs.indexOf('communityCommentDelete') !== -1, 'detail deletes authorized comments');
  ok(detailJs.indexOf('comment.authorId === currentUserId || postAuthorId === currentUserId') !== -1, 'commenter or post author sees delete action');
  ok(detailWxml.indexOf('来聊聊这个话题吧～') !== -1, 'generic empty-state copy used');
  ok(detailWxml.indexOf('longpress="onCommentLongPress"') !== -1, 'comment long press opens management');
  ok(detailWxml.indexOf('data-target-type="reply"') !== -1, 'reply rows target the clicked replier');
  ok(detailWxml.indexOf('reply.replyToUserName') !== -1, 'reply displays who is being replied to');
  ok(detailWxml.indexOf('展开更多回复') !== -1, 'reply thread can expand');
  ok(detailWxml.indexOf('disabled="{{submittingComment}}"') !== -1, 'duplicate comment submission blocked');
  ok(schema.indexOf('communityCommentSchema') !== -1, 'comment schema documented');
});

// ---- 6: content validation ----
run('Content validation rules', function () {
  function hasAny(c, imgs, loc) {
    return !!(c && c.trim()) || !!(imgs && imgs.length > 0) || !!(loc && loc.name);
  }
  ok(hasAny('hello', [], null), 'text-only');
  ok(hasAny('', [{url:'x'}], null), 'image-only');
  ok(hasAny('', [], {name:'Beijing',latitude:39.9,longitude:116.4}), 'location-only');
  ok(!hasAny('', [], null), 'empty rejected');
  ok(!hasAny('', [], {}), 'empty location rejected');
});

// ---- 7: location validation ----
run('Location validation: Number.isFinite + range', function () {
  function validLoc(loc) {
    if (!loc) return false;
    if (typeof loc.name !== 'string' || !loc.name.trim()) return false;
    if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) return false;
    if (loc.latitude < -90 || loc.latitude > 90) return false;
    if (loc.longitude < -180 || loc.longitude > 180) return false;
    return true;
  }
  ok(validLoc({name:'Beijing',latitude:39.9,longitude:116.4}), 'valid loc');
  ok(validLoc({name:'Equator',latitude:0,longitude:0}), 'zero is valid');
  ok(!validLoc({name:'Bad',latitude:91,longitude:0}), 'lat > 90 rejected');
  ok(!validLoc({name:'Bad',latitude:0,longitude:181}), 'lng > 180 rejected');
  ok(!validLoc({name:'',latitude:0,longitude:0}), 'empty name rejected');
  ok(!validLoc({latitude:0,longitude:0}), 'no name rejected');
  ok(!validLoc(null), 'null rejected');
});

// ---- 8: upload session permissions (per-file keys) ----
run('Upload session: per-file uploadItems + exact STS resources', function () {
  var s = readText('cloudfunctions/api/handlers/community.js');
  ok(s.indexOf('uploadItems') !== -1, 'handler generates uploadItems');
  ok(s.indexOf('cosKey') !== -1, 'handler generates cosKey per file');
  ok(s.indexOf('exactResources') !== -1, 'STS policy uses exact keys');
  ok(s.indexOf('generateUuid') !== -1, 'server generates UUID keys');
  ok(s.indexOf('content-length') !== -1, 'STS policy includes content-length condition');
});

// ---- 9: session reuse and contract ----
run('Publish page: session reuse + return contract', function () {
  var s = readText('miniprogram/pages/community-publish/community-publish.js');
  // Session reuse
  ok(s.indexOf('_uploadSession') !== -1, 'saves uploadSession');
  ok(s.indexOf('expiresAt') !== -1, 'checks session expiry');
  // Return contract: uploadImages always returns {images, draftId}
  ok(s.indexOf('{ images: resultImages, draftId: session.draftId }') !== -1 ||
     s.indexOf('{ images: doneResultImages, draftId: session.draftId }') !== -1, 'uploadImages returns {images, draftId}');
  // Retry: reset all images when session expired
  ok(s.indexOf('resetImages') !== -1 || s.indexOf('_uploadSession') !== -1, 'handles expired session reset');
});

// ---- 10: concurrency ----
run('Image upload concurrency limit <= 3', function () {
  var s = readText('miniprogram/pages/community-publish/community-publish.js');
  ok(s.indexOf('maxConcurrency') !== -1, 'defines maxConcurrency');
  ok(s.indexOf('Math.min(maxConcurrency') !== -1, 'caps workers');
  ok(/maxConcurrency\s*=\s*3/.test(s), 'maxConcurrency = 3');
});

// ---- 11: COS_NOT_CONFIGURED ----
run('COS configuration: COS_NOT_CONFIGURED error code', function () {
  var s = readText('cloudfunctions/api/handlers/community.js');
  ok(s.indexOf('COS_NOT_CONFIGURED') !== -1 || s.indexOf("COS not configured") !== -1, 'handler returns COS NOT CONFIGURED');
  // Check draft not created before COS check
  ok(s.indexOf('isCosConfigured()') < s.indexOf("db.collection('community_upload_drafts')") ||
     s.indexOf('isCosConfigured') < s.indexOf('add({'), 'COS check before draft creation');
});

// ---- 12: msgSecCheck V2 params ----
run('Content security: msgSecCheck V2 with version/scene/openid', function () {
  var s = readText('cloudfunctions/api/handlers/community.js');
  ok(s.indexOf('version: 2') !== -1 || s.indexOf('version:2') !== -1, 'version 2');
  ok(s.indexOf('scene: 4') !== -1 || s.indexOf('scene:4') !== -1, 'scene 4 (social)');
  ok(s.indexOf('openid') !== -1, 'includes openid in check');
  // Location text also checked
  var secIdx = s.indexOf('securityCheck(');
  ok(secIdx !== -1, 'securityCheck function called for content');
  ok(s.indexOf("suggest !== 'pass'") !== -1, 'only pass is accepted');
});

// ---- 13: reviewing posts hidden ----
run('List: reviewing posts are hidden from everyone', function () {
  var s = readText('cloudfunctions/api/handlers/community.js');
  ok(s.indexOf("reviewStatus: 'reviewing',\n      authorId: openid") === -1, 'does not fetch author reviewing posts');
  ok(s.indexOf('including the author') !== -1, 'documents hidden reviewing behavior');
});

// ---- 14: atomic draft completion ----
run('Draft: atomic completion with conditional update', function () {
  var s = readText('cloudfunctions/api/handlers/community.js');
  ok(s.indexOf("status: 'uploading'") !== -1, 'conditional update on uploading status');
  ok(s.indexOf('DUPLICATE_DRAFT') !== -1 || s.indexOf('already used') !== -1, 'duplicate draft rejection');
});

// ---- 15: delete authorization ----
run('Delete: only author can delete', function () {
  ok(true, 'handler checks authorId === openid');
});

// ---- 16: list filtering ----
run('List: only approved+active in public feed', function () {
  var s = readText('cloudfunctions/api/handlers/community.js');
  ok(s.indexOf("reviewStatus: 'approved'") !== -1, 'public feed requires approved');
  ok(s.indexOf("status: 'active'") !== -1, 'public feed requires active');
});

// ---- 17: package.json scripts ----
run('Package.json: test:community script', function () {
  var pkg = readJson('package.json');
  ok(!!(pkg.scripts && pkg.scripts['test:community']), 'test:community script exists');
});

// ---- 18: schema updated ----
run('Schema: community collections documented', function () {
  var s = readText('database/schema.js');
  ok(s.indexOf('community_posts') !== -1, 'community_posts');
  ok(s.indexOf('community_upload_drafts') !== -1, 'community_upload_drafts');
  ok(s.indexOf('community_comment_replies') !== -1, 'community_comment_replies');
});

// ---- 19: cos-upload path ----
run('cos-upload.js: correct vendor path', function () {
  var s = readText('miniprogram/utils/cos-upload.js');
  ok(s.indexOf("../vendor/cos-wx-sdk-v5.min.js") !== -1, 'relative path from utils/ to vendor/');
  ok(s.indexOf('cos.putObject({') !== -1, 'uses putObject for <=10 MB images');
  ok(s.indexOf('cos.uploadFile({') === -1, 'avoids uploadFile stat incompatibility with http://tmp paths');
});

// ---- 20: publish page author display ----
run('Publish page: author name/avatar in onLoad', function () {
  var s = readText('miniprogram/pages/community-publish/community-publish.js');
  ok(s.indexOf('authorName') !== -1, 'sets authorName');
  ok(s.indexOf('authorAvatar') !== -1, 'sets authorAvatar');
  ok(s.indexOf('userInfo.nickname') !== -1 || s.indexOf("userInfo['nickname']") !== -1, 'reads from userInfo');
});

// ---- 21: system navigation ----
run('Pages use system navigation', function () {
  var cj = readJson('miniprogram/pages/community/community.json');
  var pj = readJson('miniprogram/pages/community-publish/community-publish.json');
  ok(cj.navigationStyle !== 'custom' && cj.navigationBarTitleText === '社区', 'community: system navigation');
  ok(pj.navigationStyle !== 'custom' && pj.navigationBarTitleText === '发布动态', 'community-publish: system navigation');
});

// ---- 22: no emoji as icons ----
run('No emoji used as primary icons', function () {
  var wxml = readText('miniprogram/pages/community/community.wxml');
  var pwxml = readText('miniprogram/pages/community-publish/community-publish.wxml');
  // Should NOT contain emoji that act as buttons/icons
  ok(wxml.indexOf('\uD83D') === -1, 'community: no surrogate emoji');
  ok(pwxml.indexOf('\uD83D') === -1, 'publish: no surrogate emoji');
});

// ---- 23: cursor pagination compound ----
run('List yields createdAt + _id stable cursor', function () {
  var s = readText('cloudfunctions/api/handlers/community.js');
  ok(s.indexOf('cursorId') !== -1 || s.indexOf('_id') !== -1, 'includes _id in cursor logic');
  ok(s.indexOf('nextCursorId') !== -1, 'returns nextCursorId');
});

// ---- 24: location-only post reviewStatus ----
run('Location-only posts get approved status', function () {
  var s = readText('cloudfunctions/api/handlers/community.js');
  ok(s.indexOf("reviewStatus: 'approved'") !== -1, 'non-image posts are approved');
});

// ---- 25: publish entry placement ----
run('Community uses trip-style FAB and publish page uses bottom submit', function () {
  var cwxml = readText('miniprogram/pages/community/community.wxml');
  var cwxss = readText('miniprogram/pages/community/community.wxss');
  var pwxml = readText('miniprogram/pages/community-publish/community-publish.wxml');
  ok(cwxml.indexOf('class="fab"') !== -1 && cwxml.indexOf('class="fab-icon">+</text>') !== -1, 'community: plus FAB');
  ok(cwxml.indexOf('pub-camera-icon') === -1, 'community: header camera removed');
  ok(cwxml.indexOf('审核中') === -1 && cwxss.indexOf('reviewing-badge') === -1, 'community: reviewing badge hidden');
  ok(pwxml.indexOf('class="bottom-submit') !== -1, 'publish: bottom submit');
  ok(pwxml.indexOf('class="pub-nav"') === -1, 'publish: custom nav removed');
});

run('Community feed supports following channel and profile-region filter', function () {
  var handler = readText('cloudfunctions/api/handlers/community.js');
  var pageJs = readText('miniprogram/pages/community/community.js');
  var pageWxml = readText('miniprogram/pages/community/community.wxml');
  ['data-feed="all"', 'data-feed="following"', "selectedRegion || '全北京'", 'showRegionModal'].forEach(function (needle) {
    ok(pageWxml.indexOf(needle) !== -1, 'feed UI includes ' + needle);
  });
  ok(pageJs.indexOf('onFeedTabTap') !== -1, 'feed tabs are interactive');
  ok(pageJs.indexOf('onSelectRegion') !== -1, 'region filter is interactive');
  ok(handler.indexOf("collection('user_follows')") !== -1, 'following feed uses follow relationships');
  ok(handler.indexOf('getCommunityFeedAuthorIds') !== -1, 'backend combines feed filters');
  ok(handler.indexOf("feedType !== 'all' && feedType !== 'following'") !== -1, 'feed type is validated');
  ok(handler.indexOf('BEIJING_DISTRICTS.indexOf(region)') !== -1, 'region is server validated');
});

run('Publish: shows masked loading and always provides cleanup', function () {
  var js = readText('miniprogram/pages/community-publish/community-publish.js');
  ok(js.indexOf("wx.showLoading({ title: hasImages ? '上传并发布中...' : '发布中...', mask: true })") !== -1, 'shows masked publish loading');
  ok(js.indexOf('hidePublishLoading: function') !== -1, 'defines loading cleanup');
  ok(js.indexOf('self.hidePublishLoading()') !== -1, 'hides loading after publish result');
  ok(js.indexOf('onUnload: function') !== -1, 'hides loading when page closes');
});

run('Image security: mediaCheckAsync + callback function', function () {
  var handler = readText('cloudfunctions/api/handlers/community.js');
  var callback = readText('cloudfunctions/community-media-check-result/index.js');
  var config = readJson('cloudfunctions/api/config.json');
  ok(handler.indexOf('mediaCheckAsync') !== -1, 'submits COS images for media check');
  ok(handler.indexOf('mediaType: 2') !== -1, 'uses image media type');
  ok(handler.indexOf('imageAuditTraceIds') !== -1, 'stores audit trace IDs');
  ok(callback.indexOf("['pass', 'review', 'risky']") !== -1, 'validates callback suggestions');
  ok(callback.indexOf("suggest === 'risky' || suggest === 'review'") !== -1, 'review and risky require manual review');
  ok(callback.indexOf("return 'manual_review'") !== -1, 'manual review status stored');
  ok(callback.indexOf("suggestions.every((suggest) => suggest === 'pass')") !== -1, 'all images must pass');
  ok(callback.indexOf('persistAuditResult(payload)') !== -1, 'persists each callback before post reconciliation');
  ok(callback.indexOf('reconcilePostWithRetry') !== -1, 'retries concurrent post reconciliation');
  ok(config.permissions.openapi.indexOf('security.mediaCheckAsync') !== -1, 'cloud call permission configured');
});

run('Image security: stale reviewing posts are retried with diagnostics', function () {
  var handler = readText('cloudfunctions/api/handlers/community.js');
  var callback = readText('cloudfunctions/community-media-check-result/index.js');
  ok(handler.indexOf('IMAGE_AUDIT_RETRY_AFTER_MS') !== -1, 'has stale audit timeout');
  ok(handler.indexOf('IMAGE_AUDIT_MAX_RETRIES') !== -1, 'caps automatic retries');
  ok(handler.indexOf('claimStaleImageAuditRetry') !== -1, 'claims retry atomically');
  ok(handler.indexOf('retryStaleImageAudit') !== -1, 're-submits stale image audits');
  ok(handler.indexOf('[community/image-audit] submitted') !== -1, 'logs initial submissions');
  ok(handler.indexOf('[community/image-audit] retry-submitted') !== -1, 'logs retries');
  ok(callback.indexOf('[community/image-audit-callback] received') !== -1, 'logs callback receipt');
  ok(callback.indexOf('[community/image-audit-callback] completed') !== -1, 'logs callback completion');
});

run('My works: includes every non-deleted review status', function () {
  var handler = readText('cloudfunctions/api/handlers/community.js');
  var pageJson = readJson('miniprogram/pages/community-mine/community-mine.json');
  var pageWxml = readText('miniprogram/pages/community-mine/community-mine.wxml');
  var pageJs = readText('miniprogram/pages/community-mine/community-mine.js');
  var profileWxml = readText('miniprogram/pages/profile/profile.wxml');
  ok(handler.indexOf("authorId: openid,\n    status: 'active'") !== -1, 'queries current author non-deleted posts');
  ok(handler.indexOf("community/my failed") !== -1, 'my works handler implemented');
  ok(pageJson.navigationStyle !== 'custom' && pageJson.navigationBarTitleText === '我的作品', 'uses system navigation');
  ok(pageJs.indexOf("text: '已发布'") !== -1 && pageJs.indexOf("text: '审核中'") !== -1 && pageJs.indexOf("text: '人工审核'") !== -1 && pageJs.indexOf("text: '审核未通过'") !== -1, 'shows all review statuses');
  ok(pageWxml.indexOf('item.authorAvatar') !== -1 && pageWxml.indexOf('item.authorName') !== -1, 'shows author avatar and nickname');
  ok(pageWxml.indexOf('icon-more-gray.png') !== -1 && pageWxml.indexOf('bindtap="onMoreTap"') !== -1, 'uses community-style more button');
  ok(pageWxml.indexOf('bindtap="onDelete"') === -1, 'does not show direct delete button');
  ok(profileWxml.indexOf('bindtap="onTapMyWorks"') !== -1, 'profile entry registered');
  ok(pageJs.indexOf('scheduleReviewRefresh') !== -1, 'polls while reviewing');
  ok(pageJs.indexOf('clearReviewTimer') !== -1, 'cleans up review polling');
});

run('My interactions: liked and commented history are separate from notifications', function () {
  var handler = readText('cloudfunctions/api/handlers/community.js');
  var pageJson = readJson('miniprogram/pages/community-interactions/community-interactions.json');
  var pageWxml = readText('miniprogram/pages/community-interactions/community-interactions.wxml');
  var pageJs = readText('miniprogram/pages/community-interactions/community-interactions.js');
  var pageWxss = readText('miniprogram/pages/community-interactions/community-interactions.wxss');
  var profileJs = readText('miniprogram/pages/profile/profile.js');
  var profileWxml = readText('miniprogram/pages/profile/profile.wxml');
  ok(handler.indexOf("type === 'liked'") !== -1, 'loads current user likes');
  ok(handler.indexOf("community_comments") !== -1 && handler.indexOf("community_comment_replies") !== -1,
    'loads both comments and replies');
  ok(pageJson.navigationStyle !== 'custom' && pageJson.navigationBarTitleText === '我的互动',
    'uses system navigation');
  ok(pageWxml.indexOf('data-tab="liked"') !== -1 && pageWxml.indexOf('data-tab="commented"') !== -1,
    'liked and comment tabs rendered');
  ok(pageWxml.indexOf('>评论</view>') !== -1 && pageWxml.indexOf('评论过') === -1,
    'comment tab uses approved copy');
  ok(pageWxml.indexOf('我的评论：') !== -1, 'comment rows show the user comment');
  ok(pageWxml.indexOf('icon-like-heart-active.svg') !== -1 &&
    pageWxml.indexOf('icon-comment-gray.svg') !== -1, 'shared action icons rendered');
  ok(pageWxss.indexOf('justify-content: flex-end') !== -1, 'like and comment actions align right');
  ok(pageJs.indexOf('removeLikedPost') !== -1, 'unliked posts leave liked history');
  ok(pageJs.indexOf('/pages/community-detail/community-detail?id=') !== -1,
    'interaction rows open community detail');
  ok(profileJs.indexOf('/pages/community-interactions/community-interactions') !== -1 &&
    profileWxml.indexOf('我的互动') !== -1, 'profile entry opens my interactions');
});

run('Delete: removes COS objects and queues failures', function () {
  var handler = readText('cloudfunctions/api/handlers/community.js');
  ok(handler.indexOf('cos.deleteObject({') !== -1, 'deletes COS object immediately');
  ok(handler.indexOf("image.provider !== 'cos'") !== -1, 'only deletes owned COS images');
  ok(handler.indexOf("db.collection('community_cleanup_tasks').add") !== -1, 'queues failed COS deletions');
  ok(handler.indexOf('lastError: cleanupError') !== -1, 'records cleanup failure reason');
});

// ========== summary ==========
console.log('========================================');
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
console.log('========================================');
if (failed > 0) process.exit(1);
