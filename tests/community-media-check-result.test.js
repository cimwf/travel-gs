#!/usr/bin/env node

const assert = require('assert');
const Module = require('module');
const path = require('path');

const state = {
  audits: {
    'trace-1': {
      traceId: 'trace-1',
      postId: 'post-1',
      suggest: 'pending'
    },
    'trace-2': {
      traceId: 'trace-2',
      postId: 'post-1',
      suggest: 'pending'
    }
  },
  posts: {
    'post-1': {
      _id: 'post-1',
      authorId: 'openid-author',
      content: '测试图片作品',
      images: [{ url: 'https://example.com/post.jpg' }],
      reviewStatus: 'reviewing',
      imageAuditTraceIds: ['trace-1', 'trace-2']
    }
  },
  notifications: {},
  tripLogAudits: {},
  tripLogs: {},
  transactionConflictsRemaining: 0
};

function collectionStore(name) {
  if (name === 'community_image_audits') return state.audits;
  if (name === 'community_posts') return state.posts;
  if (name === 'notifications') return state.notifications;
  if (name === 'trip_log_image_audits') return state.tripLogAudits;
  if (name === 'trip_logs') return state.tripLogs;
  throw new Error(`Unexpected collection: ${name}`);
}

function makeCollection(name, transactionMode) {
    const store = collectionStore(name);
    return {
      doc(id) {
        return {
          async get() {
            return { data: store[id] };
          },
          async update({ data }) {
            if (transactionMode && name === 'community_image_audits') {
              throw new Error('Audit results must be persisted outside the post transaction');
            }
            if (!store[id]) throw new Error(`Missing document: ${name}/${id}`);
            Object.assign(store[id], data);
          },
          async set({ data }) {
            store[id] = { _id: id, ...data };
          }
        };
      }
    };
}

const db = {
  collection(name) {
    return makeCollection(name, false);
  },
  async runTransaction(callback) {
    if (state.transactionConflictsRemaining > 0) {
      state.transactionConflictsRemaining -= 1;
      const error = new Error('simulated transaction conflict');
      error.code = 'DATABASE_TRANSACTION_CONFLICT';
      throw error;
    }
    const transaction = {
      collection(name) {
        return makeCollection(name, true);
      }
    };
    return callback(transaction);
  }
};

const cloudMock = {
  DYNAMIC_CURRENT_ENV: 'test',
  init() {},
  database() {
    return db;
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudMock;
  return originalLoad.call(this, request, parent, isMain);
};

const callbackPath = path.resolve(
  __dirname,
  '../cloudfunctions/community-media-check-result/index.js'
);
const callback = require(callbackPath);
Module._load = originalLoad;

async function main() {
  let result = await callback.main({
    trace_id: 'trace-1',
    result: { suggest: 'pass', label: 100 }
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.reviewStatus, 'reviewing');
  assert.strictEqual(state.posts['post-1'].reviewStatus, 'reviewing');

  result = await callback.main({
    trace_id: 'trace-2',
    result: { suggest: 'pass', label: 100 }
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.reviewStatus, 'approved');
  assert.strictEqual(result.machineSuggest, 'pass');
  assert.strictEqual(state.posts['post-1'].reviewStatus, 'approved');
  assert.strictEqual(state.posts['post-1'].machineSuggest, 'pass');
  assert.strictEqual(state.posts['post-1'].adminReviewStatus, 'not_required');
  assert(Object.values(state.notifications).some((item) =>
    item.type === 'community_review_approved' && item.receiverId === 'openid-author'));

  state.audits['trace-1'].suggest = 'pending';
  state.audits['trace-2'].suggest = 'pending';
  state.posts['post-1'].reviewStatus = 'reviewing';

  result = await callback.main({
    trace_id: 'trace-1',
    result: { suggest: 'risky', label: 20001 }
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.reviewStatus, 'manual_review');
  assert.strictEqual(result.machineSuggest, 'risky');
  assert.strictEqual(state.posts['post-1'].reviewStatus, 'manual_review');
  assert.strictEqual(state.posts['post-1'].adminReviewStatus, 'pending');
  assert(Object.values(state.notifications).some((item) =>
    item.type === 'community_review_manual' && item.receiverId === 'openid-author'));

  state.posts['post-1'].adminReviewStatus = 'approved';
  state.posts['post-1'].reviewStatus = 'approved';
  result = await callback.main({
    trace_id: 'trace-2',
    result: { suggest: 'pass', label: 100 }
  });
  assert.strictEqual(result.reviewStatus, 'approved');
  assert.strictEqual(state.posts['post-1'].adminReviewStatus, 'approved');
  assert.strictEqual(state.posts['post-1'].reviewStatus, 'approved');

  state.audits['trace-1'].suggest = 'pending';
  state.audits['trace-2'].suggest = 'pending';
  state.posts['post-1'].reviewStatus = 'reviewing';
  state.posts['post-1'].adminReviewStatus = 'not_required';

  result = await callback.main({
    trace_id: 'trace-1',
    result: { suggest: 'review', label: 20002 }
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.reviewStatus, 'reviewing');
  assert.strictEqual(result.machineSuggest, 'pending');
  assert.strictEqual(state.posts['post-1'].reviewStatus, 'reviewing');

  result = await callback.main({
    trace_id: 'trace-2',
    result: { suggest: 'pass', label: 100 }
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.reviewStatus, 'approved');
  assert.strictEqual(result.machineSuggest, 'review');
  assert.strictEqual(state.posts['post-1'].reviewStatus, 'approved');
  assert.strictEqual(state.posts['post-1'].machineSuggest, 'review');
  assert.strictEqual(state.posts['post-1'].adminReviewStatus, 'pending');
  assert(Object.values(state.notifications).some((item) =>
    item.type === 'community_review_pending' && item.receiverId === 'openid-author'));

  result = await callback.main({
    trace_id: 'trace-2',
    result: { suggest: 'invalid-value', label: 0 }
  });
  assert.strictEqual(result.success, false);

  state.audits['trace-1'].suggest = 'pending';
  state.audits['trace-1'].status = 'pending';
  state.audits['trace-2'].suggest = 'pending';
  state.audits['trace-2'].status = 'pending';
  state.posts['post-1'].reviewStatus = 'reviewing';
  state.posts['post-1'].imageAuditStatus = 'reviewing';
  state.transactionConflictsRemaining = 1;

  const concurrentResults = await Promise.all([
    callback.main({
      trace_id: 'trace-1',
      result: { suggest: 'pass', label: 100 }
    }),
    callback.main({
      trace_id: 'trace-2',
      result: { suggest: 'pass', label: 100 }
    })
  ]);
  assert.ok(concurrentResults.every((item) => item.success === true));
  assert.strictEqual(state.audits['trace-1'].status, 'completed');
  assert.strictEqual(state.audits['trace-2'].status, 'completed');
  assert.strictEqual(state.audits['trace-1'].suggest, 'pass');
  assert.strictEqual(state.audits['trace-2'].suggest, 'pass');
  assert.strictEqual(state.posts['post-1'].reviewStatus, 'approved');

  state.tripLogAudits['trip-trace-1'] = {
    traceId: 'trip-trace-1', logId: 'log-1', suggest: 'pending'
  };
  state.tripLogAudits['trip-trace-2'] = {
    traceId: 'trip-trace-2', logId: 'log-1', suggest: 'pending'
  };
  state.tripLogs['log-1'] = {
    _id: 'log-1', tripId: 'trip-1', publisherId: 'openid-author',
    images: [{ url: 'https://example.com/log.jpg' }],
    reviewStatus: 'reviewing', adminReviewStatus: 'not_required',
    imageAuditTraceIds: ['trip-trace-1', 'trip-trace-2']
  };
  const tripResults = await Promise.all([
    callback.main({ trace_id: 'trip-trace-1', result: { suggest: 'review', label: 20002 } }),
    callback.main({ trace_id: 'trip-trace-2', result: { suggest: 'pass', label: 100 } })
  ]);
  assert.ok(tripResults.every(item => item.success === true));
  assert.strictEqual(state.tripLogs['log-1'].reviewStatus, 'approved');
  assert.strictEqual(state.tripLogs['log-1'].machineSuggest, 'review');
  assert.strictEqual(state.tripLogs['log-1'].adminReviewStatus, 'pending');
  assert(Object.values(state.notifications).some(item =>
    item.type === 'trip_log_review_pending' && item.receiverId === 'openid-author'));

  console.log('PASS media check callback handles community and trip-log image results');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
