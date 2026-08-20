#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const adminDataPath = path.join(apiRoot, 'handlers', 'adminData.js');
const handlerPath = path.join(apiRoot, 'handlers', 'adminSystemConfig.js');

const documents = new Map();
let collectionExists = false;
const db = {
  collection(name) {
    assert.strictEqual(name, 'system_config');
    return {
      doc(id) {
        return {
          async get() {
            if (!collectionExists) {
              const error = new Error('database collection not exists. Db or Table not exist: system_config');
              error.errCode = -502005;
              throw error;
            }
            return { data: documents.get(id) || null };
          },
          async set(payload) {
            if (!collectionExists) throw new Error('database collection not exists');
            documents.set(id, { _id: id, ...payload.data });
          }
        };
      }
    };
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db }
};
require.cache[adminDataPath] = {
  id: adminDataPath,
  filename: adminDataPath,
  loaded: true,
  exports: {
    async requireAdmin(adminId) {
      if (!adminId) throw new Error('管理员身份已失效，请重新登录');
      return { _id: adminId, role: 'viewer', nickname: '查看员' };
    },
    async requireEditor(adminId) {
      if (adminId !== 'operator-1') throw new Error('当前账号没有编辑权限');
      return { _id: adminId, role: 'operator', nickname: '运营人员' };
    }
  }
};
delete require.cache[handlerPath];
const handler = require(handlerPath);

async function main() {
  const missingCollection = await handler.adminTripListVisibilityGet({ adminId: 'viewer-1' });
  assert.strictEqual(missingCollection.success, false);
  assert.strictEqual(missingCollection.error, '请先在云数据库创建 system_config 集合');

  collectionExists = true;
  const defaults = await handler.adminTripListVisibilityGet({ adminId: 'viewer-1' });
  assert.strictEqual(defaults.success, true);
  assert.deepStrictEqual(defaults.config, { dev: false, test: false, prod: false });

  const forbidden = await handler.adminTripListVisibilityUpdate({
    adminId: 'viewer-1', dataEnv: 'prod', enabled: true
  });
  assert.strictEqual(forbidden.success, false);

  const enabled = await handler.adminTripListVisibilityUpdate({
    adminId: 'operator-1', dataEnv: 'test', enabled: true
  });
  assert.strictEqual(enabled.success, true);
  assert.deepStrictEqual(enabled.config, { dev: false, test: true, prod: false });

  const disabled = await handler.adminTripListVisibilityUpdate({
    adminId: 'operator-1', dataEnv: 'test', enabled: false
  });
  assert.strictEqual(disabled.success, true);
  assert.deepStrictEqual(disabled.config, { dev: false, test: false, prod: false });
  assert.strictEqual(documents.get('trip_list_visibility').updatedBy, '运营人员');

  const invalid = await handler.adminTripListVisibilityUpdate({
    adminId: 'operator-1', dataEnv: 'preview', enabled: true
  });
  assert.strictEqual(invalid.success, false);

  console.log('PASS admin trip history visibility defaults, authorization and per-environment updates');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
