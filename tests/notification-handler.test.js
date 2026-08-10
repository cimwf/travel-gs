#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'notification.js');

const rows = [
  { _id: 'notify-4', receiverId: 'me', status: 'active', category: 'system', isRead: false, createdAt: 400 },
  { _id: 'notify-3', receiverId: 'me', status: 'active', category: 'interaction', isRead: false, createdAt: 300 },
  { _id: 'notify-2', receiverId: 'me', status: 'active', category: 'trip', isRead: true, createdAt: 200 },
  { _id: 'notify-1', receiverId: 'other', status: 'active', category: 'interaction', isRead: false, createdAt: 500 },
  { _id: 'notify-deleted', receiverId: 'me', status: 'deleted', category: 'interaction', isRead: false, createdAt: 600 }
];

function compare(value, expected) {
  if (expected && Object.prototype.hasOwnProperty.call(expected, '$lt')) return value < expected.$lt;
  if (expected && Object.prototype.hasOwnProperty.call(expected, '$eq')) return value === expected.$eq;
  return value === expected;
}

function matches(row, condition) {
  if (!condition) return true;
  if (condition.$and) return condition.$and.every(item => matches(row, item));
  if (condition.$or) return condition.$or.some(item => matches(row, item));
  return Object.keys(condition).every(key => compare(row[key], condition[key]));
}

function makeQuery(initialCondition) {
  let condition = initialCondition || {};
  let limit = 100;
  const orders = [];
  return {
    where(nextCondition) {
      condition = nextCondition;
      return this;
    },
    orderBy(field, direction) {
      orders.push([field, direction]);
      return this;
    },
    limit(value) {
      limit = value;
      return this;
    },
    async get() {
      const data = rows.filter(row => matches(row, condition)).slice();
      data.sort((left, right) => {
        for (const order of orders) {
          const direction = order[1] === 'desc' ? -1 : 1;
          if (left[order[0]] < right[order[0]]) return -1 * direction;
          if (left[order[0]] > right[order[0]]) return 1 * direction;
        }
        return 0;
      });
      return { data: data.slice(0, limit) };
    },
    async count() {
      return { total: rows.filter(row => matches(row, condition)).length };
    },
    async update(payload) {
      rows.filter(row => matches(row, condition)).forEach(row => Object.assign(row, payload.data));
      return { stats: { updated: rows.filter(row => matches(row, condition)).length } };
    }
  };
}

const db = {
  collection(name) {
    if (name !== 'notifications') throw new Error('Unexpected collection: ' + name);
    return {
      where(condition) {
        return makeQuery(condition);
      },
      doc(id) {
        return {
          async get() {
            return { data: rows.find(row => row._id === id) || null };
          },
          async update(payload) {
            const row = rows.find(item => item._id === id);
            if (row) Object.assign(row, payload.data);
            return { stats: { updated: row ? 1 : 0 } };
          }
        };
      }
    };
  }
};

const command = {
  lt(value) { return { $lt: value }; },
  eq(value) { return { $eq: value }; },
  and(items) { return { $and: items }; },
  or(items) { return { $or: items }; }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db, _: command }
};

delete require.cache[handlerPath];
const notification = require(handlerPath);

async function main() {
  const firstPage = await notification.notificationList('me', { pageSize: 2 });
  assert.strictEqual(firstPage.success, true);
  assert.deepStrictEqual(firstPage.notifications.map(item => item._id), ['notify-4', 'notify-3']);
  assert.strictEqual(firstPage.hasMore, true);
  assert.deepStrictEqual(firstPage.unreadCounts, { all: 2, trip: 0, interaction: 1 });

  const secondPage = await notification.notificationList('me', {
    pageSize: 2,
    cursor: firstPage.nextCursor,
    cursorId: firstPage.nextCursorId
  });
  assert.deepStrictEqual(secondPage.notifications.map(item => item._id), ['notify-2']);
  assert.strictEqual(secondPage.hasMore, false);

  const interactions = await notification.notificationList('me', {
    category: 'interaction',
    pageSize: 20
  });
  assert.deepStrictEqual(interactions.notifications.map(item => item._id), ['notify-3']);

  const marked = await notification.notificationMarkRead('me', { notificationId: 'notify-3' });
  assert.strictEqual(marked.success, true);
  assert.strictEqual(rows.find(item => item._id === 'notify-3').isRead, true);

  const forbidden = await notification.notificationMarkRead('me', { notificationId: 'notify-1' });
  assert.strictEqual(forbidden.success, false);

  const beforeAllRead = await notification.notificationUnreadCount('me');
  assert.strictEqual(beforeAllRead.count, 1);
  const allRead = await notification.notificationMarkAllRead('me', {});
  assert.strictEqual(allRead.success, true);
  const afterAllRead = await notification.notificationUnreadCount('me');
  assert.strictEqual(afterAllRead.count, 0);

  console.log('PASS notification infrastructure supports paging, ownership and read state');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
