const TRIP_LIST_VISIBILITY_CONFIG_ID = 'trip_list_visibility';
const DATA_ENVS = ['dev', 'test', 'prod'];

function normalizeVisibilityConfig(value = {}) {
  const source = value && typeof value.showPastTripsByEnv === 'object'
    ? value.showPastTripsByEnv
    : {};
  return DATA_ENVS.reduce((result, dataEnv) => {
    result[dataEnv] = source[dataEnv] === true;
    return result;
  }, {});
}

function getBeijingDateKey(now = Date.now()) {
  const date = new Date(Number(now) + 8 * 60 * 60 * 1000);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function normalizeTripDate(value) {
  const text = String(value || '').trim();
  const matched = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] : '';
}

function isPastTripDate(value, today = getBeijingDateKey()) {
  const dateKey = normalizeTripDate(value);
  return !!dateKey && dateKey < today;
}

function resolvePastReadEnvs(readEnvs, config, supportsHistoryPhases) {
  if (supportsHistoryPhases !== true) return [];
  const normalizedConfig = normalizeVisibilityConfig({ showPastTripsByEnv: config || {} });
  return (Array.isArray(readEnvs) ? readEnvs : [])
    .filter(dataEnv => normalizedConfig[dataEnv] === true);
}

function buildCursorFromTrip(phase, trip) {
  if (!trip) return { nextCursorPhase: phase, nextCursor: 0, nextCursorId: '' };
  return {
    nextCursorPhase: phase,
    nextCursor: Number(trip.createdAt) || 0,
    nextCursorId: String(trip._id || '')
  };
}

// 输入均为按 createdAt + _id 倒序且多取 1 条的探测结果。
// 该纯函数只负责跨阶段拼页，数据库游标条件由 handler 负责。
function paginateTripPhases({ phase = 'upcoming', pageSize = 10, upcomingProbe = [], pastProbe = [] } = {}) {
  const size = Math.max(1, Number(pageSize) || 10);
  if (phase === 'past') {
    const hasMore = pastProbe.length > size;
    const trips = pastProbe.slice(0, size);
    return {
      trips,
      hasMore,
      ...(hasMore ? buildCursorFromTrip('past', trips[trips.length - 1]) : buildCursorFromTrip('', null))
    };
  }

  if (upcomingProbe.length > size) {
    const trips = upcomingProbe.slice(0, size);
    return {
      trips,
      hasMore: true,
      ...buildCursorFromTrip('upcoming', trips[trips.length - 1])
    };
  }

  const remaining = size - upcomingProbe.length;
  const visiblePastTrips = pastProbe.slice(0, remaining);
  const trips = upcomingProbe.concat(visiblePastTrips);
  const hasMore = pastProbe.length > remaining;
  if (!hasMore) {
    return { trips, hasMore: false, ...buildCursorFromTrip('', null) };
  }
  return {
    trips,
    hasMore: true,
    ...buildCursorFromTrip('past', visiblePastTrips[visiblePastTrips.length - 1])
  };
}

function getPastTripWriteError(trip, operation, today = getBeijingDateKey()) {
  if (!trip || !isPastTripDate(trip.date, today)) return '';
  const messages = {
    join: '往期行程不能加入',
    apply: '往期行程不能申请加入',
    edit: '往期行程不能编辑',
    start: '往期行程不能开始',
    log: '往期行程不能发布日志'
  };
  return messages[operation] || '往期行程不能执行该操作';
}

module.exports = {
  TRIP_LIST_VISIBILITY_CONFIG_ID,
  DATA_ENVS,
  normalizeVisibilityConfig,
  getBeijingDateKey,
  normalizeTripDate,
  isPastTripDate,
  resolvePastReadEnvs,
  paginateTripPhases,
  getPastTripWriteError
};
