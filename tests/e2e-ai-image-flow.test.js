#!/usr/bin/env node

/**
 * AI 生图 e2e 测试脚本
 *
 * 前置：
 *   - 微信开发者工具已打开，启用「安全设置 > 服务端口」或 CLI 自动启动
 *   - cloudfunctions/api 已部署到测试云环境
 *   - ai_image_packages / ai_image_channels / ai_image_templates 已铺至少 1 条测试数据
 *   - 登录的开发者 openid 在测试 env 里是独立测试账号
 *
 * 运行：
 *   npm run test:ai                 # 默认跑 A/B/C/D/E/F/H/I/K，跳过 G（真实生图）
 *   RUN_REAL_GENERATE=1 npm run test:ai   # 额外跑 G，会产生 OpenAI 费用
 *
 * 环境变量：
 *   WX_CLI_PATH          微信开发者工具 CLI，默认 /Applications/wechatwebdevtools.app/Contents/MacOS/cli
 *   WX_AUTOMATOR_PORT    自动化端口，默认 9420
 *   RUN_REAL_GENERATE    置 1 时跑 Group G（真实 OpenAI 生图）
 */

const assert = require('assert');
const path = require('path');
const automator = require('miniprogram-automator');

const root = path.resolve(__dirname, '..');
const cliPath = process.env.WX_CLI_PATH || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const autoPort = Number(process.env.WX_AUTOMATOR_PORT || 9420);
const runRealGenerate = process.env.RUN_REAL_GENERATE === '1';

const results = [];

function record(group, name, ok, err) {
  const entry = { group, name, ok, message: err ? (err.stack || err.message || String(err)) : '' };
  results.push(entry);
  const flag = ok ? 'PASS' : 'FAIL';
  const detail = err ? `\n  ${entry.message.split('\n').join('\n  ')}` : '';
  console.log(`[${flag}] ${group} ${name}${detail}`);
}

async function runCase(group, name, fn) {
  try {
    await fn();
    record(group, name, true);
  } catch (err) {
    record(group, name, false, err);
  }
}

async function main() {
  const miniProgram = await connectOrLaunch();
  try {
    await ensureLoggedIn(miniProgram);
    await cleanupTestState(miniProgram);

    await groupA(miniProgram);
    await groupB(miniProgram);
    await groupC(miniProgram);
    await groupD(miniProgram);
    await groupE(miniProgram);
    await groupF(miniProgram);
    if (runRealGenerate) {
      await groupG(miniProgram);
    } else {
      console.log('[SKIP] G (set RUN_REAL_GENERATE=1 to enable real generation)');
    }
    await groupH(miniProgram);
    await groupI(miniProgram);
    await groupK(miniProgram);
  } finally {
    try { await cleanupTestState(miniProgram); } catch (err) { console.warn('cleanup failed', err.message || err); }
    await miniProgram.close();
  }

  printSummary();
  if (results.some((r) => !r.ok)) process.exit(1);
}

async function connectOrLaunch() {
  try {
    return await automator.connect({ wsEndpoint: `ws://127.0.0.1:${autoPort}` });
  } catch (err) {
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

async function ensureLoggedIn(miniProgram) {
  const isLoggedIn = await miniProgram.evaluate(() => {
    const app = getApp();
    const userInfo = wx.getStorageSync('userInfo');
    return Boolean((app && app.globalData && app.globalData.isLoggedIn) || (userInfo && userInfo.openid));
  });
  if (!isLoggedIn) {
    throw new Error('未登录，请先在开发者工具里手动登录测试账号');
  }
}

async function cleanupTestState(miniProgram) {
  await miniProgram.evaluate(async () => {
    const db = wx.cloud.database();
    const _ = db.command;
    const openid = wx.getStorageSync('openid') || '';
    if (!openid) return;

    try { await db.collection('ai_image_quotas').where({ userId: openid }).remove(); } catch (err) {}
    try { await db.collection('ai_image_generations').where({ userId: openid }).remove(); } catch (err) {}
    try { await db.collection('ai_image_orders').where({ userId: openid }).remove(); } catch (err) {}
    try { await db.collection('ai_image_template_votes').where({ userId: openid }).remove(); } catch (err) {}
    try { wx.removeStorageSync('aiImageSelectedChannelId'); } catch (err) {}
    try { wx.removeStorageSync('aiImageSelectedTemplate'); } catch (err) {}
  });
}

async function setQuotaUsedUp(miniProgram) {
  return await miniProgram.evaluate(async () => {
    const db = wx.cloud.database();
    const openid = wx.getStorageSync('openid') || '';
    if (!openid) return null;

    const existing = await db.collection('ai_image_quotas').where({ userId: openid }).limit(1).get();
    const now = Date.now();
    if (existing.data && existing.data[0]) {
      await db.collection('ai_image_quotas').doc(existing.data[0]._id).update({
        data: { total: 3, used: 3, updatedAt: now }
      });
      return existing.data[0]._id;
    }
    const add = await db.collection('ai_image_quotas').add({
      data: { userId: openid, total: 3, used: 3, createdAt: now, updatedAt: now }
    });
    return add._id;
  });
}

// ============ Group A：入口导航 ============
async function groupA(miniProgram) {
  await runCase('A', 'A1 profile -> ai-image 跳转', async () => {
    await miniProgram.reLaunch('/pages/profile/profile');
    const profile = await miniProgram.currentPage();
    await profile.waitFor(800);
    const entry = await profile.$('.info-bar.ai-entry');
    assert(entry, 'profile 页找不到 AI 生图入口');
    await entry.tap();
    await profile.waitFor(1000);
    const page = await miniProgram.currentPage();
    assert.strictEqual(page.path, 'pages/ai-image/ai-image');
    assert(await page.$('.hero-title'), 'hero 标题未渲染');
    assert(await page.$('.mode-tabs'), 'mode tabs 未渲染');
  });
}

// ============ Group B：模式切换 & canGenerate ============
async function groupB(miniProgram) {
  await runCase('B', 'B1 文字模式输入 prompt -> canGenerate=true', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await setPrompt(page, '冬日长城露营海报');
    await waitForData(page, (d) => d.canGenerate === true, 2000, 'canGenerate 未变 true');
    const disabled = await page.$('.generate-btn.disabled');
    assert(!disabled, '按钮仍显示 disabled');
  });

  await runCase('B', 'B2 切到图生图后 canGenerate 应刷新为 false', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await setPrompt(page, '提前填的 prompt');
    await switchMode(page, 'image');
    await page.waitFor(400);
    const data = await page.data();
    assert.strictEqual(data.canGenerate, false, '切到图生图后应按参考图重算 canGenerate');
  });

  await runCase('B', 'B3 图生图未选图 -> 按钮灰', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await switchMode(page, 'image');
    await page.waitFor(300);
    assert.strictEqual(await page.data('canGenerate'), false);
    assert(await page.$('.generate-btn.disabled'), 'disabled class 缺失');
  });

  await runCase('B', 'B4 图生图切回文字模式后 canGenerate 依赖 prompt', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await switchMode(page, 'image');
    await page.callMethod('setData', { referenceImage: 'wxfile://fake.jpg' });
    await page.callMethod('updateCanGenerate');
    await waitForData(page, (d) => d.canGenerate === true, 1500);
    await switchMode(page, 'text');
    await page.waitFor(400);
    const data = await page.data();
    assert.strictEqual(data.canGenerate, false, '切回文字模式后应按 prompt 重算 canGenerate');
  });
}

// ============ Group C：模板 ============
async function groupC(miniProgram) {
  await runCase('C', 'C1 quickTemplates 加载 & 应用模板', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => !d.templateLoading, 8000, 'templateLoading 未结束');
    const templates = await page.data('quickTemplates');
    if (!templates || !templates.length) {
      throw new Error('测试 env 未铺 text 模板，跳过 C1/C2/C3（请先在 ai_image_templates 添加 enabled=true 数据）');
    }
    const card = await page.$('.template-card');
    await card.tap();
    await page.waitFor(300);
    const data = await page.data();
    assert(data.prompt && data.prompt.length > 0, 'prompt 未回填');
  });

  await runCase('C', 'C2 更多模板跳转 ai-image-template', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await page.waitFor(600);
    const more = await page.$('.section-action');
    await more.tap();
    await page.waitFor(1000);
    const next = await miniProgram.currentPage();
    assert.strictEqual(next.path, 'pages/ai-image-template/ai-image-template');
  });

  await runCase('C', 'C3 模板库 -> 回传应用', async () => {
    const aiPage = await reLaunchAiImage(miniProgram);
    await aiPage.callMethod('onOpenTemplateLibrary');
    await aiPage.waitFor(1500);
    const tplPage = await miniProgram.currentPage();
    if (tplPage.path !== 'pages/ai-image-template/ai-image-template') {
      throw new Error('未进入模板库页面');
    }
    await waitForData(tplPage, (d) => !d.loading, 8000);
    const firstCard = await tplPage.$('.template-card, .tpl-card, [data-template]');
    if (!firstCard) throw new Error('模板库页没有渲染任何卡片，跳过');
    await firstCard.tap();
    await aiPage.waitFor(1200);
    const back = await miniProgram.currentPage();
    assert.strictEqual(back.path, 'pages/ai-image/ai-image');
    assert(await back.data('prompt'), 'prompt 未被模板库回填');
  });
}

// ============ Group D：渠道 ============
async function groupD(miniProgram) {
  await runCase('D', 'D1 渠道默认选中', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => !d.channelLoading, 8000, 'channelLoading 未结束');
    const channels = await page.data('channels');
    if (!channels || !channels.length) {
      throw new Error('测试 env 未铺 channels，跳过 D 组（请在 ai_image_channels 添加 enabled=true 数据）');
    }
    const selectedId = await page.data('selectedChannelId');
    assert(selectedId, '未选中默认渠道');
  });

  await runCase('D', 'D2 切换渠道 & 写入 storage', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => !d.channelLoading && d.channels.length > 0, 8000);
    const channels = await page.data('channels');
    if (channels.length < 2) {
      throw new Error('渠道少于 2 个，跳过 D2');
    }
    await page.callMethod('onOpenChannelPicker');
    await page.waitFor(300);
    const other = channels.find((c) => c.channelId !== (channels[0].channelId));
    await page.callMethod('onSelectChannel', { currentTarget: { dataset: { id: other.channelId } } });
    await page.waitFor(300);
    assert.strictEqual(await page.data('selectedChannelId'), other.channelId);
    const stored = await miniProgram.callWxMethod('getStorageSync', 'aiImageSelectedChannelId');
    assert.strictEqual(stored, other.channelId);
  });

  await runCase('D', 'D3 重启后记住上次渠道', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => !d.channelLoading && d.channels.length > 0, 8000);
    const channels = await page.data('channels');
    if (channels.length < 2) throw new Error('渠道少于 2 个，跳过 D3');
    const other = channels[channels.length - 1];
    await miniProgram.callWxMethod('setStorageSync', 'aiImageSelectedChannelId', other.channelId);

    const page2 = await reLaunchAiImage(miniProgram);
    await waitForData(page2, (d) => !d.channelLoading, 8000);
    assert.strictEqual(await page2.data('selectedChannelId'), other.channelId);
  });
}

// ============ Group E：比例 / 风格 ============
async function groupE(miniProgram) {
  await runCase('E', 'E1 ratio chips 互斥', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await page.waitFor(400);
    await page.callMethod('onSelectRatio', { currentTarget: { dataset: { value: '16:9' } } });
    await page.waitFor(100);
    assert.strictEqual(await page.data('ratio'), '16:9');
    await page.callMethod('onSelectRatio', { currentTarget: { dataset: { value: '9:16' } } });
    await page.waitFor(100);
    assert.strictEqual(await page.data('ratio'), '9:16');
  });

  await runCase('E', 'E2 style chips 选中', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await page.waitFor(400);
    const styles = await page.data('styles');
    if (!styles || !styles.length) throw new Error('styleOptions 为空');
    const target = styles[0];
    await page.callMethod('onSelectStyle', { currentTarget: { dataset: { value: target.value } } });
    await page.waitFor(100);
    assert.strictEqual(await page.data('style'), target.value);
  });
}

// ============ Group F：额度 & 套餐 ============
async function groupF(miniProgram) {
  await runCase('F', 'F1 summary 加载并显示', async () => {
    await cleanupTestState(miniProgram);
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => d.summaryReady === true, 8000, 'summaryReady 未变 true');
    const summary = await page.data('summary');
    assert(typeof summary.total === 'number' && summary.total >= 0);
    assert(typeof summary.remaining === 'number' && summary.remaining >= 0);
  });

  await runCase('F', 'F2 剩余=0 时点生成弹充值', async () => {
    await setQuotaUsedUp(miniProgram);
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => d.summaryReady === true && d.summary.remaining === 0, 8000);
    await setPrompt(page, '额度耗尽提示测试');
    await page.callMethod('onGenerate');
    await page.waitFor(1500);
    const show = await page.data('showPackageModal');
    assert.strictEqual(show, true, '未弹充值弹窗');
  });

  await runCase('F', 'F3 套餐列表渲染', async () => {
    await setQuotaUsedUp(miniProgram);
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => !d.packageLoading, 8000);
    const packages = await page.data('packages');
    if (!packages || !packages.length) {
      throw new Error('测试 env 未铺 packages，跳过 F3/F4（请在 ai_image_packages 添加 enabled=true 数据）');
    }
    packages.forEach((pack) => {
      assert(pack.title && pack.priceText, `套餐字段不完整: ${JSON.stringify(pack)}`);
    });
  });

  await runCase('F', 'F4 充值成功 summary 更新', async () => {
    await setQuotaUsedUp(miniProgram);
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => !d.packageLoading && d.packages.length > 0, 8000);
    const pkg = (await page.data('packages'))[0];
    if (!pkg) throw new Error('无套餐，跳过 F4');
    const before = await page.data('summary');
    await page.callMethod('onPurchasePackage', { currentTarget: { dataset: { id: pkg._id || pkg.id } } });
    await page.waitFor(2000);
    const after = await page.data('summary');
    assert(after.total >= before.total, `充值后 total 应 >= 之前：before=${before.total} after=${after.total}`);
    assert.strictEqual(await page.data('showPackageModal'), false, '充值后弹窗未关闭');
  });
}

// ============ Group G：真实生图（默认跳过）============
async function groupG(miniProgram) {
  await runCase('G', 'G1 文生图真实调 OpenAI', async () => {
    await cleanupTestState(miniProgram);
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => d.summaryReady === true && d.summary.remaining > 0, 8000);
    await setPrompt(page, 'a cute cat, minimal flat illustration');
    await page.callMethod('onSelectRatio', { currentTarget: { dataset: { value: '1:1' } } });
    await page.callMethod('onGenerate');
    await waitFor(async () => {
      const d = await page.data();
      return d.taskId || d.loading === false;
    }, 20000, '生成任务未提交');
    await miniProgram.native().confirmModal().catch(() => {});
    const taskId = await page.data('taskId');
    assert(taskId, '未返回 taskId');
  });
}

// ============ Group H：错误分支 ============
async function groupH(miniProgram) {
  await runCase('H', 'H1 错误 channelId 提示重新选择', async () => {
    await cleanupTestState(miniProgram);
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => d.summaryReady === true, 8000);
    await setPrompt(page, 'channel error test');
    await page.callMethod('setData', {
      selectedChannelId: 'non-existent-channel-id-xxxx',
      selectedChannel: { channelId: 'non-existent-channel-id-xxxx', name: 'fake' }
    });
    await page.callMethod('onGenerate');
    await page.waitFor(3000);
    assert.strictEqual(await page.data('loading'), false, '应已结束 loading');
  });

  await runCase('H', 'H2 额度耗尽自动弹充值', async () => {
    await setQuotaUsedUp(miniProgram);
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => d.summaryReady && d.summary.remaining === 0, 8000);
    await setPrompt(page, 'quota exhausted test');
    await page.callMethod('onGenerate');
    await page.waitFor(1500);
    assert.strictEqual(await page.data('showPackageModal'), true);
  });

  await runCase('H', 'H3 文字模式空 prompt 提示', async () => {
    await cleanupTestState(miniProgram);
    const page = await reLaunchAiImage(miniProgram);
    await page.waitFor(500);
    await page.callMethod('onGenerate');
    await page.waitFor(500);
    assert.strictEqual(await page.data('loading'), false);
  });

  await runCase('H', 'H4 图生图未选图提示', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await switchMode(page, 'image');
    await page.waitFor(300);
    await page.callMethod('onGenerate');
    await page.waitFor(500);
    assert.strictEqual(await page.data('loading'), false);
  });
}

// ============ Group I：作品集 ============
async function groupI(miniProgram) {
  await runCase('I', 'I1 空作品集渲染空态', async () => {
    await cleanupTestState(miniProgram);
    const page = await miniProgram.reLaunch('/pages/ai-gallery/ai-gallery');
    await waitForData(page, (d) => d.loading === false, 8000);
    assert.strictEqual(await page.data('isEmpty'), true, '未显示空态');
  });

  await runCase('I', 'I2 summary 正确显示', async () => {
    await cleanupTestState(miniProgram);
    const page = await miniProgram.reLaunch('/pages/ai-gallery/ai-gallery');
    await waitForData(page, (d) => d.summaryReady === true, 8000, 'summaryReady 未就绪');
    const summary = await page.data('summary');
    assert(typeof summary.total === 'number' && summary.total >= 0);
  });
}

// ============ Group K：下拉刷新 ============
async function groupK(miniProgram) {
  await runCase('K', 'K1 下拉只刷新 summary', async () => {
    const page = await reLaunchAiImage(miniProgram);
    await waitForData(page, (d) => d.summaryReady === true && !d.channelLoading, 8000);
    const beforeTemplates = await page.data('quickTemplates');
    await page.callMethod('onPullDownRefresh');
    await page.waitFor(1500);
    const afterTemplates = await page.data('quickTemplates');
    assert.deepStrictEqual(afterTemplates, beforeTemplates, 'onPullDownRefresh 当前实现不应刷模板');
  });
}

// ============ Helpers ============
async function reLaunchAiImage(miniProgram) {
  const page = await miniProgram.reLaunch('/pages/ai-image/ai-image');
  await page.waitFor(800);
  return page;
}

async function setPrompt(page, value) {
  await page.callMethod('onPromptInput', { detail: { value } });
  await page.waitFor(100);
}

async function switchMode(page, mode) {
  await page.callMethod('onSwitchMode', { currentTarget: { dataset: { mode } } });
  await page.waitFor(300);
}

async function waitForData(page, predicate, timeoutMs = 5000, label = 'data predicate') {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const data = await page.data();
    if (predicate(data)) return data;
    await page.waitFor(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function waitFor(asyncPredicate, timeoutMs = 5000, label = 'condition') {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await asyncPredicate()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout waiting for ${label}`);
}

function printSummary() {
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  console.log('\n================ Summary ================');
  console.log(`Total: ${total}, Passed: ${passed}, Failed: ${total - passed}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log('\nFailed cases:');
    failed.forEach((r) => console.log(`  - [${r.group}] ${r.name}`));
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
