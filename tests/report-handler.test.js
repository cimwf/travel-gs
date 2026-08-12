const assert = require('assert');
const Module = require('module');

function collectionFactory(store) {
  return function collection(name) {
    return {
      doc(id) {
        return {
          async get() {
            const value = store[name] && store[name][id];
            if (!value) throw new Error('not found');
            return { data: { _id: id, ...value } };
          }
        };
      },
      where(query) {
        return {
          limit() { return this; },
          async get() {
            const rows = Object.entries(store[name] || {}).map(([id, value]) => ({ _id: id, ...value }));
            return { data: rows.filter(row => Object.keys(query).every(key => row[key] === query[key])) };
          }
        };
      },
      async add({ data }) {
        store[name] = store[name] || {};
        store[name].report_1 = data;
        return { _id: 'report_1' };
      }
    };
  };
}

async function run() {
  const store = {
    community_posts: { post_1: { authorId: 'author_1', status: 'active', dataEnv: 'dev' } },
    trip_logs: { log_1: { publisherId: 'author_2', tripId: 'trip_1', status: 'active' } },
    reports: {}
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../utils/shared') return { db: { collection: collectionFactory(store) } };
    if (request === './tripMedia') {
      return {
        async verifyUploadSession() { return { media: [] }; },
        async consumeUploadSession() {}
      };
    }
    return originalLoad(request, parent, isMain);
  };
  const handler = require('../cloudfunctions/api/handlers/report');
  Module._load = originalLoad;

  const created = await handler.reportCreate('reporter_1', {
    targetType: 'community_post', targetId: 'post_1', reason: '虚假诈骗', description: '测试'
  });
  assert.strictEqual(created.success, true);
  assert.strictEqual(store.reports.report_1.targetType, 'community_post');
  assert.strictEqual(store.reports.report_1.targetId, 'post_1');
  assert.strictEqual(store.reports.report_1.status, 'pending');

  const selfReport = await handler.reportCreate('author_2', {
    targetType: 'trip_log', targetId: 'log_1', reason: '其他'
  });
  assert.strictEqual(selfReport.success, false);
  assert.match(selfReport.error, /不能举报自己/);

  const badReason = await handler.reportCreate('reporter_2', {
    targetType: 'community_post', targetId: 'post_1', reason: '无效原因'
  });
  assert.strictEqual(badReason.success, false);
  assert.match(badReason.error, /请选择举报原因/);

  console.log('report-handler tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
