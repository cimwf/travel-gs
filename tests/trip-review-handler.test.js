#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'adminTrip.js');

const trips = [
  { _id: 'trip-new', creatorId: 'user-1', creatorName: '用户A', reviewStatus: 'approved', createdAt: 300 },
  { _id: 'trip-old', creatorId: 'user-2', creatorName: '用户B', createdAt: 200 },
  { _id: 'trip-rejected', creatorId: 'user-3', creatorName: '用户C', reviewStatus: 'rejected', createdAt: 100 }
];
const notifications = [];

function matches(row, condition) {
  if (!condition || Object.keys(condition).length === 0) return true;
  if (condition.$op === 'or') return condition.items.some(item => matches(row, item));
  return Object.keys(condition).every((key) => {
    const expected = condition[key];
    if (expected && expected.$op === 'in') return expected.values.includes(row[key]);
    if (expected && expected.$op === 'exists') return expected.value ? row[key] !== undefined : row[key] === undefined;
    return row[key] === expected;
  });
}

function makeQuery(rows, condition = {}) {
  let offset = 0;
  let limit = 100;
  return {
    orderBy() { return this; },
    skip(value) { offset = value; return this; },
    limit(value) { limit = value; return this; },
    async count() { return { total: rows.filter(row => matches(row, condition)).length }; },
    async get() { return { data: rows.filter(row => matches(row, condition)).slice(offset, offset + limit) }; },
    async remove() {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matches(rows[index], condition)) rows.splice(index, 1);
      }
    }
  };
}

const db = {
  collection(name) {
    if (name === 'admin_users') {
      return { doc: id => ({ get: async () => ({ data: id === 'admin-1' ? { _id: id, role: 'admin', nickname: '审核员' } : null }) }) };
    }
    if (name === 'trips') {
      return {
        where: condition => makeQuery(trips, condition),
        count: () => makeQuery(trips).count(),
        orderBy() { return makeQuery(trips).orderBy(); },
        doc(id) {
          return {
            get: async () => ({ data: trips.find(item => item._id === id) || null }),
            update: async (payload) => Object.assign(trips.find(item => item._id === id), payload.data)
          };
        }
      };
    }
    if (name === 'users') return { where: condition => makeQuery([], condition) };
    if (name === 'notifications') {
      return {
        where: condition => makeQuery(notifications, condition),
        add: async payload => notifications.push({ _id: `notification-${notifications.length + 1}`, ...payload.data }),
        doc: id => ({ update: async payload => Object.assign(notifications.find(item => item._id === id), payload.data) })
      };
    }
    throw new Error(`Unexpected collection: ${name}`);
  }
};

const command = {
  in(values) { return { $op: 'in', values }; },
  exists(value) { return { $op: 'exists', value }; },
  or(items) { return { $op: 'or', items }; }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db, _: command, cloud: { getTempFileURL: async () => ({ fileList: [] }) } }
};
delete require.cache[handlerPath];
const handler = require(handlerPath);

async function main() {
  const all = await handler.adminTripReviewList({ adminId: 'admin-1', reviewStatus: 'all', page: 1, pageSize: 10 });
  assert.strictEqual(all.success, true);
  assert.strictEqual(all.total, 3);

  const approved = await handler.adminTripReviewList({ adminId: 'admin-1', reviewStatus: 'approved', page: 1, pageSize: 10 });
  assert.deepStrictEqual(approved.trips.map(item => item._id), ['trip-new', 'trip-old']);
  assert.strictEqual(approved.trips[1].reviewStatus, 'approved');

  const rejected = await handler.adminTripReviewList({ adminId: 'admin-1', reviewStatus: 'rejected', page: 1, pageSize: 10 });
  assert.deepStrictEqual(rejected.trips.map(item => item._id), ['trip-rejected']);

  const update = await handler.adminTripReviewUpdate({ adminId: 'admin-1', tripId: 'trip-old', decision: 'rejected', remark: '违规联系方式' });
  assert.strictEqual(update.success, true);
  assert.strictEqual(trips.find(item => item._id === 'trip-old').reviewStatus, 'rejected');
  assert.strictEqual(notifications[0].receiverId, 'user-2');
  assert.strictEqual(notifications[0].targetType, 'trip');

  const tripSource = fs.readFileSync(path.join(apiRoot, 'handlers', 'trip.js'), 'utf8');
  const applySource = fs.readFileSync(path.join(apiRoot, 'handlers', 'apply.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(apiRoot, 'index.js'), 'utf8');
  const myTripsSource = fs.readFileSync(path.join(root, 'miniprogram', 'pages', 'my-trips', 'my-trips.wxml'), 'utf8');
  assert(tripSource.includes("reviewStatus: 'approved'"));
  assert(tripSource.includes("{ reviewStatus: _.exists(false) }"));
  assert(tripSource.includes("trip.reviewStatus === 'rejected'"));
  assert(tripSource.includes('delete updateFields.reviewStatus'));
  assert(applySource.includes("tripData.reviewStatus === 'rejected'"));
  assert(indexSource.includes("case 'admin/tripReviewList'"));
  assert(indexSource.includes("case 'admin/tripReviewUpdate'"));
  assert(myTripsSource.includes('审核不通过'));
  assert(myTripsSource.includes('item.reviewRemark'));

  console.log('PASS trip review defaults public, supports legacy data, rejection and restoration backend');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
