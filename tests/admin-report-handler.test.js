const assert = require('assert');
const Module = require('module');

function makeDb(store) {
  const filter = (rows, query) => rows.filter(row => Object.keys(query).every(key => {
    const expected = query[key];
    if (expected && expected.__in) return expected.__in.includes(row[key]);
    return row[key] === expected;
  }));
  return {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const value = store[name] && store[name][id];
              if (!value) throw new Error('not found');
              return { data: { _id: id, ...value } };
            },
            async update({ data }) { Object.assign(store[name][id], data); }
          };
        },
        where(query) {
          const rows = () => filter(Object.entries(store[name] || {}).map(([id, value]) => ({ _id: id, ...value })), query);
          const chain = {
            count: async () => ({ total: rows().length }),
            orderBy() { return chain; }, skip() { return chain; }, limit() { return chain; },
            get: async () => ({ data: rows() })
          };
          return chain;
        }
      };
    }
  };
}

async function run() {
  const store = {
    admin_users: { admin_1: { role: 'admin', nickname: '管理员' } },
    reports: { report_1: { reporterId: 'user_1', targetAuthorId: 'author_1', targetType: 'community_post', targetId: 'post_1', reason: '其他', status: 'pending', createdAt: 1 } },
    community_posts: { post_1: { authorId: 'author_1', content: '作品', status: 'active' } },
    trip_logs: {},
    users: { user_1: { openid: 'user_1', nickname: '举报人' }, author_1: { openid: 'author_1', nickname: '作者' } },
    notifications: {}
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../utils/shared') return {
      db: makeDb(store),
      _: { in: values => ({ __in: values }) },
      cloud: { getTempFileURL: async () => ({ fileList: [] }) }
    };
    return originalLoad(request, parent, isMain);
  };
  const handler = require('../cloudfunctions/api/handlers/adminReport');
  Module._load = originalLoad;

  const list = await handler.adminReportList({ adminId: 'admin_1', status: 'pending', targetType: 'all' });
  assert.strictEqual(list.success, true);
  assert.strictEqual(list.reports.length, 1);
  assert.strictEqual(list.reports[0].target.content, '作品');
  assert.strictEqual(list.reports[0].reporterName, '举报人');

  const updated = await handler.adminReportUpdate({ adminId: 'admin_1', reportId: 'report_1', status: 'processed' });
  assert.strictEqual(updated.success, true);
  assert.strictEqual(store.reports.report_1.status, 'processed');
  assert.deepStrictEqual(store.notifications, {}, 'report processing must not create notifications');
  assert.strictEqual(store.community_posts.post_1.status, 'active', 'report processing must not change content status');
  console.log('admin-report-handler tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
