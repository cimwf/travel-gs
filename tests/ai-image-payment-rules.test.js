#!/usr/bin/env node

/**
 * AI 生图虚拟支付规则自动化测试
 *
 * 说明：
 *   这里不拉起微信支付，也不调用真实微信接口，避免产生真实扣款。
 *   测试覆盖支付后端最关键的业务规则：额度叠加/重置、订单抢占、异常回滚、
 *   金额/环境异常进入人工核查，以及源码里是否保留关键保护逻辑。
 *
 * 运行：
 *   node tests/ai-image-payment-rules.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const aiImageSource = fs.readFileSync(path.join(root, 'cloudfunctions/api/handlers/aiImage.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'cloudfunctions/api/index.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(root, 'miniprogram/pages/ai-image/ai-image.js'), 'utf8');
const wxmlSource = fs.readFileSync(path.join(root, 'miniprogram/pages/ai-image/ai-image.wxml'), 'utf8');

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`FAIL ${name}`);
    console.log(`  ${(err.stack || err.message).split('\n').join('\n  ')}`);
  }
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

function calculateRecharge(current, imageCount) {
  const currentTotal = Number(current.total || 0);
  const currentUsed = Number(current.used || 0);
  const currentRemaining = Math.max(0, currentTotal - currentUsed);
  const newTotal = currentRemaining === 0 ? imageCount : currentTotal + imageCount;
  const newUsed = currentRemaining === 0 ? 0 : currentUsed;
  return {
    total: newTotal,
    used: newUsed,
    remaining: Math.max(0, newTotal - newUsed)
  };
}

function makeState({ quota = { total: 3, used: 3 }, order = {}, wxOrder = {} } = {}) {
  return {
    quota: { ...quota },
    orders: {
      AI_TEST_ORDER: {
        orderNo: 'AI_TEST_ORDER',
        userId: 'openid-test',
        status: 'pending_payment',
        imageCount: 20,
        goodsPrice: 990,
        payEnv: 1,
        ...order
      }
    },
    wxOrders: {
      AI_TEST_ORDER: {
        status: 2,
        order_fee: 990,
        order_type: 0,
        env_type: 2,
        ...wxOrder
      }
    }
  };
}

function expectedEnvType(payEnv) {
  return payEnv === 0 ? 1 : 2;
}

function confirmPayment(state, orderNo = 'AI_TEST_ORDER') {
  const order = state.orders[orderNo];
  if (!order || order.status !== 'pending_payment') {
    return { success: false, error: '订单不存在、已处理或处理中，请勿重复提交' };
  }

  order.status = 'confirming_payment';
  order.confirmingAt = Date.now();

  const rollback = (error) => {
    order.status = 'pending_payment';
    order.confirmingAt = 0;
    return { success: false, error };
  };

  const wxOrder = state.wxOrders[orderNo];
  if (!wxOrder) return rollback('微信侧订单不存在');
  if (![2, 3, 4].includes(wxOrder.status)) return rollback(`支付未完成，当前状态: ${wxOrder.status}`);
  if (wxOrder.order_fee !== order.goodsPrice) return { success: false, error: '订单金额不匹配，请联系客服' };
  if (![0, 7].includes(wxOrder.order_type)) return { success: false, error: `订单类型异常: ${wxOrder.order_type}` };
  if (wxOrder.env_type !== expectedEnvType(order.payEnv)) {
    return { success: false, error: `订单环境不匹配: ${wxOrder.env_type} !== ${expectedEnvType(order.payEnv)}` };
  }

  const next = calculateRecharge(state.quota, order.imageCount);
  state.quota.total = next.total;
  state.quota.used = next.used;

  order.status = 'paid';
  order.paidAt = Date.now();
  order.afterTotal = next.total;
  order.afterUsed = next.used;
  order.afterRemaining = next.remaining;
  order.orderType = wxOrder.order_type;
  order.wxOrderStatus = wxOrder.status;
  order.wxEnvType = wxOrder.env_type;
  return { success: true, summary: next };
}

function assertIncludes(source, needle, label = needle) {
  assert(source.includes(needle), `missing ${label}`);
}

function assertNotIncludes(source, needle, label = needle) {
  assert(!source.includes(needle), `unexpected ${label}`);
}

function assertRegex(source, regex, label = String(regex)) {
  assert(regex.test(source), `missing pattern ${label}`);
}

section('额度充值规则');

test('剩余为 0 时重置为本次购买包：0/3 + 20 => 20/20', () => {
  assert.deepStrictEqual(calculateRecharge({ total: 3, used: 3 }, 20), {
    total: 20,
    used: 0,
    remaining: 20
  });
});

test('有剩余时叠加总次数且保留已用：1/3 + 20 => 21/23', () => {
  assert.deepStrictEqual(calculateRecharge({ total: 3, used: 2 }, 20), {
    total: 23,
    used: 2,
    remaining: 21
  });
});

test('满额未使用时继续叠加：20/20 + 20 => 40/40', () => {
  assert.deepStrictEqual(calculateRecharge({ total: 20, used: 0 }, 20), {
    total: 40,
    used: 0,
    remaining: 40
  });
});

section('支付确认状态机');

test('支付成功后入账并写入订单实际 after 字段', () => {
  const state = makeState({ quota: { total: 3, used: 2 } });
  const res = confirmPayment(state);
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(state.quota, { total: 23, used: 2 });
  assert.strictEqual(state.orders.AI_TEST_ORDER.status, 'paid');
  assert.strictEqual(state.orders.AI_TEST_ORDER.afterRemaining, 21);
});

test('同一订单重复确认不会重复加额度', () => {
  const state = makeState({ quota: { total: 3, used: 2 } });
  const first = confirmPayment(state);
  const second = confirmPayment(state);
  assert.strictEqual(first.success, true);
  assert.strictEqual(second.success, false);
  assert.deepStrictEqual(state.quota, { total: 23, used: 2 });
});

test('未支付订单回滚为 pending_payment，允许稍后重试', () => {
  const state = makeState({ wxOrder: { status: 1 } });
  const res = confirmPayment(state);
  assert.strictEqual(res.success, false);
  assert.strictEqual(state.orders.AI_TEST_ORDER.status, 'pending_payment');
});

test('金额不匹配进入 confirming_payment，等待人工核查', () => {
  const state = makeState({ wxOrder: { order_fee: 1 } });
  const res = confirmPayment(state);
  assert.strictEqual(res.success, false);
  assert.strictEqual(state.orders.AI_TEST_ORDER.status, 'confirming_payment');
  assert.deepStrictEqual(state.quota, { total: 3, used: 3 });
});

test('环境不匹配进入 confirming_payment，等待人工核查', () => {
  const state = makeState({ order: { payEnv: 1 }, wxOrder: { env_type: 1 } });
  const res = confirmPayment(state);
  assert.strictEqual(res.success, false);
  assert.strictEqual(state.orders.AI_TEST_ORDER.status, 'confirming_payment');
});

test('iOS IAP 订单类型 7 可以确认入账', () => {
  const state = makeState({ quota: { total: 3, used: 2 }, wxOrder: { order_type: 7 } });
  const res = confirmPayment(state);
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(state.quota, { total: 23, used: 2 });
  assert.strictEqual(state.orders.AI_TEST_ORDER.status, 'paid');
  assert.strictEqual(state.orders.AI_TEST_ORDER.orderType, 7);
});

section('源码保护断言');

test('云函数支付配置来自环境变量，AppID/OfferID 不写死', () => {
  assertIncludes(aiImageSource, "const WXVPAY_APPID = process.env.WXVPAY_APPID || '';");
  assertIncludes(aiImageSource, "const WXVPAY_OFFER_ID = process.env.WXVPAY_OFFER_ID || '';");
  assertNotIncludes(aiImageSource, "const WXVPAY_DEFAULT_PRODUCT_ID");
});

test('productId 必须来自数据库套餐配置，缺失时拒绝支付', () => {
  assertIncludes(aiImageSource, "const productId = String(pack.productId || '').trim();");
  assertIncludes(aiImageSource, "套餐道具 ID 未配置");
});

test('创建订单不再因为有剩余次数而拒绝充值', () => {
  const createPayOrderMatch = aiImageSource.match(/async function aiImageCreatePayOrder[\s\S]*?async function aiImageConfirmPayment/);
  assert(createPayOrderMatch, 'missing aiImageCreatePayOrder block');
  assertNotIncludes(createPayOrderMatch[0], '当前仍有剩余次数，无需充值');
});

test('确认支付先抢占订单，防止并发重复入账', () => {
  assertIncludes(aiImageSource, "status: 'confirming_payment'");
  assertRegex(aiImageSource, /\.where\(\{\s*orderNo,\s*userId,\s*status:\s*'pending_payment'\s*\}\)\s*[\s\S]*?\.update\(\{\s*data:\s*\{\s*status:\s*'confirming_payment'/, 'pending -> confirming claim');
  assertRegex(aiImageSource, /\.where\(\{\s*orderNo,\s*userId,\s*status:\s*'confirming_payment'\s*\}\)\s*[\s\S]*?status:\s*'paid'/, 'confirming -> paid update');
});

test('确认支付按当前额度重新计算，并写回实际到账字段', () => {
  assertIncludes(aiImageSource, 'const currentTotal = normalizeAiImageQuotaNumber(quota.total);');
  assertIncludes(aiImageSource, 'const currentUsed = normalizeAiImageQuotaNumber(quota.used, 0);');
  assertIncludes(aiImageSource, 'const newTotal = currentRemaining === 0 ? imageCount : currentTotal + imageCount;');
  assertIncludes(aiImageSource, 'afterTotal: newTotal');
  assertIncludes(aiImageSource, 'afterUsed: newUsed');
  assertIncludes(aiImageSource, 'afterRemaining: newRemaining');
  assertIncludes(aiImageSource, 'orderType: wxOrder.order_type');
});

test('确认支付保留金额、订单类型、环境三重校验', () => {
  assertIncludes(aiImageSource, 'wxOrder.order_fee !== order.goodsPrice');
  assertIncludes(aiImageSource, '![0, 7].includes(wxOrder.order_type)');
  assertIncludes(aiImageSource, 'wxOrder.env_type !== expectedEnvType');
});

test('接口路由和前端调用虚拟支付链路存在', () => {
  assertIncludes(apiSource, "case 'aiImage/createPayOrder':");
  assertIncludes(apiSource, "case 'aiImage/confirmPayment':");
  assertIncludes(pageSource, 'wx.requestVirtualPayment');
  assertIncludes(pageSource, 'mode: \'short_series_goods\'');
  assertIncludes(wxmlSource, 'bindtap="openPackageModal">充值');
});

const total = results.length;
const passed = results.filter(item => item.ok).length;
console.log('\n================ Summary ================');
console.log(`Total: ${total}, Passed: ${passed}, Failed: ${total - passed}`);
if (passed !== total) {
  process.exit(1);
}
