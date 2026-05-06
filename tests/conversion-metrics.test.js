#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');

let app;
let currentPage;
let storage;
let cloudCalls;

function resetRuntime() {
  storage = {};
  cloudCalls = [];
  app = {
    globalData: {
      openid: '',
      attractions: [],
      attractionsLoaded: true
    },
    getAttractions: async () => [],
    getOpenid: async () => {
      app.globalData.openid = 'metric-openid';
      storage.openid = 'metric-openid';
      return 'metric-openid';
    }
  };

  global.getApp = () => app;
  global.Page = (definition) => {
    currentPage = definition;
    currentPage.setData = function setData(patch) {
      this.data = { ...this.data, ...patch };
    };
  };
  global.wx = {
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    removeStorageSync: (key) => { delete storage[key]; },
    cloud: {
      callFunction: async ({ name, data }) => {
        cloudCalls.push({ name, data });
        return {
          result: {
            success: true,
            trips: []
          }
        };
      }
    }
  };
}

function clearLocalRequireCache() {
  Object.keys(require.cache).forEach((file) => {
    if (file.startsWith(root)) delete require.cache[file];
  });
}

function loadTripListPage() {
  resetRuntime();
  clearLocalRequireCache();
  currentPage = null;
  require(path.join(miniRoot, 'pages/trip-list/trip-list.js'));
  assert(currentPage, 'trip-list page should register');
  return currentPage;
}

async function run() {
  const page = loadTripListPage();
  await page.loadTrips(true);

  const tripListCall = cloudCalls.find((call) => call.name === 'api' && call.data.action === 'trip/list');
  assert(tripListCall, 'trip/list should be called');
  assert.strictEqual(tripListCall.data.data.openid, 'metric-openid');

  console.log('PASS trip-list request carries openid for conversion metrics');
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

