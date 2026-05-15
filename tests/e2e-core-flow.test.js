#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = process.env.WX_CLI_PATH || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const autoPort = Number(process.env.WX_AUTOMATOR_PORT || 9420);

const USERS = {
  creator: {
    _id: 'creator-doc',
    openid: 'creator-openid',
    nickname: '发起人',
    avatar: '',
    phone: '13800138001',
    contactPhone: '13800138001'
  },
  applicant: {
    _id: 'applicant-doc',
    openid: 'applicant-openid',
    nickname: '申请人',
    avatar: '',
    phone: '13800138002',
    contactPhone: '13800138002'
  }
};

async function main() {
  const miniProgram = await connectOrLaunch();

  try {
    await resetMockBackend(miniProgram);

    const removeTripId = await publishTrip(miniProgram, '自动化移除流程');
    await applyToTrip(miniProgram, removeTripId);
    await assertApplicantNotification(miniProgram, 'pending');
    await approveApplication(miniProgram);
    await assertApplicantNotification(miniProgram, 'accepted');
    await removeApplicant(miniProgram, removeTripId);
    await assertApplicantRemovedNotification(miniProgram);

    const quitTripId = await publishTrip(miniProgram, '自动化退出流程');
    await applyToTrip(miniProgram, quitTripId);
    await approveApplication(miniProgram);
    await quitAsApplicant(miniProgram, quitTripId);
    await assertCreatorQuitNotification(miniProgram);

    console.log('\nCore trip flow passed');
  } finally {
    await miniProgram.close();
  }
}

async function connectOrLaunch() {
  try {
    return await automator.connect({
      wsEndpoint: `ws://127.0.0.1:${autoPort}`
    });
  } catch (connectErr) {
    return await automator.launch({
      cliPath,
      projectPath: root,
      port: autoPort,
      args: ['--disable-gpu'],
      timeout: 60000,
      trustProject: true
    });
  }
}

async function resetMockBackend(miniProgram) {
  await installCoreMock(miniProgram, true);
  await miniProgram.callWxMethod('removeStorageSync', 'userInfo');
  await miniProgram.callWxMethod('removeStorageSync', 'openid');
  await miniProgram.callWxMethod('removeStorageSync', 'userId');
  await miniProgram.callWxMethod('removeStorageSync', 'lastLoginTime');
}

async function setCurrentUser(miniProgram, userKey) {
  const user = USERS[userKey];
  await miniProgram.callWxMethod('setStorageSync', 'userInfo', user);
  await miniProgram.callWxMethod('setStorageSync', 'openid', user.openid);
  await miniProgram.callWxMethod('setStorageSync', 'userId', user._id);
  await miniProgram.callWxMethod('setStorageSync', 'lastLoginTime', Date.now());
  await miniProgram.evaluate((u) => {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.userInfo = u;
      app.globalData.openid = u.openid;
      app.globalData.userId = u._id;
      app.globalData.isLoggedIn = true;
    }
  }, user);
}

async function installCoreMock(miniProgram, reset = false) {
  await miniProgram.evaluate((shouldReset, users) => {
    const initialDb = () => ({
      nextTripId: 1,
      nextApplyId: 1,
      users,
      trips: {},
      applies: [],
      events: []
    });

    if (shouldReset || !globalThis.__CORE_FLOW_DB__) {
      globalThis.__CORE_FLOW_DB__ = initialDb();
    }

    const db = globalThis.__CORE_FLOW_DB__;

    const nowText = () => Date.now();
    const currentOpenid = () => {
      const app = getApp();
      return wx.getStorageSync('openid') || (app && app.globalData && app.globalData.openid) || '';
    };
    const currentUser = () => {
      const openid = currentOpenid();
      return Object.values(db.users).find((u) => u.openid === openid) || db.users.creator;
    };
    const userByOpenid = (openid) => Object.values(db.users).find((u) => u.openid === openid) || {};
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    };
    const applyTime = (ts) => {
      const date = new Date(ts);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hour = String(date.getHours()).padStart(2, '0');
      const minute = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hour}:${minute}`;
    };
    const baseTrip = (trip) => ({
      ...trip,
      placeCoverImage: 'https://example.com/place.jpg',
      placeHighlight: '自动化测试地点'
    });
    const buildNotifications = (openid) => {
      const result = [];
      db.applies.forEach((apply) => {
        const trip = db.trips[apply.tripId] || {};
        if (apply.fromUserId === openid) {
          result.push({
            _id: apply._id,
            type: 'sent',
            tripId: apply.tripId,
            placeName: trip.placeName || apply.placeName,
            placeId: trip.placeId || apply.placeId,
            tripTitle: trip.tripTitle || '',
            creatorName: trip.creatorName || '发起人',
            tripDate: trip.date ? formatDate(trip.date) : '待定',
            status: apply.status,
            statusText: apply.status === 'pending' ? '申请中' : (apply.status === 'accepted' ? '已同意' : '已拒绝'),
            message: apply.message || '',
            applyTime: applyTime(apply.createdAt),
            creatorWechat: apply.status === 'accepted' ? trip.contactPhone : '',
            createdAt: apply.createdAt
          });
        }

        if (apply.toUserId === openid) {
          result.push({
            _id: apply._id,
            type: 'received',
            fromUserId: apply.fromUserId,
            profileUserId: apply.fromUserId,
            userName: apply.fromUserName,
            fromUserAvatar: '',
            headerTitle: `${apply.fromUserName} 申请加入您的行程`,
            headerMeta: apply.placeName,
            timeAgo: '刚刚',
            contactType: 'phone',
            contactValue: apply.contactValue,
            introduction: apply.message || '',
            isHandled: apply.status !== 'pending',
            status: apply.status === 'accepted' ? 'agreed' : apply.status,
            statusText: apply.status === 'accepted' ? '已同意' : (apply.status === 'rejected' ? '已拒绝' : ''),
            tripId: apply.tripId,
            placeName: trip.placeName || apply.placeName,
            placeId: trip.placeId || apply.placeId,
            tripTitle: trip.tripTitle || '',
            tripDate: trip.date ? formatDate(trip.date) : '待定',
            createdAt: apply.createdAt
          });
        }
      });

      db.events.forEach((event) => {
        if (event.toUserId !== openid) return;
        const trip = db.trips[event.tripId] || event.trip || {};
        if (event.status === 'removed') {
          result.push({
            _id: event._id,
            type: 'received',
            fromUserId: event.fromUserId,
            profileUserId: event.fromUserId,
            userName: event.fromUserName || '发起人',
            headerTitle: '您已被移出行程',
            headerMeta: trip.placeName || event.placeName,
            timeAgo: '刚刚',
            isHandled: true,
            status: 'removed',
            statusText: '已移除',
            tripId: event.tripId,
            placeName: trip.placeName || event.placeName,
            placeId: trip.placeId || event.placeId,
            tripTitle: trip.tripTitle || '',
            tripDate: trip.date ? formatDate(trip.date) : '待定',
            createdAt: event.createdAt
          });
        }
        if (event.status === 'quit') {
          result.push({
            _id: event._id,
            type: 'received',
            fromUserId: event.fromUserId,
            profileUserId: event.fromUserId,
            userName: event.fromUserName || '申请人',
            headerTitle: `${event.fromUserName || '申请人'} 退出了您的行程`,
            headerMeta: trip.placeName || event.placeName,
            timeAgo: '刚刚',
            isHandled: true,
            status: 'quit',
            statusText: '已退出',
            tripId: event.tripId,
            placeName: trip.placeName || event.placeName,
            placeId: trip.placeId || event.placeId,
            tripTitle: trip.tripTitle || '',
            tripDate: trip.date ? formatDate(trip.date) : '待定',
            createdAt: event.createdAt
          });
        }
      });

      return result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    };

    if (!wx.cloud) {
      wx.cloud = {};
    }

    wx.cloud.callFunction = function callFunction(options) {
      const name = options && options.name;
      const payload = (options && options.data) || {};
      const action = payload.action;
      const data = payload.data || {};
      let result = { success: true };

      if (name === 'login') {
        result = { openid: currentOpenid() };
      } else if (name === 'api' && action === 'trip/create') {
        const user = currentUser();
        const id = `core-trip-${db.nextTripId++}`;
        const currentCount = data.currentCount || 1;
        const needCount = data.needCount || 3;
        db.trips[id] = {
          _id: id,
          tripTitle: data.tripTitle || '',
          placeId: data.placeId || 'core-place',
          placeName: data.placeName || '东灵山',
          departure: data.departure || '海淀区',
          date: data.date || '2026-05-07',
          hasCar: data.hasCar !== false,
          currentCount,
          needCount,
          totalParticipants: currentCount + needCount,
          contactPhone: data.contactPhone || user.contactPhone || user.phone,
          meetingPlace: data.meetingPlace || '',
          meetingTime: data.meetingTime || '',
          carSeats: data.carSeats || '',
          carModel: data.carModel || '',
          travelDesc: data.travelDesc || '',
          price: data.price || '',
          remark: data.remark || '',
          creatorId: user.openid,
          creatorName: user.nickname,
          creatorAvatar: user.avatar,
          participants: [{
            userId: user.openid,
            nickname: user.nickname,
            avatar: user.avatar
          }],
          status: 'open',
          createdAt: nowText()
        };
        result = { success: true, trip: clone(db.trips[id]), tripImage: 'https://example.com/trip.jpg' };
      } else if (name === 'api' && action === 'trip/get') {
        result = { success: true, trip: baseTrip(clone(db.trips[data.tripId])) };
      } else if (name === 'api' && action === 'trip/list') {
        result = { success: true, trips: Object.values(db.trips).map((trip) => clone(trip)) };
      } else if (name === 'api' && action === 'apply/create') {
        const user = currentUser();
        const id = `core-apply-${db.nextApplyId++}`;
        const trip = db.trips[data.tripId];
        db.applies.push({
          _id: id,
          tripId: data.tripId,
          placeId: trip.placeId,
          placeName: trip.placeName,
          fromUserId: user.openid,
          fromUserName: user.nickname,
          toUserId: data.toUserId,
          toUserName: data.toUserName,
          contactValue: data.contactValue,
          message: data.message || '',
          status: 'pending',
          createdAt: nowText()
        });
        result = { success: true };
      } else if (name === 'api' && action === 'apply/notifications') {
        result = { success: true, notifications: buildNotifications(currentOpenid()) };
      } else if (name === 'api' && action === 'apply/handle') {
        const apply = db.applies.find((item) => item._id === data.applyId);
        if (!apply) {
          result = { success: false, error: '申请不存在' };
        } else {
          apply.status = data.accept ? 'accepted' : 'rejected';
          if (data.accept) {
            const trip = db.trips[apply.tripId];
            const applicant = userByOpenid(apply.fromUserId);
            if (!trip.participants.some((p) => p.userId === apply.fromUserId)) {
              trip.participants.push({
                userId: apply.fromUserId,
                nickname: applicant.nickname || apply.fromUserName,
                avatar: applicant.avatar || '',
                contactPhone: apply.contactValue
              });
              trip.currentCount += 1;
              trip.needCount = Math.max(0, trip.needCount - 1);
            }
          }
          result = { success: true };
        }
      } else if (name === 'api' && action === 'trip/removeMember') {
        const trip = db.trips[data.tripId];
        const removed = trip.participants.find((p) => p.userId === data.memberId);
        trip.participants = trip.participants.filter((p) => p.userId !== data.memberId);
        trip.currentCount = Math.max(1, trip.currentCount - 1);
        trip.needCount += 1;
        db.events.push({
          _id: `core-event-${db.events.length + 1}`,
          status: 'removed',
          tripId: trip._id,
          placeId: trip.placeId,
          placeName: trip.placeName,
          fromUserId: trip.creatorId,
          fromUserName: trip.creatorName,
          toUserId: data.memberId,
          toUserName: removed && removed.nickname,
          trip: clone(trip),
          createdAt: nowText()
        });
        result = { success: true };
      } else if (name === 'api' && action === 'trip/quit') {
        const trip = db.trips[data.tripId];
        const user = currentUser();
        trip.participants = trip.participants.filter((p) => p.userId !== user.openid);
        trip.currentCount = Math.max(1, trip.currentCount - 1);
        trip.needCount += 1;
        db.events.push({
          _id: `core-event-${db.events.length + 1}`,
          status: 'quit',
          tripId: trip._id,
          placeId: trip.placeId,
          placeName: trip.placeName,
          fromUserId: user.openid,
          fromUserName: user.nickname,
          toUserId: trip.creatorId,
          trip: clone(trip),
          createdAt: nowText()
        });
        result = { success: true };
      } else if (name === 'api' && action === 'attractions/list') {
        result = {
          success: true,
          attractions: [{
            _id: 'core-place',
            name: '东灵山',
            coverImage: 'https://example.com/place.jpg'
          }]
        };
      } else if (name === 'api' && action === 'attractions/get') {
        result = {
          success: true,
          place: {
            _id: 'core-place',
            name: '东灵山',
            location: '北京市门头沟区',
            coverImage: 'https://example.com/place.jpg'
          }
        };
      } else if (name === 'api' && action === 'apply/markRead') {
        result = { success: true };
      } else if (name === 'api' && action === 'trip/view') {
        result = { success: true };
      }

      const response = { result };
      if (options && typeof options.success === 'function') {
        setTimeout(() => options.success(response), 0);
      }
      return Promise.resolve(response);
    };

    wx.cloud.getTempFileURL = function getTempFileURL() {
      return Promise.resolve({ fileList: [] });
    };
  }, reset, USERS);
}

async function publishTrip(miniProgram, title) {
  console.log(`RUN publish: ${title}`);
  await setCurrentUser(miniProgram, 'creator');
  await installCoreMock(miniProgram);

  const page = await miniProgram.reLaunch('/pages/trip-publish/trip-publish');
  await page.waitFor(1000);
  await page.setData({
    tripTitle: title,
    placeId: 'core-place',
    placeName: '东灵山',
    departure: '海淀区',
    date: '2026-05-07',
    hasCar: true,
    recruitCount: 3,
    contactPhone: USERS.creator.contactPhone,
    meetingPlace: '海淀黄庄',
    meetingTime: '08:00',
    carSeats: '5',
    carModel: 'SUV',
    price: '120',
    remark: '自动化核心流程测试'
  });

  const submit = await assertExists(page, '.submit-btn', 'publish submit');
  await submit.tap();
  await page.waitFor(1500);
  assert.strictEqual(await currentPath(miniProgram), 'pages/trip-publish-success/trip-publish-success');

  const db = await getMockDb(miniProgram);
  const trips = Object.values(db.trips);
  const trip = trips[trips.length - 1];
  assert(trip && trip._id, 'published trip should exist in mock backend');
  return trip._id;
}

async function applyToTrip(miniProgram, tripId) {
  console.log(`RUN apply: ${tripId}`);
  await setCurrentUser(miniProgram, 'applicant');
  await installCoreMock(miniProgram);

  const page = await miniProgram.reLaunch(`/pages/trip-detail/trip-detail?id=${tripId}`);
  await page.waitFor(1500);
  assert.strictEqual(page.path, 'pages/trip-detail/trip-detail');

  const join = await assertExists(page, '.footer-btn-full', 'join button');
  await join.tap();
  await page.waitFor(600);
  assert.strictEqual(await page.data('showApplyModal'), true, 'apply modal should be visible after tapping join');

  const applyModal = await assertExists(page, 'apply-modal', 'apply modal component');
  const phoneInput = await assertChildExists(applyModal, '.form-input', 'apply phone input');
  await phoneInput.input(USERS.applicant.contactPhone);
  const textareas = await applyModal.$$('.form-textarea');
  if (textareas[0]) {
    await textareas[0].input('我想参加这个行程');
  }
  const submitApply = await assertChildExists(applyModal, '.modal-btn-confirm', 'submit apply button');
  await submitApply.tap();
  await page.waitFor(1000);

  const db = await getMockDb(miniProgram);
  const apply = db.applies.find((item) => item.tripId === tripId && item.fromUserId === USERS.applicant.openid);
  assert(apply, 'application should be created');
  assert.strictEqual(apply.status, 'pending');
}

async function assertApplicantNotification(miniProgram, expectedStatus) {
  console.log(`RUN applicant notification: ${expectedStatus}`);
  await setCurrentUser(miniProgram, 'applicant');
  await installCoreMock(miniProgram);
  const page = await miniProgram.reLaunch('/pages/trip-notifications/trip-notifications');
  await page.waitFor(1500);
  const notifications = await page.data('notifications');
  assert(notifications.some((item) => item.type === 'sent' && item.status === expectedStatus), `applicant should see ${expectedStatus} notification`);
}

async function approveApplication(miniProgram) {
  console.log('RUN approve application');
  await setCurrentUser(miniProgram, 'creator');
  await installCoreMock(miniProgram);
  const page = await miniProgram.reLaunch('/pages/trip-notifications/trip-notifications');
  await page.waitFor(1500);

  const notifications = await page.data('notifications');
  const pending = notifications.find((item) => item.type === 'received' && !item.isHandled);
  assert(pending, 'creator should see pending received notification');

  const agree = await assertExists(page, '.action-btn.agree', 'agree button');
  await agree.tap();
  await page.waitFor(1000);

  const db = await getMockDb(miniProgram);
  const apply = db.applies.find((item) => item._id === pending._id);
  assert.strictEqual(apply.status, 'accepted');
  const trip = db.trips[apply.tripId];
  const participant = trip.participants.find((p) => p.userId === USERS.applicant.openid);
  assert(participant, 'applicant should join participants after approval');
  assert.strictEqual(participant.contactPhone, USERS.applicant.contactPhone, 'approved participant should keep application contact phone');
}

async function removeApplicant(miniProgram, tripId) {
  console.log('RUN remove applicant');
  await setCurrentUser(miniProgram, 'creator');
  await installCoreMock(miniProgram);
  const page = await miniProgram.reLaunch(`/pages/trip-detail/trip-detail?id=${tripId}`);
  await page.waitFor(1500);

  const members = await page.$$('.member-item');
  const applicantMember = await findElementByText(members, USERS.applicant.nickname);
  assert(applicantMember, 'applicant member item should be visible before removal');
  await applicantMember.tap();
  await page.waitFor(600);

  const remove = await assertExists(page, '.modal-btn-danger', 'remove member button');
  await remove.tap();
  await page.waitFor(500);

  const confirm = await assertExists(page, '.confirm-btn-danger', 'confirm remove button');
  await confirm.tap();
  await page.waitFor(1200);

  const db = await getMockDb(miniProgram);
  const trip = db.trips[tripId];
  assert(!trip.participants.some((p) => p.userId === USERS.applicant.openid), 'applicant should be removed from participants');
  assert(db.events.some((event) => event.status === 'removed' && event.toUserId === USERS.applicant.openid), 'removed notification event should be created');
}

async function assertApplicantRemovedNotification(miniProgram) {
  console.log('RUN applicant removed notification');
  await setCurrentUser(miniProgram, 'applicant');
  await installCoreMock(miniProgram);
  const page = await miniProgram.reLaunch('/pages/trip-notifications/trip-notifications');
  await page.waitFor(1500);
  const notifications = await page.data('notifications');
  assert(notifications.some((item) => item.type === 'received' && item.status === 'removed'), 'applicant should see removed notification');
}

async function quitAsApplicant(miniProgram, tripId) {
  console.log('RUN applicant quit');
  await setCurrentUser(miniProgram, 'applicant');
  await installCoreMock(miniProgram);
  const page = await miniProgram.reLaunch(`/pages/trip-detail/trip-detail?id=${tripId}`);
  await page.waitFor(1500);

  const quit = await assertExists(page, '.footer-btn-danger', 'quit button');
  await quit.tap();
  await page.waitFor(500);
  await miniProgram.native().confirmModal();
  await page.waitFor(1500);

  const db = await getMockDb(miniProgram);
  const trip = db.trips[tripId];
  assert(!trip.participants.some((p) => p.userId === USERS.applicant.openid), 'applicant should quit participants');
  assert(db.events.some((event) => event.status === 'quit' && event.toUserId === USERS.creator.openid), 'quit notification event should be created');
}

async function assertCreatorQuitNotification(miniProgram) {
  console.log('RUN creator quit notification');
  await setCurrentUser(miniProgram, 'creator');
  await installCoreMock(miniProgram);
  const page = await miniProgram.reLaunch('/pages/trip-notifications/trip-notifications');
  await page.waitFor(1500);
  const notifications = await page.data('notifications');
  assert(notifications.some((item) => item.type === 'received' && item.status === 'quit'), 'creator should see quit notification');
}

async function getMockDb(miniProgram) {
  return miniProgram.evaluate(() => JSON.parse(JSON.stringify(globalThis.__CORE_FLOW_DB__)));
}

async function currentPath(miniProgram) {
  const page = await miniProgram.currentPage();
  return page.path;
}

async function assertExists(page, selector, label) {
  const timeout = Date.now() + 5000;
  let element = null;
  while (Date.now() < timeout) {
    element = await page.$(selector);
    if (element) return element;
    await page.waitFor(200);
  }

  let data = {};
  try {
    data = await page.data();
  } catch (err) {}
  throw new Error(`${label || selector} not found on ${page.path}. data=${JSON.stringify(data).slice(0, 1200)}`);
}

async function assertChildExists(parent, selector, label) {
  const timeout = Date.now() + 5000;
  let element = null;
  while (Date.now() < timeout) {
    element = await parent.$(selector);
    if (element) return element;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${label || selector} not found inside component`);
}

async function findElementByText(elements, expectedText) {
  for (const element of elements) {
    const text = await element.text();
    if (text && text.includes(expectedText)) {
      return element;
    }
  }
  return null;
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
