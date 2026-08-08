#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apiRoot = path.join(root, 'cloudfunctions', 'api');
const sharedPath = path.join(apiRoot, 'utils', 'shared.js');
const handlerPath = path.join(apiRoot, 'handlers', 'user.js');

const state = {
  users: [
    { _id: 'user-a', userId: 'A', openid: 'wx-a', phone: '13800000001', nickname: '账号A' },
    { _id: 'user-b', userId: 'B', openid: 'wx-b', phone: '13800000002', nickname: '账号B' }
  ],
  likes: [
    { _id: 'like-1', postAuthorId: 'wx-a' },
    { _id: 'like-2', postAuthorId: 'wx-a' },
    { _id: 'like-3', postAuthorId: 'wx-b' }
  ]
};

function matches(user, condition) {
  return Object.keys(condition).every(key => user[key] === condition[key]);
}

function collection(name) {
  if (name === 'community_likes') {
    return {
      where(condition) {
        return {
          async count() {
            return { total: state.likes.filter(like => matches(like, condition)).length };
          }
        };
      }
    };
  }
  if (name !== 'users') throw new Error(`Unexpected collection: ${name}`);
  return {
    where(condition) {
      let limit = Infinity;
      return {
        limit(value) {
          limit = value;
          return this;
        },
        async get() {
          return { data: state.users.filter(user => matches(user, condition)).slice(0, limit) };
        }
      };
    },
    doc(id) {
      return {
        async update({ data }) {
          const user = state.users.find(item => item._id === id);
          if (!user) throw new Error('user not found');
          Object.assign(user, data);
        },
        async get() {
          return { data: state.users.find(item => item._id === id) || null };
        }
      };
    },
    async add({ data }) {
      const id = `user-${state.users.length + 1}`;
      state.users.push({ _id: id, ...data });
      return { _id: id };
    }
  };
}

const crypto = {
  maskPhone(phone) {
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  },
  async hashPassword(value) {
    return value;
  },
  async verifyPassword() {
    return true;
  }
};

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: {
    db: { collection },
    _: {},
    cloud: { getWXContext: () => ({ OPENID: 'wx-a' }) },
    crypto,
    normalizeAvatarForDb: value => value || '',
    isLocalTempFilePath: () => false
  }
};

delete require.cache[handlerPath];
const user = require(handlerPath);

async function main() {
  const normalLogin = await user.userLoginByPhone('wx-a', {
    phone: '13800000001',
    nickname: '',
    avatar: ''
  });
  assert.strictEqual(normalLogin.success, true);
  assert.strictEqual(normalLogin.user._id, 'user-a');

  const profile = await user.userGet('wx-a');
  assert.strictEqual(profile.success, true);
  assert.strictEqual(profile.user.receivedLikes, 2);
  assert.strictEqual(state.users.find(item => item._id === 'user-a').receivedLikes, 2);

  const crossLogin = await user.userLoginByPhone('wx-a', {
    phone: '13800000002',
    nickname: '',
    avatar: ''
  });
  assert.strictEqual(crossLogin.success, false);
  assert(crossLogin.error.includes('其他微信'));
  assert.strictEqual(state.users.find(item => item._id === 'user-b').openid, 'wx-b');

  const secondAccount = await user.userLoginByPhone('wx-a', {
    phone: '13800000003',
    nickname: '',
    avatar: ''
  });
  assert.strictEqual(secondAccount.success, false);
  assert(secondAccount.error.includes('已绑定其他账号'));
  assert.strictEqual(state.users.length, 2);

  const newAccount = await user.userLoginByPhone('wx-c', {
    phone: '13800000003',
    nickname: '账号C',
    avatar: ''
  });
  assert.strictEqual(newAccount.success, true);
  assert.strictEqual(newAccount.user.openid, 'wx-c');
  assert.strictEqual(state.users.length, 3);

  console.log('PASS one WeChat identity can bind only one account');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
