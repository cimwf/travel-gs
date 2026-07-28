#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'community.js');
const stsPath = require.resolve('qcloud-cos-sts', {
  paths: [path.join(apiRoot, 'node_modules')]
});

const state = {
  drafts: [],
  posts: [],
  securityCalls: [],
  securitySuggest: 'pass',
  stsOptions: null
};

const db = {
  collection(name) {
    if (name === 'users') {
      return {
        where(query) {
          return {
            async get() {
              return {
                data: [{
                  _id: 'user-doc',
                  openid: query.openid,
                  nickname: '测试用户',
                  avatar: 'https://example.com/avatar.jpg'
                }]
              };
            }
          };
        }
      };
    }
    if (name === 'community_upload_drafts') {
      return {
        async add({ data }) {
          state.drafts.push(data);
          return { _id: data._id };
        }
      };
    }
    if (name === 'community_posts') {
      return {
        async add({ data }) {
          state.posts.push(data);
          return { _id: `post-${state.posts.length}` };
        }
      };
    }
    throw new Error(`Unexpected collection: ${name}`);
  }
};

const cloud = {
  openapi: {
    security: {
      async msgSecCheck(payload) {
        state.securityCalls.push(payload);
        return { result: { suggest: state.securitySuggest, label: 100 } };
      }
    }
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { db, _: {}, cloud }
};

require.cache[stsPath] = {
  id: stsPath,
  filename: stsPath,
  loaded: true,
  exports: {
    getCredential(options, callback) {
      state.stsOptions = options;
      callback(null, {
        credentials: {
          tmpSecretId: 'temporary-id',
          tmpSecretKey: 'temporary-key',
          sessionToken: 'temporary-token'
        },
        startTime: 100,
        expiredTime: 1000
      });
    }
  }
};

process.env.COS_SECRET_ID = 'unit-test-id';
process.env.COS_SECRET_KEY = 'unit-test-key';
process.env.COMMUNITY_COS_BUCKET = 'imagica-images-1436573577';
process.env.COMMUNITY_COS_REGION = 'ap-beijing';
process.env.COMMUNITY_COS_PREFIX = 'miniapp/community/';

delete require.cache[handlerPath];
const community = require(handlerPath);

async function testUploadSessionUsesExactServerKeys() {
  const result = await community.communityCreateUploadSession('openid-test', {
    files: [
      { mimeType: 'image/jpeg', size: 1234 },
      { mimeType: 'image/png', size: 5678 }
    ]
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.uploadItems.length, 2);
  assert.strictEqual(state.drafts.length, 1);
  assert.deepStrictEqual(state.drafts[0].uploadItems, result.uploadItems);
  assert.deepStrictEqual(result.uploadItems.map((item) => item.index), [0, 1]);
  assert.deepStrictEqual(result.uploadItems.map((item) => item.allowedMime), [
    'image/jpeg',
    'image/png'
  ]);

  const statement = state.stsOptions.policy.statement[0];
  assert.strictEqual(state.stsOptions.region, 'ap-beijing');
  assert.deepStrictEqual(statement.action, ['name/cos:PutObject']);
  assert.strictEqual(statement.resource.length, 2);
  assert(statement.resource.every((resource) => !resource.includes('*')));
  result.uploadItems.forEach((item) => {
    assert(statement.resource.some((resource) => resource.endsWith(`/${item.cosKey}`)));
    assert(item.cosKey.startsWith(state.drafts[0].allowedPrefix));
  });
  assert.strictEqual(
    statement.condition.numeric_less_than_equal['cos:content-length'],
    10 * 1024 * 1024
  );
}

async function testTextPostSkipsCosAndPassesSecurity() {
  state.posts.length = 0;
  state.securityCalls.length = 0;
  const result = await community.communityCreate('openid-test', {
    content: '今天去爬山',
    location: {
      name: '门头沟',
      address: '北京市门头沟区',
      latitude: 39.94,
      longitude: 116.1
    }
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(state.posts.length, 1);
  assert.strictEqual(state.posts[0].reviewStatus, 'approved');
  assert.strictEqual(state.posts[0].imageCount, 0);
  assert.deepStrictEqual(state.securityCalls.map((call) => call.content), [
    '今天去爬山',
    '门头沟',
    '北京市门头沟区'
  ]);
  state.securityCalls.forEach((call) => {
    assert.strictEqual(call.version, 2);
    assert.strictEqual(call.scene, 4);
    assert.strictEqual(call.openid, 'openid-test');
  });
}

async function testRejectsInvalidUploadMetadata() {
  const result = await community.communityCreateUploadSession('openid-test', {
    files: [{ mimeType: 'image/gif', size: 100 }]
  });
  assert.strictEqual(result.success, false);
  assert(result.error.includes('不支持'));
}

async function testTextSecurityFailsClosed() {
  for (const suggest of ['review', 'risky', 'unknown']) {
    state.securitySuggest = suggest;
    const previousPostCount = state.posts.length;
    const result = await community.communityCreate('openid-test', {
      content: `security-${suggest}`
    });
    assert.strictEqual(result.success, false);
    assert(result.error.includes('安全检测'));
    assert.strictEqual(state.posts.length, previousPostCount);
  }
  state.securitySuggest = 'pass';
}

async function main() {
  await testUploadSessionUsesExactServerKeys();
  console.log('PASS upload session uses exact server-generated COS keys');
  await testTextPostSkipsCosAndPassesSecurity();
  console.log('PASS text/location post skips COS and uses msgSecCheck v2');
  await testRejectsInvalidUploadMetadata();
  console.log('PASS upload session rejects unsupported image metadata');
  await testTextSecurityFailsClosed();
  console.log('PASS text security only accepts pass');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
