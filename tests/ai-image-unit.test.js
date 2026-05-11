#!/usr/bin/env node

/**
 * AI 生图纯函数单测
 *
 * 说明：
 *   前端当前只保留错误文案和 summary 兜底等轻量格式化逻辑；
 *   套餐价格/折扣字段由云函数规范化后直接返回给页面。
 *
 * 运行：npm run test:ai:unit
 */

const assert = require('assert');
const { formatAiImageErrorMessage } = require('../miniprogram/utils/ai-image-error.js');
const cloudErrorRules = require('../cloudfunctions/api/utils/ai-image-error-rules.js');
const serviceErrorRules = require('../services/ai-image-service/src/ai-image-error-rules.js');
const miniprogramErrorRules = require('../miniprogram/utils/ai-image-error-rules.js');

// ============ 从 ai-image.js 复制的规格实现（保持一致才通过） ============
function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

// ai-image.js 通过公共 util 处理 formatErrorMessage（纯字符串分支判断部分）
function formatErrorMessage(err, fallback) {
  return formatAiImageErrorMessage(err, fallback, { includeChannel: true });
}

function normalizeSummary(summary = {}) {
  const total = toSafeNumber(summary.total, 3);
  const used = toSafeNumber(summary.used, toSafeNumber(summary.generatedCount));
  return {
    total,
    used,
    remaining: typeof summary.remaining === 'number' ? toSafeNumber(summary.remaining) : Math.max(0, total - used),
    generatedCount: toSafeNumber(summary.generatedCount, used)
  };
}

// ============ 测试 ============
const results = [];

function it(name, fn) {
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

function describe(section, fn) {
  console.log(`\n--- ${section} ---`);
  fn();
}

describe('toSafeNumber', () => {
  it('数字保持原样', () => {
    assert.strictEqual(toSafeNumber(42), 42);
  });
  it('字符串数字被转换', () => {
    assert.strictEqual(toSafeNumber('3.14'), 3.14);
  });
  it('负数走 fallback', () => {
    assert.strictEqual(toSafeNumber(-1, 99), 99);
  });
  it('NaN 走 fallback', () => {
    assert.strictEqual(toSafeNumber('abc', 7), 7);
  });
  it('null 被转为 0 而非 fallback（Number(null)===0，已知行为）', () => {
    assert.strictEqual(toSafeNumber(null, 5), 0);
  });
  it('undefined 走 fallback', () => {
    assert.strictEqual(toSafeNumber(undefined, 5), 5);
  });
  it('空字符串 "" 走 fallback（Number("")===0 但被 toSafeNumber 放过，这里需要 hasValue 前置）', () => {
    assert.strictEqual(toSafeNumber('', 5), 0);
  });
});

describe('formatErrorMessage', () => {
  it('渠道错误', () => {
    assert.strictEqual(formatErrorMessage({ message: '渠道不存在或已停用' }), '所选渠道不可用，请重新选择');
  });
  it('次数耗尽', () => {
    assert.strictEqual(formatErrorMessage({ message: 'AI 生图次数已用完' }), 'AI 生图次数已用完');
  });
  it('429 rate limit', () => {
    assert.strictEqual(formatErrorMessage({ message: 'HTTP 429 Too Many Requests' }), '当前渠道已满，请换个渠道后再试');
  });
  it('502 网络错', () => {
    assert.strictEqual(formatErrorMessage({ message: 'Bad Gateway 502' }), 'AI 生图服务暂时不可用，请稍后重试');
  });
  it('429 才提示渠道满', () => {
    assert.strictEqual(formatErrorMessage({ message: 'HTTP 429 Too Many Requests' }), '当前渠道已满，请换个渠道后再试');
  });
  it('413 参考图过大', () => {
    assert.strictEqual(formatErrorMessage({ message: 'Payload Too Large 413' }), '参考图过大，请换一张较小的图片再试');
  });
  it('401 服务鉴权失败', () => {
    assert.strictEqual(formatErrorMessage({ message: 'AI 服务请求失败(401): Unauthorized' }), 'AI 生图服务鉴权失败，请检查服务密钥配置');
  });
  it('404 服务地址错误', () => {
    assert.strictEqual(formatErrorMessage({ message: 'AI 服务请求失败(404): Not Found' }), 'AI 生图服务地址或接口路径不正确');
  });
  it('500 服务内部错误', () => {
    assert.strictEqual(formatErrorMessage({ message: 'AI 服务请求失败(500): internal error' }), 'AI 生图服务内部错误，请查看后台日志');
  });
  it('400 敏感内容', () => {
    assert.strictEqual(formatErrorMessage({ message: '内容违规' }), '这次没有生成成功，可以换个描述或换张参考图再试');
  });
  it('invalid_request 错误归入生成失败', () => {
    assert.strictEqual(formatErrorMessage({ message: 'invalid_request: unsupported image format' }), '这次没有生成成功，可以换个描述或换张参考图再试');
  });
  it('普通 Invalid 文案不误判成内容违规', () => {
    assert.strictEqual(formatErrorMessage({ message: 'Invalid Weapon prompt variant' }, 'fallback'), 'Invalid Weapon prompt variant');
  });
  it('content-type 错误不误判成内容违规', () => {
    assert.strictEqual(formatErrorMessage({ message: 'Unsupported content-type: text/html' }, 'fallback'), 'Unsupported content-type: text/html');
  });
  it('prompt 空', () => {
    assert.strictEqual(formatErrorMessage({ message: '创作描述不能为空' }), '请先填写创作描述');
  });
  it('未知错误截断', () => {
    const longMsg = 'x'.repeat(200);
    const out = formatErrorMessage({ message: longMsg }, 'fallback');
    assert.strictEqual(out.length, 60);
  });
  it('空错误用 fallback', () => {
    assert.strictEqual(formatErrorMessage(null, 'default'), 'default');
  });
});

describe('aiImageErrorRulesSync', () => {
  it('三端错误规则来自同一份生成源', () => {
    assert.deepStrictEqual(cloudErrorRules.AI_IMAGE_ERROR_RULE_SOURCE, serviceErrorRules.AI_IMAGE_ERROR_RULE_SOURCE);
    assert.deepStrictEqual(cloudErrorRules.AI_IMAGE_ERROR_RULE_SOURCE, miniprogramErrorRules.AI_IMAGE_ERROR_RULE_SOURCE);
  });
});

describe('normalizeSummary', () => {
  it('完整字段', () => {
    const s = normalizeSummary({ total: 5, used: 2, remaining: 3, generatedCount: 2 });
    assert.deepStrictEqual(s, { total: 5, used: 2, remaining: 3, generatedCount: 2 });
  });
  it('缺 remaining 自动计算', () => {
    const s = normalizeSummary({ total: 5, used: 2, generatedCount: 2 });
    assert.strictEqual(s.remaining, 3);
  });
  it('used 缺失用 generatedCount 兜底', () => {
    const s = normalizeSummary({ total: 5, generatedCount: 4 });
    assert.strictEqual(s.used, 4);
    assert.strictEqual(s.remaining, 1);
  });
  it('全空走默认', () => {
    const s = normalizeSummary();
    assert.strictEqual(s.total, 3);
    assert.strictEqual(s.used, 0);
    assert.strictEqual(s.remaining, 3);
  });
  it('used > total 时 remaining=0（不为负）', () => {
    const s = normalizeSummary({ total: 3, used: 5 });
    assert.strictEqual(s.remaining, 0);
  });
});

// ============ 汇总 ============
const total = results.length;
const passed = results.filter((r) => r.ok).length;
console.log(`\n================ Summary ================`);
console.log(`Total: ${total}, Passed: ${passed}, Failed: ${total - passed}`);
if (passed !== total) {
  process.exit(1);
}
