#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'trip.js');

const state = { trip: null, applies: [], notifications: {} };

function resetTrip() {
  state.trip = {
    _id: 'trip-1', creatorId: 'openid-creator', creatorName: '发起人', creatorAvatar: 'creator.jpg',
    tripTitle: '周末徒步', placeName: '京西古道', placeId: 'place-1', status: 'open',
    tripStage: 'not_started', date: '2026-08-20', meetingTime: '08:00',
    departure: '海淀区', meetingPlace: '地铁站A口', currentCount: 2, needCount: 2,
    participants: [
      { userId: 'openid-creator', nickname: '发起人' },
      { userId: 'openid-member', nickname: '成员', avatar: 'member.jpg' }
    ]
  };
  state.applies = [];
  state.notifications = {};
}

function tripDoc() {
  return {
    async get() { return { data: state.trip ? { ...state.trip, participants: state.trip.participants.slice() } : null }; },
    async update({ data }) {
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (value && value.$inc !== undefined) state.trip[key] = (state.trip[key] || 0) + value.$inc;
        else state.trip[key] = value;
      });
    },
    async remove() { state.trip = null; }
  };
}

const db = {
  collection(name) {
    if (name === 'trips') return { doc: tripDoc };
    if (name === 'applies') {
      return {
        async add({ data }) {
          const _id = 'apply-' + (state.applies.length + 1);
          state.applies.push({ _id, ...data });
          return { _id };
        }
      };
    }
    if (name === 'notifications') {
      return {
        doc(id) {
          return { async set({ data }) { state.notifications[id] = { _id: id, ...data }; } };
        }
      };
    }
    throw new Error('Unexpected collection: ' + name);
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: {
    db,
    _: { inc(value) { return { $inc: value }; } },
    cloud: {},
    crypto: {},
    safeAvatar: value => value || ''
  }
};

delete require.cache[handlerPath];
const trip = require(handlerPath);

async function main() {
  assert.deepStrictEqual(trip.normalizeDestinationLocation({
    name: undefined,
    address: '  北京市门头沟区潭柘寺  ',
    latitude: '39.9023',
    longitude: '116.0254'
  }), {
    name: '',
    address: '北京市门头沟区潭柘寺',
    latitude: 39.9023,
    longitude: 116.0254
  });
  assert.throws(() => trip.normalizeDestinationLocation({
    name: '无效定位', address: '', latitude: undefined, longitude: 116
  }), /定位坐标无效/);

  resetTrip();
  const locationUpdated = await trip.tripUpdate('openid-creator', {
    tripId: 'trip-1',
    destLocation: {
      name: '潭柘寺', address: '北京市门头沟区潭柘寺镇', latitude: '39.9023', longitude: '116.0254'
    }
  });
  assert.strictEqual(locationUpdated.success, true);
  assert.deepStrictEqual(state.trip.destLocation, {
    name: '潭柘寺', address: '北京市门头沟区潭柘寺镇', latitude: 39.9023, longitude: 116.0254
  });

  resetTrip();
  const updated = await trip.tripUpdate('openid-creator', {
    tripId: 'trip-1', date: '2026-08-21', meetingPlace: '地铁站B口'
  });
  assert.strictEqual(updated.success, true);
  assert(Object.values(state.notifications).some(item => item.type === 'trip_time_changed'));
  assert(Object.values(state.notifications).some(item => item.type === 'trip_location_changed'));
  assert(Object.values(state.notifications).every(item => item.receiverId === 'openid-member'));

  resetTrip();
  const removed = await trip.tripRemoveMember('openid-creator', {
    tripId: 'trip-1', memberId: 'openid-member'
  });
  assert.strictEqual(removed.success, true);
  assert(Object.values(state.notifications).some(item => item.type === 'trip_member_removed'));

  resetTrip();
  const quit = await trip.tripQuit('openid-member', { tripId: 'trip-1' });
  assert.strictEqual(quit.success, true);
  assert(Object.values(state.notifications).some(item =>
    item.type === 'trip_member_quit' && item.receiverId === 'openid-creator'));

  resetTrip();
  const cancelled = await trip.tripUpdateStatus('openid-creator', {
    tripId: 'trip-1', status: 'cancelled'
  });
  assert.strictEqual(cancelled.success, true);
  assert(Object.values(state.notifications).some(item =>
    item.type === 'trip_cancelled' && item.receiverId === 'openid-member'));

  resetTrip();
  const deleted = await trip.tripDelete('openid-creator', { tripId: 'trip-1' });
  assert.strictEqual(deleted.success, true);
  const deletedNotification = Object.values(state.notifications)
    .find(item => item.type === 'trip_deleted');
  assert(deletedNotification);
  assert.strictEqual(deletedNotification.targetId, '');

  console.log('PASS trip member, status and important update events create notifications');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
