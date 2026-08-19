#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  resolveDataEnvironment,
  createReadCondition
} = require('../cloudfunctions/api/utils/dataEnvironment');

const root = path.resolve(__dirname, '..');
const miniEnvPath = path.join(root, 'miniprogram/utils/env.js');

assert.deepStrictEqual(resolveDataEnvironment({ runtimeEnv: 'develop' }), {
  runtimeEnv: 'develop',
  writeEnv: 'dev',
  readEnvs: ['dev']
});
assert.deepStrictEqual(resolveDataEnvironment({ runtimeEnv: 'trial' }), {
  runtimeEnv: 'trial',
  writeEnv: 'test',
  readEnvs: ['test']
});
assert.deepStrictEqual(resolveDataEnvironment({ runtimeEnv: 'release' }), {
  runtimeEnv: 'release',
  writeEnv: 'prod',
  readEnvs: ['prod']
});
assert.deepStrictEqual(resolveDataEnvironment({
  runtimeEnv: 'trial',
  dataEnvironment: { writeEnv: 'test', readEnvs: ['test', 'prod', 'prod'] }
}), {
  runtimeEnv: 'trial',
  writeEnv: 'test',
  readEnvs: ['test', 'prod']
});

const command = {
  exists(value) { return { operator: 'exists', value }; },
  or(conditions) { return { operator: 'or', conditions }; }
};
const devCondition = createReadCondition(command, ['dev']);
assert.strictEqual(devCondition.operator, 'or');
assert.deepStrictEqual(devCondition.conditions[1], { dataEnv: { operator: 'exists', value: false } });
assert.deepStrictEqual(createReadCondition(command, ['prod']), {
  dataEnv: 'prod'
});

global.wx = {
  getAccountInfoSync() {
    return { miniProgram: { envVersion: 'release' } };
  }
};
delete require.cache[require.resolve(miniEnvPath)];
const releaseEnv = require(miniEnvPath);
assert.strictEqual(releaseEnv.cloudEnv, 'cloud1-d2gel5jl093988c07');
assert.strictEqual(releaseEnv.runtimeEnv, 'release');
assert.deepStrictEqual(releaseEnv.dataEnvironment, {
  writeEnv: 'prod',
  readEnvs: ['prod']
});
delete global.wx;

const tripHandler = fs.readFileSync(path.join(root, 'cloudfunctions/api/handlers/trip.js'), 'utf8');
const apiRouter = fs.readFileSync(path.join(root, 'cloudfunctions/api/index.js'), 'utf8');
const communityHandler = fs.readFileSync(path.join(root, 'cloudfunctions/api/handlers/community.js'), 'utf8');
const apiClient = fs.readFileSync(path.join(root, 'miniprogram/utils/api.js'), 'utf8');
const tripListPage = fs.readFileSync(path.join(root, 'miniprogram/pages/trip-list/trip-list.js'), 'utf8');
const communityPage = fs.readFileSync(path.join(root, 'miniprogram/pages/community/community.js'), 'utf8');
assert(tripHandler.includes('dataEnv: dataEnvironment.writeEnv'));
assert(communityHandler.match(/dataEnv: dataEnvironment\.writeEnv/g).length >= 2);
assert(apiClient.includes('dataEnvironment: env.dataEnvironment'));
assert(tripHandler.includes(".orderBy('_id', 'desc')"));
assert(tripHandler.includes('.limit(pageSize + 1)'));
assert(tripHandler.includes("_id: _.lt(cursorId)"));
assert(tripHandler.includes("excludeStatus === 'cancelled'"));
assert(tripHandler.includes("conditions.tripStage = _.neq('cancelled')"));
assert(tripHandler.includes('async function tripListByUser(openid, data, dataEnvironment = RUNTIME_DEFAULTS.develop)'));
assert(tripHandler.includes('profileCondition,\n    createReadCondition(_, dataEnvironment.readEnvs)'));
assert(apiRouter.includes('trip.tripListByUser(openid, data, dataEnvironment)'));
assert(tripListPage.includes('pageSize: 10'));
assert(tripListPage.includes('reqData.cursorId'));
assert(tripListPage.includes('_skipNextOnShowRefresh'));
assert(communityPage.includes('pageSize: 10'));
assert(communityHandler.includes('var queryLimit = authorId ? 100 : pageSize + 1'));

console.log('PASS business data environment isolation and stable 10-item list pagination');
