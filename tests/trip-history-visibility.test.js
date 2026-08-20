#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  TRIP_LIST_VISIBILITY_CONFIG_ID,
  normalizeVisibilityConfig,
  getBeijingDateKey,
  normalizeTripDate,
  isPastTripDate,
  resolvePastReadEnvs,
  paginateTripPhases,
  getPastTripWriteError
} = require('../cloudfunctions/api/utils/tripListVisibility');
const { matchesTripStatusFilter } = require('../miniprogram/utils/trip-list-status');

const root = path.resolve(__dirname, '..');

assert.strictEqual(TRIP_LIST_VISIBILITY_CONFIG_ID, 'trip_list_visibility');
assert.deepStrictEqual(normalizeVisibilityConfig(), { dev: false, test: false, prod: false });
assert.deepStrictEqual(normalizeVisibilityConfig({
  showPastTripsByEnv: { dev: true, test: 1, prod: false, unknown: true }
}), { dev: true, test: false, prod: false });

// 2026-08-19 16:30 in Beijing (08:30 UTC) must use the Beijing calendar day.
const now = Date.UTC(2026, 7, 19, 8, 30, 0);
assert.strictEqual(getBeijingDateKey(now), '2026-08-19');
assert.strictEqual(normalizeTripDate('2026-08-18'), '2026-08-18');
assert.strictEqual(normalizeTripDate('2026-08-18T10:00:00.000Z'), '2026-08-18');
assert.strictEqual(isPastTripDate('2026-08-18', '2026-08-19'), true);
assert.strictEqual(isPastTripDate('2026-08-19', '2026-08-19'), false);
assert.strictEqual(isPastTripDate('2026-08-20', '2026-08-19'), false);
assert.strictEqual(isPastTripDate('', '2026-08-19'), false);

assert.deepStrictEqual(resolvePastReadEnvs(['dev', 'test', 'prod'], {
  dev: false, test: true, prod: false
}, true), ['test']);
assert.deepStrictEqual(resolvePastReadEnvs(['dev', 'test', 'prod'], {
  dev: true, test: true, prod: true
}, false), []);

const makeTrips = (prefix, count, startCreatedAt) => Array.from({ length: count }, (_, index) => ({
  _id: `${prefix}-${index + 1}`,
  createdAt: startCreatedAt - index
}));

// 当前数据超过 10 条：第一页只返回当前阶段并产生稳定游标。
const upcoming12 = makeTrips('upcoming', 12, 1200);
const past5 = makeTrips('past', 5, 500);
const currentPage1 = paginateTripPhases({
  phase: 'upcoming', pageSize: 10, upcomingProbe: upcoming12.slice(0, 11)
});
assert.deepStrictEqual(currentPage1.trips.map(item => item._id), upcoming12.slice(0, 10).map(item => item._id));
assert.strictEqual(currentPage1.hasMore, true);
assert.strictEqual(currentPage1.nextCursorPhase, 'upcoming');
assert.strictEqual(currentPage1.nextCursorId, 'upcoming-10');
const currentPage2 = paginateTripPhases({
  phase: 'upcoming', pageSize: 10, upcomingProbe: upcoming12.slice(10), pastProbe: past5
});
assert.deepStrictEqual(currentPage2.trips.slice(0, 2).map(item => item._id), ['upcoming-11', 'upcoming-12']);
const currentSequence = [...currentPage1.trips, ...currentPage2.trips.slice(0, 2)].map(item => item._id);
assert.deepStrictEqual(currentSequence, upcoming12.map(item => item._id));
assert.strictEqual(new Set(currentSequence).size, 12);

// 当前不足 10 条时，同一页无缝衔接往期；下一页从已展示的最后一条往期继续。
const upcoming7 = makeTrips('current', 7, 700);
const mixedPage1 = paginateTripPhases({
  phase: 'upcoming', pageSize: 10, upcomingProbe: upcoming7, pastProbe: past5.slice(0, 4)
});
assert.deepStrictEqual(mixedPage1.trips.map(item => item._id), [
  ...upcoming7.map(item => item._id),
  ...past5.slice(0, 3).map(item => item._id)
]);
assert.strictEqual(mixedPage1.hasMore, true);
assert.strictEqual(mixedPage1.nextCursorPhase, 'past');
assert.strictEqual(mixedPage1.nextCursorId, 'past-3');
const mixedPage2 = paginateTripPhases({
  phase: 'past', pageSize: 10, pastProbe: past5.slice(3)
});
assert.deepStrictEqual(mixedPage2.trips.map(item => item._id), ['past-4', 'past-5']);
assert.strictEqual(mixedPage2.hasMore, false);
const mixedIds = [...mixedPage1.trips, ...mixedPage2.trips].map(item => item._id);
assert.strictEqual(new Set(mixedIds).size, 12);
assert.deepStrictEqual(mixedIds, [...upcoming7, ...past5].map(item => item._id));

// 当前正好 10 条时，不提前消费探测到的第一条往期数据。
const upcoming10 = makeTrips('boundary', 10, 1000);
const boundaryPage = paginateTripPhases({
  phase: 'upcoming', pageSize: 10, upcomingProbe: upcoming10, pastProbe: past5.slice(0, 1)
});
assert.deepStrictEqual(boundaryPage.trips.map(item => item._id), upcoming10.map(item => item._id));
assert.strictEqual(boundaryPage.hasMore, true);
assert.strictEqual(boundaryPage.nextCursorPhase, 'past');
assert.strictEqual(boundaryPage.nextCursor, 0);
assert.strictEqual(boundaryPage.nextCursorId, '');

// 默认筛选只放行服务端明确标记的往期卡片，不恢复非往期的 ended 旧数据。
assert.strictEqual(matchesTripStatusFilter({ statusClass: 'ended', isPastTrip: false }, ''), false);
assert.strictEqual(matchesTripStatusFilter({ statusClass: 'ended', isPastTrip: true }, ''), true);
assert.strictEqual(matchesTripStatusFilter({ statusClass: 'ongoing', isPastTrip: false }, ''), true);

// 后端所有关键写入口共用同一日期判断，今天及未来不拦截，往期明确拒绝。
const pastTrip = { date: '2026-08-18' };
const currentTrip = { date: '2026-08-19' };
assert.strictEqual(getPastTripWriteError(pastTrip, 'join', '2026-08-19'), '往期行程不能加入');
assert.strictEqual(getPastTripWriteError(pastTrip, 'apply', '2026-08-19'), '往期行程不能申请加入');
assert.strictEqual(getPastTripWriteError(pastTrip, 'edit', '2026-08-19'), '往期行程不能编辑');
assert.strictEqual(getPastTripWriteError(pastTrip, 'start', '2026-08-19'), '往期行程不能开始');
assert.strictEqual(getPastTripWriteError(pastTrip, 'log', '2026-08-19'), '往期行程不能发布日志');
assert.strictEqual(getPastTripWriteError(currentTrip, 'edit', '2026-08-19'), '');

const tripHandler = fs.readFileSync(path.join(root, 'cloudfunctions/api/handlers/trip.js'), 'utf8');
const applyHandler = fs.readFileSync(path.join(root, 'cloudfunctions/api/handlers/apply.js'), 'utf8');
const tripLogHandler = fs.readFileSync(path.join(root, 'cloudfunctions/api/handlers/tripLog.js'), 'utf8');
const tripMediaHandler = fs.readFileSync(path.join(root, 'cloudfunctions/api/handlers/tripMedia.js'), 'utf8');
const apiRouter = fs.readFileSync(path.join(root, 'cloudfunctions/api/index.js'), 'utf8');
const tripListPage = fs.readFileSync(path.join(root, 'miniprogram/pages/trip-list/trip-list.js'), 'utf8');
const tripDetailPage = fs.readFileSync(path.join(root, 'miniprogram/pages/trip-detail/trip-detail.js'), 'utf8');
const tripDetailTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/trip-detail/trip-detail.wxml'), 'utf8');
const adminSettings = fs.readFileSync(path.join(root, '..', 'travel-be-gs', 'src/pages/settings/index.tsx'), 'utf8');

assert(tripHandler.includes("phase === 'past' ? { date: _.lt(today) } : { date: _.gte(today) }"));
assert(tripHandler.includes('paginateTripPhases'));
assert(tripHandler.includes('resolvePastReadEnvs(readEnvs, visibilityConfig, supportsHistoryPhases)'));
assert(tripHandler.includes('data.supportsTripHistoryPhases === true'));
assert(tripHandler.includes("getPastTripWriteError(trip, 'join')"));
assert(tripHandler.match(/getPastTripWriteError\(trip, 'edit'\)/g).length >= 2);
assert(applyHandler.includes("getPastTripWriteError(tripData, 'apply')"));
assert(tripLogHandler.match(/getPastTripWriteError\(trip, 'log'\)/g).length >= 4);
assert(tripLogHandler.includes("getPastTripWriteError(trip, 'start')"));
assert(tripMediaHandler.includes("getPastTripWriteError(trip, 'edit')"));
assert(tripMediaHandler.includes("getPastTripWriteError(trip, 'log')"));
assert(apiRouter.includes("case 'admin/tripListVisibilityGet'"));
assert(apiRouter.includes("case 'admin/tripListVisibilityUpdate'"));
assert(tripListPage.includes('reqData.cursorPhase = this._cursorPhase'));
assert(tripListPage.includes('supportsTripHistoryPhases: true'));
assert(tripListPage.includes("statusText = '已结束'"));
assert(tripListPage.includes('isPastTrip: trip.isPastTrip === true'));
assert(!tripListPage.includes('过滤掉已过期的行程'));
assert(tripDetailPage.includes('isPastTrip'));
assert(tripDetailTemplate.includes('wx:if="{{!isPastTrip}}" bindtap="onPublishLogTap"'));
assert(adminSettings.includes("admin/tripListVisibilityUpdate"));
assert(adminSettings.includes('公开列表展示往期行程'));

console.log('PASS trip history visibility config, Beijing date boundary, pagination phases and join guards');
