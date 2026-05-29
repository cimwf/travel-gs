const https = require('https');
const http = require('http');
const dns = require('dns').promises;
const net = require('net');
const nodeCrypto = require('crypto');
const { cloud, db, _, crypto, safeAvatar } = require('../utils/shared');
const { formatAiImageSharedErrorMessage } = require('../utils/ai-image-error-rules');

const AI_IMAGE_FREE_QUOTA = 3;
const AI_IMAGE_PROMPT_MAX_LENGTH = 2000;
const AI_IMAGE_TASK_EXPIRE_MS_DEFAULT = 15 * 60 * 1000;
const AI_IMAGE_HTTP_MAX_SOCKETS = 10;
const AI_IMAGE_DOWNLOAD_MAX_BYTES_DEFAULT = 20 * 1024 * 1024;
const DEFAULT_AI_IMAGE_DOWNLOAD_ALLOWLIST = [
  'openai.com',
  'oaiusercontent.com',
  'blob.core.windows.net',
  'toapis.com',
  'toapis.cn',
  'copilotbase.com',
  'myqcloud.com',
  'tencentcos.cn',
  'qcloud.la'
];
const aiImageHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: AI_IMAGE_HTTP_MAX_SOCKETS });
const aiImageHttpAgent = new http.Agent({ keepAlive: true, maxSockets: AI_IMAGE_HTTP_MAX_SOCKETS });

function getAiImageKeepAliveAgent(protocol) {
  return protocol === 'http:' ? aiImageHttpAgent : aiImageHttpsAgent;
}

function normalizeAiImageQuotaNumber(value, fallback = AI_IMAGE_FREE_QUOTA) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function buildAiImageQuotaUserInfo(user = {}) {
  return {
    appUserId: user.userId || '',
    nickname: user.nickname || '',
    phone: user.phone || '',
    phoneMask: user.phoneMask || (user.phone ? crypto.maskPhone(user.phone) : ''),
    avatar: safeAvatar(user.avatar || '')
  };
}

function hasAiImageQuotaUserInfo(userInfo = {}) {
  return Boolean(
    userInfo.appUserId ||
    userInfo.nickname ||
    userInfo.phone ||
    userInfo.phoneMask ||
    userInfo.avatar
  );
}

function getAiImageQuotaUserInfoPatch(quota = {}, userInfo = {}) {
  const patch = {};
  if (!hasAiImageQuotaUserInfo(userInfo)) return patch;

  ['appUserId', 'nickname', 'phone', 'phoneMask', 'avatar'].forEach(key => {
    if (userInfo[key] && quota[key] !== userInfo[key]) {
      patch[key] = userInfo[key];
    }
  });

  return patch;
}

function createAiImageOrderNo(now = Date.now()) {
  return `AI${now}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function getCurrentCloudEnvId() {
  const wxContext = cloud.getWXContext ? cloud.getWXContext() : {};
  return wxContext.ENV || wxContext.env || wxContext.envId || process.env.TCB_ENV || process.env.SCF_NAMESPACE || '';
}

function getAiImageStorageBucket(value = '') {
  const configured = process.env.AI_IMAGE_STORAGE_BUCKET || process.env.COS_BUCKET || '';
  if (configured) return configured;

  const text = String(value || '');
  const cloudMatch = text.match(/^cloud:\/\/[^.]+\.(.+?)\//);
  if (cloudMatch) return cloudMatch[1];

  try {
    const parsed = new URL(text.startsWith('//') ? `https:${text}` : text);
    const hostMatch = parsed.hostname.match(/^(.+)\.tcb\.qcloud\.la$/);
    return hostMatch ? hostMatch[1] : '';
  } catch (err) {
    return '';
  }
}

function buildAiImagePublicUrl(cloudPath, fileID = '') {
  const bucket = getAiImageStorageBucket(fileID);
  return cloudPath && bucket ? `https://${bucket}.tcb.qcloud.la/${cloudPath}` : '';
}

function buildAiImageCloudFileID(cloudPath, bucketSource = '') {
  const path = String(cloudPath || '').trim().replace(/^\/+/, '');
  if (!path) return '';
  const envId = getCurrentCloudEnvId();
  const bucket = getAiImageStorageBucket(bucketSource);
  return envId && bucket ? `cloud://${envId}.${bucket}/${path}` : '';
}

function normalizeAiImagePackagePrice(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.round(number * 100) / 100;
}

function normalizeAiImagePackageDiscount(value) {
  if (value === null || value === undefined || value === '') {
    return 1;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 1;
  }

  let rate = number;
  if (rate > 1 && rate <= 10) {
    rate = rate / 10;
  } else if (rate > 10 && rate <= 100) {
    rate = rate / 100;
  }

  if (rate <= 0 || rate > 1) {
    return 1;
  }

  return Math.round(rate * 10000) / 10000;
}

function hasAiImagePackageValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function formatAiImageMoney(value) {
  const price = normalizeAiImagePackagePrice(value);
  if (Number.isInteger(price)) {
    return String(price);
  }

  return price.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatAiImageDiscountText(discount) {
  if (!(discount >= 0 && discount < 1)) {
    return '';
  }

  const zhe = Math.round(discount * 100) / 10;
  const text = Number.isInteger(zhe) ? String(zhe) : String(zhe).replace(/0+$/, '').replace(/\.$/, '');
  return `${text}折`;
}

function getAiImagePackagePricing(item = {}) {
  const discount = normalizeAiImagePackageDiscount(item.discount);
  const hasDiscountedPrice = hasAiImagePackageValue(item.afterPrice) ||
    hasAiImagePackageValue(item.discountedPrice) ||
    hasAiImagePackageValue(item.salePrice) ||
    hasAiImagePackageValue(item.finalPrice);
  const basePrice = normalizeAiImagePackagePrice(
    hasAiImagePackageValue(item.beforePrice)
      ? item.beforePrice
      : (hasAiImagePackageValue(item.originalPrice) ? item.originalPrice : item.price)
  );
  const computedDiscountedPrice = normalizeAiImagePackagePrice(basePrice * discount);
  const explicitDiscountedPrice = hasAiImagePackageValue(item.discountedPrice)
    ? item.discountedPrice
    : (hasAiImagePackageValue(item.afterPrice)
      ? item.afterPrice
      : (hasAiImagePackageValue(item.salePrice) ? item.salePrice : item.finalPrice));
  const discountedPrice = normalizeAiImagePackagePrice(hasDiscountedPrice ? explicitDiscountedPrice : computedDiscountedPrice);
  const hasDiscount = discount < 1 && discountedPrice < basePrice;
  const originalPrice = hasDiscount ? basePrice : discountedPrice;

  return {
    originalPrice,
    discountedPrice,
    discount,
    hasDiscount,
    originalPriceText: formatAiImageMoney(originalPrice),
    priceText: formatAiImageMoney(discountedPrice),
    discountText: hasDiscount ? formatAiImageDiscountText(discount) : ''
  };
}

// ========== AI 生图相关 ==========

function getOpenAIConfig() {
  return {
    imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    serviceUrl: process.env.AI_IMAGE_SERVICE_URL || '',
    serviceSecret: process.env.AI_IMAGE_SERVICE_SECRET || ''
  };
}

function requestJsonUrl(method, url, payload, headers = {}, timeoutMs = 25000) {
  const body = payload ? JSON.stringify(payload) : '';
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const req = transport.request({
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
      method,
      agent: getAiImageKeepAliveAgent(parsedUrl.protocol),
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          const error = new Error(`AI 服务返回异常(${res.statusCode}): ${text.slice(0, 200)}`);
          error.statusCode = res.statusCode;
          error.responseText = text;
          reject(error);
          return;
        }

        if (res.statusCode >= 400) {
          const error = new Error(`AI 服务请求失败(${res.statusCode}): ${parsed.error || parsed.message || text.slice(0, 120)}`);
          error.statusCode = res.statusCode;
          error.response = parsed;
          reject(error);
          return;
        }

        resolve(parsed);
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('AI 服务请求超时'));
    });
    req.on('error', (err) => {
      reject(new Error(`AI 服务连接失败: ${err.message}`));
    });
    if (body) req.write(body);
    req.end();
  });
}

function getAiImageDownloadMaxBytes() {
  const value = Number(process.env.AI_IMAGE_DOWNLOAD_MAX_BYTES);
  return Number.isFinite(value) && value > 0 ? value : AI_IMAGE_DOWNLOAD_MAX_BYTES_DEFAULT;
}

function normalizeAiImageDownloadHostname(hostname = '') {
  const trimmed = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  return trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
}

function getAiImageDownloadAllowlist() {
  const configured = String(process.env.AI_IMAGE_DOWNLOAD_ALLOWLIST || '')
    .split(',')
    .map(item => normalizeAiImageDownloadHostname(item).replace(/^\./, ''))
    .filter(Boolean);
  return [...new Set([...DEFAULT_AI_IMAGE_DOWNLOAD_ALLOWLIST, ...configured])];
}

function isAllowedAiImageDownloadHost(hostname) {
  const host = normalizeAiImageDownloadHostname(hostname);
  return getAiImageDownloadAllowlist().some(domain => host === domain || host.endsWith(`.${domain}`));
}

function isBlockedAiImageIpAddress(address) {
  const value = normalizeAiImageDownloadHostname(address);
  const ipVersion = net.isIP(value);
  if (!ipVersion) return false;

  if (ipVersion === 4) {
    const [a, b] = value.split('.').map(part => Number(part));
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  return (
    value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe80') ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.') ||
    value.startsWith('::ffff:169.254.')
  );
}

function isBlockedAiImageDownloadHostname(hostname) {
  const host = normalizeAiImageDownloadHostname(hostname);
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal' ||
    isBlockedAiImageIpAddress(host)
  );
}

async function assertSafeAiImageDownloadUrl(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    throw new Error('图片下载地址格式不正确');
  }

  const allowHttp = String(process.env.AI_IMAGE_ALLOW_HTTP_DOWNLOADS || '').toLowerCase() === 'true';
  if (parsedUrl.protocol !== 'https:' && !(allowHttp && parsedUrl.protocol === 'http:')) {
    throw new Error('图片下载地址必须使用 HTTPS');
  }

  if (isBlockedAiImageDownloadHostname(parsedUrl.hostname)) {
    throw new Error('图片下载地址被安全策略拒绝');
  }

  const requireAllowlist = String(process.env.AI_IMAGE_DOWNLOAD_REQUIRE_ALLOWLIST || '').toLowerCase() === 'true';
  if (requireAllowlist && !isAllowedAiImageDownloadHost(parsedUrl.hostname)) {
    throw new Error('图片下载地址不在允许的域名列表中');
  }

  let addresses;
  try {
    const hostname = normalizeAiImageDownloadHostname(parsedUrl.hostname);
    addresses = net.isIP(hostname)
      ? [{ address: hostname }]
      : await dns.lookup(parsedUrl.hostname, { all: true, verbatim: true });
  } catch (err) {
    throw new Error(`图片下载地址解析失败：${err.message || err}`);
  }

  if ((addresses || []).some(item => isBlockedAiImageIpAddress(item.address))) {
    throw new Error('图片下载地址解析到内网地址，已拒绝下载');
  }

  return parsedUrl;
}

function downloadAiImageBinary(url, timeoutMs = 120000, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error('图片下载重定向次数过多'));
  }

  return assertSafeAiImageDownloadUrl(url).then(parsedUrl => new Promise((resolve, reject) => {
    const transport = parsedUrl.protocol === 'http:' ? http : https;
    const maxBytes = getAiImageDownloadMaxBytes();
    let settled = false;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value);
    };

    const req = transport.request({
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
      method: 'GET',
      agent: getAiImageKeepAliveAgent(parsedUrl.protocol)
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        finish(null, downloadAiImageBinary(new URL(res.headers.location, parsedUrl).toString(), timeoutMs, redirectCount + 1));
        return;
      }

      if (res.statusCode >= 400) {
        finish(new Error(`图片下载失败(${res.statusCode})`));
        return;
      }

      const contentType = String(res.headers['content-type'] || 'image/png').split(';')[0].trim().toLowerCase();
      if (!contentType.startsWith('image/')) {
        finish(new Error(`图片下载内容类型不是图片：${contentType || 'unknown'}`));
        return;
      }

      const contentLength = Number(res.headers['content-length'] || 0);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        finish(new Error('图片文件过大，无法保存到云存储'));
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      res.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          req.destroy(new Error('图片文件过大，无法保存到云存储'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        finish(null, {
          buffer: Buffer.concat(chunks),
          contentType
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('图片下载超时'));
    });
    req.on('error', finish);
    req.end();
  }));
}

function getFileExt(fileID) {
  const clean = String(fileID || '').split('?')[0];
  const matched = clean.match(/\.([a-zA-Z0-9]+)$/);
  return matched ? matched[1].toLowerCase() : 'jpg';
}

function getMimeType(ext) {
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp'
  };
  return map[ext] || 'image/jpeg';
}

function getMimeTypeFromImageBuffer(buffer, fallbackExt = 'jpg') {
  if (buffer && buffer.length >= 12) {
    if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
      return 'image/png';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      return 'image/jpeg';
    }
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      return 'image/webp';
    }
  }
  return getMimeType(fallbackExt);
}

function getImageExtFromMime(contentType = '') {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  return 'png';
}

function sanitizeAiImageFileName(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function buildAiImageGeneratedCloudPath(responseId, ext = 'png') {
  const fileName = sanitizeAiImageFileName(responseId);
  const normalizedExt = ['jpg', 'png', 'webp'].includes(ext) ? ext : 'png';
  return fileName ? `ai-images/${fileName}.${normalizedExt}` : '';
}

function getImageMeta(buffer, contentType = '') {
  const meta = {
    width: 0,
    height: 0,
    format: getImageExtFromMime(contentType),
    bytes: buffer ? buffer.length : 0
  };

  if (!buffer || buffer.length < 24) {
    return meta;
  }

  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    meta.format = 'png';
    meta.width = buffer.readUInt32BE(16);
    meta.height = buffer.readUInt32BE(20);
    return meta;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    meta.format = 'jpg';
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset];
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        meta.height = buffer.readUInt16BE(offset + 3);
        meta.width = buffer.readUInt16BE(offset + 5);
        return meta;
      }
      offset += length;
    }
  }

  return meta;
}

function getEffectiveAiImagePrompt(data = {}) {
  const prompt = String(data.prompt || '').trim();
  if (prompt) return prompt;
  return data.mode === 'image' ? '请基于参考图生成一张高质量图片' : '';
}

function validateAiImagePromptLength(data = {}) {
  const prompt = String(data.prompt || '').trim();
  if (prompt.length > AI_IMAGE_PROMPT_MAX_LENGTH) {
    return `创作描述不能超过 ${AI_IMAGE_PROMPT_MAX_LENGTH} 字`;
  }
  return '';
}

function getEffectiveAiImageStyle(data = {}) {
  const style = String(data.style || '').trim();
  if (!style) return '';
  if (['none', '无', '不要', '不加风格', '无风格'].includes(style)) return '';
  return style;
}

function isAiImageLoadingStatus(status) {
  return ['queued', 'pending', 'in_progress', 'processing', 'running', 'submitted'].includes(status || '');
}

function getAiImageTaskExpireMs() {
  const value = Number(process.env.AI_IMAGE_TASK_EXPIRE_MS || process.env.AI_IMAGE_TASK_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : AI_IMAGE_TASK_EXPIRE_MS_DEFAULT;
}

function isAiImageRecordExpired(record = {}, now = Date.now()) {
  if (!record || !isAiImageLoadingStatus(record.status)) {
    return false;
  }

  const baseTime = Number(record.createdAt || record.updatedAt || 0);
  return baseTime > 0 && now - baseTime >= getAiImageTaskExpireMs();
}

function isExternalAiImageTaskMissingError(err) {
  const message = String(err && (err.message || err.errMsg || err.error || err.Message || err) || '');
  return (err && err.statusCode === 404) || message.includes('任务不存在') || message.includes('任务已失效');
}

function getAiImageRecordAgeMs(record = {}, now = Date.now()) {
  const baseTime = Number(record.createdAt || record.updatedAt || 0);
  return baseTime > 0 ? Math.max(0, now - baseTime) : 0;
}

function formatAiImageLogError(err) {
  if (!err) return null;
  const response = err.response && typeof err.response === 'object'
    ? {
        success: err.response.success,
        status: err.response.status,
        error: err.response.error,
        message: err.response.message
      }
    : undefined;

  return {
    message: String(err.message || err.errMsg || err.error || err.Message || err),
    statusCode: err.statusCode || err.status || '',
    code: err.code || '',
    response,
    responseText: err.responseText ? String(err.responseText).slice(0, 300) : '',
    stack: err.stack ? String(err.stack).split('\n').slice(0, 5).join('\n') : ''
  };
}

function hashAiImageLogValue(value) {
  const text = String(value || '');
  if (!text) return '';
  return nodeCrypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

function logAiImageError(event, details = {}, err = null) {
  const payload = {
    event,
    ...details
  };
  if (err) {
    payload.error = formatAiImageLogError(err);
  }
  console.error('[ai-image]', payload);
}

function logAiImageWarn(event, details = {}, err = null) {
  const payload = {
    event,
    ...details
  };
  if (err) {
    payload.error = formatAiImageLogError(err);
  }
  console.warn('[ai-image]', payload);
}

async function markAiImageRecordFailed(record, errorText, now = Date.now()) {
  if (!record || !record._id) {
    return record;
  }

  const error = getAiImageErrorText(errorText);
  const rawError = String(errorText && (errorText.message || errorText.errMsg || errorText.error || errorText.Message || errorText) || '');
  const updates = {
    status: 'failed',
    error,
    errorDetail: rawError.slice(0, 500),
    images: syncImagesStatus(record.images, 'failed', error),
    updatedAt: now,
    failedAt: now
  };

  try {
    await db.collection('ai_image_generations').doc(record._id).update({ data: updates });
  } catch (err) {
    logAiImageWarn('mark-record-failed-update-error', {
      recordId: record._id,
      taskId: record.responseId || '',
      channelId: record.channelId || '',
      statusBefore: record.status || '',
      reason: error,
      ageMs: getAiImageRecordAgeMs(record, now)
    }, err);
  }

  await incrementAiImageChannelOutcome(record, 'failed');
  logAiImageError('record-marked-failed', {
    recordId: record._id,
    taskId: record.responseId || '',
    channelId: record.channelId || '',
    statusBefore: record.status || '',
    reason: error,
    errorDetail: rawError.slice(0, 500),
    ageMs: getAiImageRecordAgeMs(record, now),
    expireMs: getAiImageTaskExpireMs()
  });
  return { ...record, ...updates };
}

function getAiImageErrorText(error, fallback = '这次没有生成成功，请稍后重试，或换个描述/参考图再试') {
  const message = String(
    error && (error.message || error.errMsg || error.error || error.Message || error) || ''
  ).trim();
  return formatAiImageSharedErrorMessage(message, fallback, { scope: 'cloud' });
}

function normalizeAiImageChannelNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeAiImageChannel(item = {}) {
  return {
    _id: item._id || '',
    channelId: String(item.channelId || '').trim(),
    name: String(item.name || '').trim(),
    remark: String(item.remark || '').trim(),
    enabled: item.enabled !== false,
    isDefault: item.isDefault === true,
    callCount: normalizeAiImageChannelNumber(item.callCount, 0),
    successCount: normalizeAiImageChannelNumber(item.successCount, 0),
    failCount: normalizeAiImageChannelNumber(item.failCount, 0),
    createdAt: normalizeAiImageChannelNumber(item.createdAt, 0),
    updatedAt: normalizeAiImageChannelNumber(item.updatedAt, 0)
  };
}

async function getAiImageChannelByChannelId(channelId) {
  const value = String(channelId || '').trim();
  if (!value) {
    return null;
  }

  try {
    const docRes = await db.collection('ai_image_channels').doc(value).get();
    const doc = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
    if (doc && doc.channelId) {
      return normalizeAiImageChannel(doc);
    }
  } catch (err) {
    // 不是文档 _id 时继续按 channelId 查。
  }

  try {
    const res = await db.collection('ai_image_channels')
      .where({ channelId: value })
      .limit(1)
      .get();
    const doc = res.data && res.data[0] ? res.data[0] : null;
    return doc ? normalizeAiImageChannel(doc) : null;
  } catch (err) {
    console.warn('读取 AI 渠道失败:', err);
    return null;
  }
}

async function getDefaultAiImageChannel() {
  try {
    const defaultRes = await db.collection('ai_image_channels')
      .where({
        enabled: true,
        isDefault: true
      })
      .limit(1)
      .get();
    const defaultDoc = defaultRes.data && defaultRes.data[0] ? defaultRes.data[0] : null;
    if (defaultDoc) {
      return normalizeAiImageChannel(defaultDoc);
    }

    const res = await db.collection('ai_image_channels')
      .where({ enabled: true })
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();
    const doc = res.data && res.data[0] ? res.data[0] : null;
    return doc ? normalizeAiImageChannel(doc) : null;
  } catch (err) {
    console.warn('读取默认 AI 渠道失败:', err);
    return null;
  }
}

async function listAiImageChannels(includeDisabled = false) {
  try {
    const res = await db.collection('ai_image_channels')
      .orderBy('createdAt', 'asc')
      .get();
    const channels = (res.data || []).map(normalizeAiImageChannel);
    return includeDisabled ? channels : channels.filter(item => item.enabled !== false);
  } catch (err) {
    console.warn('读取 AI 渠道列表失败:', err);
    return [];
  }
}

async function resolveAiImageChannel(channelId) {
  const value = String(channelId || '').trim();
  if (value) {
    return await getAiImageChannelByChannelId(value);
  }

  return await getDefaultAiImageChannel();
}

async function incrementAiImageChannelCallCount(channelId) {
  const channel = await resolveAiImageChannel(channelId);
  if (!channel || !channel._id) return false;

  try {
    await db.collection('ai_image_channels').doc(channel._id).update({
      data: {
        callCount: _.inc(1),
        updatedAt: Date.now()
      }
    });
    return true;
  } catch (err) {
    console.warn('更新 AI 渠道调用次数失败:', err);
    return false;
  }
}

async function incrementAiImageChannelOutcome(record, outcome) {
  if (!record || !record._id || !record.channelId || record.channelCountedAt) {
    return false;
  }

  const field = outcome === 'completed' ? 'successCount' : (outcome === 'failed' ? 'failCount' : '');
  if (!field) return false;

  const channel = await resolveAiImageChannel(record.channelId);
  if (!channel || !channel._id) return false;

  const now = Date.now();
  try {
    await db.collection('ai_image_channels').doc(channel._id).update({
      data: {
        [field]: _.inc(1),
        updatedAt: now
      }
    });
    await db.collection('ai_image_generations').doc(record._id).update({
      data: {
        channelCountedAt: now,
        channelCountedStatus: outcome,
        updatedAt: now
      }
    });
    return true;
  } catch (err) {
    console.warn('更新 AI 渠道结果次数失败:', err);
    return false;
  }
}

function normalizeAiImageUrl(url) {
  if (!url) return '';
  const value = String(url).trim();
  if (!value) return '';
  if (value.startsWith('https://') || value.startsWith('http://') || value.startsWith('cloud://')) {
    return value;
  }
  if (value.startsWith('//')) {
    return `https:${value}`;
  }
  if (value.includes('.') && value.includes('/')) {
    return `https://${value}`;
  }
  return value;
}

function normalizeAiImageItem(image = {}, fallback = {}) {
  const key = image.key || image.fileID || '';
  const cloudPath = image.cloudPath || (key.startsWith('cloud://') ? key.replace(/^cloud:\/\/[^/]+\//, '') : '');
  const derivedPublicUrl = cloudPath ? buildAiImagePublicUrl(cloudPath, key) : '';
  const publicUrl = normalizeAiImageUrl(
    image.publicUrl ||
    image.publicURL ||
    image.url ||
    image.imageUrl ||
    image.tempFileURL ||
    image.signedURL ||
    image.signedUrl ||
    derivedPublicUrl ||
    ''
  );
  const status = image.status || fallback.status || (publicUrl ? 'completed' : 'queued');

  return {
    id: image.id || image.imageId || `${fallback.taskId || ''}_0`,
    status,
    key,
    fileID: key,
    cloudPath,
    publicUrl,
    width: image.width || 0,
    height: image.height || 0,
    format: image.format || '',
    bytes: image.bytes || 0,
    error: image.error ? getAiImageErrorText(image.error) : ''
  };
}

function buildInitialAiImages(task = {}) {
  return [normalizeAiImageItem({}, {
    taskId: task.taskId,
    status: task.status || 'queued'
  })];
}

function buildCompletedAiImages(image, taskId) {
  return [normalizeAiImageItem({
    id: `${taskId || Date.now()}_0`,
    status: 'completed',
    key: image.fileID || image.key || '',
    fileID: image.fileID || image.key || '',
    cloudPath: image.cloudPath || '',
    publicUrl: image.publicUrl || image.publicURL || '',
    width: image.width || 0,
    height: image.height || 0,
    format: image.format || '',
    bytes: image.bytes || 0
  }, { status: 'completed', taskId })];
}

function buildAiImageStatusImageFromRecord(record = {}) {
  const first = normalizeAiImageItem((record.images && record.images[0]) || {}, {
    taskId: record.responseId,
    status: record.status || 'completed'
  });
  return {
    fileID: first.fileID || first.key || '',
    cloudPath: first.cloudPath || '',
    tempFileURL: first.publicUrl || '',
    publicURL: first.publicUrl || '',
    signedURL: first.publicUrl || '',
    width: first.width || 0,
    height: first.height || 0,
    format: first.format || '',
    bytes: first.bytes || 0
  };
}

function hasStoredAiImageFile(record = {}) {
  const first = record.images && record.images[0] ? record.images[0] : {};
  return Boolean(normalizeAiImageCloudFileID(first.fileID || first.key || first.cloudPath || ''));
}

function syncImagesStatus(images, status, error) {
  const list = images && images.length ? images : [normalizeAiImageItem({}, { status })];
  return list.map((image, index) => normalizeAiImageItem({
    ...image,
    id: image.id || `image_${index}`,
    status,
    error: status === 'failed' ? (error || image.error || '生成失败') : image.error
  }, { status }));
}

async function getAiImageReferenceTempFileURL(referenceFileID) {
  const fileID = String(referenceFileID || '').trim();
  if (!fileID) {
    throw new Error('参考图片不能为空');
  }

  let urlRes;
  try {
    urlRes = await cloud.getTempFileURL({ fileList: [fileID] });
  } catch (err) {
    const error = new Error(`参考图读取失败：${err.message || err.errMsg || err}`);
    error.cause = err;
    throw error;
  }

  const file = urlRes.fileList && urlRes.fileList[0] ? urlRes.fileList[0] : null;
  const tempUrl = file && file.tempFileURL ? normalizeAiImageUrl(file.tempFileURL) : '';
  if (!tempUrl) {
    const reason = file && (file.errMsg || file.status) ? `${file.status || ''} ${file.errMsg || ''}`.trim() : '未返回临时 URL';
    throw new Error(`参考图读取失败：${reason}`);
  }

  return tempUrl;
}

async function createExternalAiImageTask(data, config, channelId = '') {
  const headers = {};
  if (config.serviceSecret) {
    headers['X-AI-Service-Secret'] = config.serviceSecret;
  }

  const payload = {
    mode: data.mode,
    prompt: getEffectiveAiImagePrompt(data),
    ratio: data.ratio,
    style: getEffectiveAiImageStyle(data),
    channelId: String(channelId || '').trim(),
  };

  if (data.mode === 'image') {
    payload.referenceImageUrl = await getAiImageReferenceTempFileURL(data.referenceFileID);
    let referenceHost = '';
    try {
      referenceHost = new URL(payload.referenceImageUrl).hostname;
    } catch (err) {
      referenceHost = '';
    }
    console.info('[ai-image]', {
      event: 'external-reference-prepared',
      channelId: String(channelId || '').trim(),
      fileIDHash: hashAiImageLogValue(data.referenceFileID),
      referenceHost
    });
  }

  return await requestJsonUrl('POST', `${config.serviceUrl.replace(/\/$/, '')}/v1/ai-image/tasks`, payload, headers, 30000);
}

async function getExternalAiImageTask(taskId, config, channelId = '') {
  const headers = {};
  if (config.serviceSecret) {
    headers['X-AI-Service-Secret'] = config.serviceSecret;
  }

  const query = String(channelId || '').trim() ? `?channelId=${encodeURIComponent(String(channelId).trim())}` : '';
  return await requestJsonUrl('GET', `${config.serviceUrl.replace(/\/$/, '')}/v1/ai-image/tasks/${encodeURIComponent(taskId)}${query}`, null, headers, 20000);
}

function getAiImageSourceUrl(image = {}) {
  return normalizeAiImageUrl(
    image.publicUrl ||
    image.publicURL ||
    image.tempFileURL ||
    image.signedURL ||
    image.signedUrl ||
    image.url ||
    image.imageUrl ||
    ''
  );
}

async function getAiImageCloudPublicUrl(fileID, cloudPath) {
  const publicUrl = buildAiImagePublicUrl(cloudPath, fileID);
  if (publicUrl) return publicUrl;

  try {
    const urlRes = await cloud.getTempFileURL({ fileList: [fileID] });
    const file = urlRes.fileList && urlRes.fileList[0] ? urlRes.fileList[0] : null;
    return file && file.tempFileURL ? normalizeAiImageUrl(file.tempFileURL) : '';
  } catch (err) {
    return '';
  }
}

async function storeGeneratedAiImageToCloud(responseId, image = {}) {
  const sourceUrl = getAiImageSourceUrl(image);
  if (!sourceUrl || sourceUrl.startsWith('cloud://')) {
    throw new Error('生成图片 URL 为空，无法保存到云存储');
  }

  const downloaded = await downloadAiImageBinary(sourceUrl);
  const fallbackExt = getFileExt(sourceUrl);
  const contentType = getMimeTypeFromImageBuffer(downloaded.buffer, fallbackExt) || downloaded.contentType || 'image/png';
  const ext = getImageExtFromMime(contentType);
  const cloudPath = buildAiImageGeneratedCloudPath(responseId, ext);
  if (!cloudPath) {
    throw new Error('生成图片云存储路径为空');
  }

  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent: downloaded.buffer
  });
  const fileID = uploadRes.fileID || buildAiImageCloudFileID(cloudPath);
  const publicUrl = await getAiImageCloudPublicUrl(fileID, cloudPath);

  return {
    ...image,
    fileID,
    key: fileID,
    cloudPath,
    publicUrl,
    publicURL: publicUrl,
    tempFileURL: publicUrl,
    signedURL: publicUrl,
    ...getImageMeta(downloaded.buffer, contentType)
  };
}

async function completeAiImageRecord(openid, record, responseId, image, extraUpdates = {}) {
  let completedImage = image;
  let charged = false;

  if (!record || !record._id) {
    return { image: completedImage, charged };
  }

  const now = Date.now();
  const sourceUpdates = {
    status: 'completed',
    images: buildCompletedAiImages(image, responseId),
    ...extraUpdates,
    completedAt: now,
    updatedAt: now
  };

  if (record.chargedAt) {
    try {
      await db.collection('ai_image_generations').doc(record._id).update({ data: sourceUpdates });
    } catch (err) {
      logAiImageWarn('complete-record-source-update-failed', {
        recordId: record._id,
        taskId: responseId,
        channelId: record.channelId || ''
      }, err);
    }
  } else {
    charged = await chargeAiImageRecordOnce(openid, record, sourceUpdates);
  }

  try {
    completedImage = await storeGeneratedAiImageToCloud(responseId, image);
    await db.collection('ai_image_generations').doc(record._id).update({
      data: {
        images: buildCompletedAiImages(completedImage, responseId),
        updatedAt: Date.now()
      }
    });
  } catch (err) {
    logAiImageWarn('generated-image-store-failed', {
      recordId: record._id,
      taskId: responseId,
      channelId: record.channelId || '',
      sourceUrlHost: (() => {
        try {
          return new URL(getAiImageSourceUrl(image)).hostname;
        } catch (e) {
          return '';
        }
      })()
    }, err);
  }

  completedImage.charged = charged;
  return { image: completedImage, charged };
}

async function aiImageGenerate(openid, data = {}) {
  const config = getOpenAIConfig();
  const { imageModel } = config;
  const requestedChannelId = String(data.channelId || '').trim();
  const channel = requestedChannelId ? await resolveAiImageChannel(requestedChannelId) : await getDefaultAiImageChannel();
  const channelId = channel && channel.channelId ? channel.channelId : requestedChannelId;
  const channelName = channel && channel.name ? channel.name : String(data.channelName || '').trim();

  if (!config.serviceUrl) {
    return { success: false, error: '未配置 AI_IMAGE_SERVICE_URL' };
  }

  if (requestedChannelId && (!channel || channel.enabled === false)) {
    return { success: false, error: '渠道不存在或已停用' };
  }

  if (data.mode === 'text' && !getEffectiveAiImagePrompt(data)) {
    return { success: false, error: '创作描述不能为空' };
  }

  const promptError = validateAiImagePromptLength(data);
  if (promptError) {
    return { success: false, error: promptError };
  }

  if (!['text', 'image'].includes(data.mode)) {
    return { success: false, error: '生成模式不正确' };
  }

  if (data.mode === 'image' && !data.referenceFileID) {
    return { success: false, error: '参考图片不能为空' };
  }

  const aiImageUserId = openid || 'anonymous';
  const [summary, pendingRes] = await Promise.all([
    getAiImageSummaryData(openid),
    db.collection('ai_image_generations')
      .where({
        userId: aiImageUserId,
        status: _.in(['queued', 'pending', 'in_progress', 'processing', 'running', 'submitted']),
        createdAt: _.gte(Date.now() - 15 * 60 * 1000)
      })
      .count()
  ]);
  const pendingCount = pendingRes.total || 0;
  const effectiveRemaining = summary.remaining - pendingCount;
  if (effectiveRemaining <= 0) {
    return { success: false, error: 'AI 生图次数已用完' };
  }

  let serviceRes;
  try {
    serviceRes = await createExternalAiImageTask(data, config, channelId);
  } catch (err) {
    logAiImageError('external-create-failed', {
      userId: openid || 'anonymous',
      channelId,
      channelName,
      mode: data.mode,
      ratio: data.ratio || '',
      style: getEffectiveAiImageStyle(data),
      promptLength: getEffectiveAiImagePrompt(data).length,
      hasReference: Boolean(data.referenceFileID),
      referenceFileIDHash: hashAiImageLogValue(data.referenceFileID),
      serviceUrl: config.serviceUrl.replace(/\/$/, '')
    }, err);
    return { success: false, error: getAiImageErrorText(err, '提交 AI 生图任务失败，请查看后台日志') };
  }

  const record = await recordAiImageTask(openid, data, {
    taskId: serviceRes.taskId,
    status: serviceRes.status || 'queued',
    model: imageModel,
    external: true,
    channelId,
    channelName
  });
  console.info('[ai-image]', {
    event: 'external-task-created',
    userId: openid || 'anonymous',
    recordId: record._id || '',
    taskId: serviceRes.taskId,
    status: serviceRes.status || 'queued',
    channelId,
    channelName,
    mode: data.mode,
    ratio: data.ratio || '',
    serviceChannelId: serviceRes.channelId || ''
  });

  if (channelId) {
    await incrementAiImageChannelCallCount(channelId);
  }

  return {
    success: true,
    taskId: serviceRes.taskId,
    status: serviceRes.status || 'queued',
    model: imageModel,
    channelId,
    channelName,
    external: true,
    quota: await getAiImageSummaryData(openid)
  };
}

async function aiImageStatus(openid, data = {}) {
  const config = getOpenAIConfig();
  const { imageModel } = config;
  const responseId = data.taskId || data.responseId;

  if (!config.serviceUrl) {
    return { success: false, error: '未配置 AI_IMAGE_SERVICE_URL' };
  }

  if (!responseId) {
    return { success: false, error: '任务ID不能为空' };
  }

  let record = null;
  try {
    const recordRes = await db.collection('ai_image_generations').where({ responseId }).limit(1).get();
    record = recordRes.data && recordRes.data[0] ? recordRes.data[0] : null;
  } catch (err) {
    console.warn('读取 AI 生图记录失败:', err);
  }

  const recordChannelId = String((record && record.channelId) || data.channelId || '').trim();
  const recordForOutcome = record && record._id ? { ...record, channelId: recordChannelId } : null;

  if (record && record.status === 'completed' && hasStoredAiImageFile(record)) {
    let charged = false;
    if (!record.chargedAt) {
      charged = await chargeAiImageRecordOnce(openid, record);
    }
    if (recordForOutcome) {
      await incrementAiImageChannelOutcome(recordForOutcome, 'completed');
    }
    return {
      success: true,
      status: 'completed',
      image: buildAiImageStatusImageFromRecord(record),
      model: record.model || imageModel,
      channelId: recordChannelId,
      charged
    };
  }

  let serviceRes;
  try {
    serviceRes = await getExternalAiImageTask(responseId, config, recordChannelId);
  } catch (err) {
    logAiImageError('external-status-query-failed', {
      taskId: responseId,
      recordId: record && record._id ? record._id : '',
      userId: openid || 'anonymous',
      channelId: recordChannelId,
      recordStatus: record && record.status ? record.status : '',
      ageMs: record ? getAiImageRecordAgeMs(record) : 0,
      expireMs: getAiImageTaskExpireMs(),
      missingTask: isExternalAiImageTaskMissingError(err),
      expired: recordForOutcome ? isAiImageRecordExpired(recordForOutcome) : false
    }, err);
    if (isExternalAiImageTaskMissingError(err)) {
      const failedRecord = recordForOutcome
        ? await markAiImageRecordFailed(recordForOutcome, '生成任务已失效，请重新提交')
        : { error: getAiImageErrorText('生成任务已失效，请重新提交') };
      return {
        success: false,
        status: 'failed',
        channelId: recordChannelId,
        error: failedRecord.error
      };
    }
    if (recordForOutcome && isAiImageRecordExpired(recordForOutcome)) {
      const failedRecord = await markAiImageRecordFailed(recordForOutcome, '生成任务超时，请重新提交');
      return {
        success: false,
        status: 'failed',
        channelId: recordChannelId,
        error: failedRecord.error
      };
    }
    return { success: false, error: getAiImageErrorText(err, '当前渠道已满，请换个渠道后再试') };
  }

  if (serviceRes.status === 'failed') {
    logAiImageError('external-task-returned-failed', {
      taskId: responseId,
      providerTaskId: serviceRes.providerTaskId || serviceRes.responseId || '',
      recordId: record && record._id ? record._id : '',
      userId: openid || 'anonymous',
      channelId: recordChannelId,
      recordStatus: record && record.status ? record.status : '',
      serviceStatus: serviceRes.status,
      serviceStage: serviceRes.stage || '',
      ageMs: record ? getAiImageRecordAgeMs(record) : 0,
      serviceError: serviceRes.error || '',
      serviceErrorDetail: serviceRes.errorDetail || ''
    });
    if (recordForOutcome) {
      await markAiImageRecordFailed(recordForOutcome, serviceRes.error || '生成失败');
    }
    return {
      success: false,
      status: 'failed',
      channelId: recordChannelId,
      error: getAiImageErrorText(serviceRes.error)
    };
  }

  if (serviceRes.status === 'completed') {
    const image = {
      fileID: serviceRes.image && serviceRes.image.key ? serviceRes.image.key : '',
      tempFileURL: serviceRes.image && (serviceRes.image.signedUrl || serviceRes.image.url) ? (serviceRes.image.signedUrl || serviceRes.image.url) : '',
      publicURL: serviceRes.image && serviceRes.image.url ? serviceRes.image.url : '',
      signedURL: serviceRes.image && serviceRes.image.signedUrl ? serviceRes.image.signedUrl : '',
      width: serviceRes.image && serviceRes.image.width ? serviceRes.image.width : 0,
      height: serviceRes.image && serviceRes.image.height ? serviceRes.image.height : 0,
      format: serviceRes.image && serviceRes.image.format ? serviceRes.image.format : '',
      bytes: serviceRes.image && serviceRes.image.bytes ? serviceRes.image.bytes : 0
    };
    let charged = false;

    if (record && record._id) {
      const completeRes = await completeAiImageRecord(openid, record, responseId, image);
      image.fileID = completeRes.image.fileID || completeRes.image.key || '';
      image.cloudPath = completeRes.image.cloudPath || '';
      image.tempFileURL = completeRes.image.tempFileURL || completeRes.image.publicUrl || completeRes.image.publicURL || image.tempFileURL;
      image.publicURL = completeRes.image.publicUrl || completeRes.image.publicURL || image.publicURL;
      image.signedURL = completeRes.image.signedURL || completeRes.image.signedUrl || image.signedURL;
      image.width = completeRes.image.width || image.width;
      image.height = completeRes.image.height || image.height;
      image.format = completeRes.image.format || image.format;
      image.bytes = completeRes.image.bytes || image.bytes;
      charged = completeRes.charged;
    }

    if (recordForOutcome) {
      await incrementAiImageChannelOutcome(recordForOutcome, 'completed');
    }

    return {
      success: true,
      status: 'completed',
      image,
      model: imageModel,
      channelId: recordChannelId,
      charged
    };
  }

  if (recordForOutcome && isAiImageRecordExpired(recordForOutcome)) {
    logAiImageError('external-task-expired', {
      taskId: responseId,
      recordId: recordForOutcome._id,
      userId: openid || 'anonymous',
      channelId: recordChannelId,
      recordStatus: recordForOutcome.status || '',
      serviceStatus: serviceRes.status || '',
      serviceStage: serviceRes.stage || '',
      ageMs: getAiImageRecordAgeMs(recordForOutcome),
      expireMs: getAiImageTaskExpireMs()
    });
    const failedRecord = await markAiImageRecordFailed(recordForOutcome, '生成任务超时，请重新提交');
    return {
      success: false,
      status: 'failed',
      channelId: recordChannelId,
      error: failedRecord.error
    };
  }

  return {
    success: true,
    status: serviceRes.status || 'queued',
    taskId: responseId,
    channelId: recordChannelId
  };
}

async function ensureAiImageQuota(openid) {
  const userId = openid || 'anonymous';
  const res = await db.collection('ai_image_quotas').where({ userId }).limit(1).get();

  if (res.data && res.data[0]) {
    const quota = res.data[0];
    if (!quota.appUserId || !quota.nickname || !quota.phoneMask) {
      const userInfo = await getAiImageQuotaUserInfo(userId);
      const patch = getAiImageQuotaUserInfoPatch(quota, userInfo);
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = Date.now();
        try {
          await db.collection('ai_image_quotas').doc(quota._id).update({ data: patch });
          return { ...quota, ...patch };
        } catch (err) {
          console.warn('同步 AI 生图额度用户信息失败:', err);
        }
      }
    }
    return quota;
  }

  const userInfo = await getAiImageQuotaUserInfo(userId);
  const quota = {
    userId,
    ...userInfo,
    total: AI_IMAGE_FREE_QUOTA,
    used: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const addRes = await db.collection('ai_image_quotas').add({ data: quota });
  quota._id = addRes._id;
  return quota;
}

async function getAiImageQuotaUserInfo(userId) {
  if (!userId || userId === 'anonymous') {
    return buildAiImageQuotaUserInfo();
  }

  try {
    const userRes = await db.collection('users').where(
      _.or(
        { openid: userId },
        { userId },
        { phone: userId },
        { phoneMask: userId }
      )
    ).limit(1).get();

    const user = userRes.data && userRes.data[0] ? userRes.data[0] : null;
    return user ? buildAiImageQuotaUserInfo(user) : buildAiImageQuotaUserInfo();
  } catch (err) {
    console.warn('读取 AI 生图额度用户信息失败:', err);
    return buildAiImageQuotaUserInfo();
  }
}

async function syncAiImageQuotaUserInfo(userId, user) {
  const quotaUserId = userId || (user && user.openid) || '';
  if (!quotaUserId || quotaUserId === 'anonymous') return;

  try {
    const userInfo = user ? buildAiImageQuotaUserInfo(user) : await getAiImageQuotaUserInfo(quotaUserId);
    if (!hasAiImageQuotaUserInfo(userInfo)) return;

    const quotaRes = await db.collection('ai_image_quotas')
      .where({ userId: quotaUserId })
      .limit(1)
      .get();
    const quota = quotaRes.data && quotaRes.data[0] ? quotaRes.data[0] : null;
    if (!quota || !quota._id) return;

    const patch = getAiImageQuotaUserInfoPatch(quota, userInfo);
    if (Object.keys(patch).length === 0) return;

    await db.collection('ai_image_quotas').doc(quota._id).update({
      data: {
        ...patch,
        updatedAt: Date.now()
      }
    });
  } catch (err) {
    console.warn('同步 AI 生图额度用户信息失败:', err);
  }
}

async function incrementAiImageUsage(openid) {
  const quota = await ensureAiImageQuota(openid);
  await db.collection('ai_image_quotas').doc(quota._id).update({
    data: {
      used: _.inc(1),
      updatedAt: Date.now()
    }
  });
  return { ...quota, used: normalizeAiImageQuotaNumber(quota.used, 0) + 1 };
}

async function markAiImageRecordCharged(record, updates = {}) {
  if (!record || !record._id || record.chargedAt) {
    return false;
  }

  const now = updates.chargedAt || Date.now();
  const data = {
    ...updates,
    chargedAt: now,
    updatedAt: updates.updatedAt || now
  };

  try {
    const updateRes = await db.collection('ai_image_generations')
      .where(_.or(
        { _id: record._id, chargedAt: _.exists(false) },
        { _id: record._id, chargedAt: null },
        { _id: record._id, chargedAt: '' }
      ))
      .update({ data });
    return Boolean(updateRes.stats && updateRes.stats.updated > 0);
  } catch (err) {
    console.warn('标记 AI 生图扣次失败:', err);
    return false;
  }
}

async function chargeAiImageRecordOnce(openid, record, updates = {}) {
  const marked = await markAiImageRecordCharged(record, updates);
  if (!marked) {
    return false;
  }

  await incrementAiImageUsage(openid);
  return true;
}

async function getAiImageSummaryData(openid) {
  const quota = await ensureAiImageQuota(openid);
  const userId = openid || 'anonymous';
  const generatedRes = await db.collection('ai_image_generations')
    .where({ userId, status: 'completed' })
    .count();
  const total = normalizeAiImageQuotaNumber(quota.total);
  const used = normalizeAiImageQuotaNumber(quota.used, 0);
  const generatedCount = generatedRes.total || 0;

  if (quota.used !== used || quota.total !== total) {
    try {
      await db.collection('ai_image_quotas').doc(quota._id).update({
        data: {
          total,
          used,
          updatedAt: Date.now()
        }
      });
    } catch (err) {
      console.warn('同步 AI 生图额度失败:', err);
    }
  }

  return {
    total,
    used,
    remaining: Math.max(0, total - used),
    generatedCount
  };
}

async function aiImageSummary(openid) {
  return {
    success: true,
    summary: await getAiImageSummaryData(openid)
  };
}

function normalizeAiImagePackage(item = {}) {
  const pricing = getAiImagePackagePricing(item);
  return {
    id: item.packageId || item._id || '',
    _id: item._id || '',
    packageId: item.packageId || '',
    title: item.title || '',
    desc: item.desc || '',
    price: pricing.discountedPrice,
    originalPrice: pricing.originalPrice,
    discountedPrice: pricing.discountedPrice,
    beforePrice: pricing.originalPrice,
    afterPrice: pricing.discountedPrice,
    discount: pricing.discount,
    hasDiscount: pricing.hasDiscount,
    priceText: pricing.priceText,
    originalPriceText: pricing.originalPriceText,
    discountText: pricing.discountText,
    imageCount: typeof item.imageCount === 'number' ? item.imageCount : 0,
    badge: item.badge || '',
    sort: typeof item.sort === 'number' ? item.sort : 0,
    enabled: item.enabled !== false
  };
}

// ==================== WeChat Virtual Payment ====================

const WXVPAY_APPID = process.env.WXVPAY_APPID || '';
const WXVPAY_OFFER_ID = process.env.WXVPAY_OFFER_ID || '';
const WXVPAY_ENV_SANDBOX = 1;
const WXVPAY_ENV_PROD = 0;

// 云函数环境变量 WXPAY_ENV=live 时走正式，否则走沙箱
function getWxVPayEnv() {
  return process.env.WXPAY_ENV === 'live' ? WXVPAY_ENV_PROD : WXVPAY_ENV_SANDBOX;
}

function getWxVPayAppKey() {
  return getWxVPayEnv() === WXVPAY_ENV_PROD
    ? (process.env.WXPAY_LIVE_KEY || '')
    : (process.env.WXPAY_SANDBOX_KEY || '');
}

// 按订单创建时记录的 payEnv 选 key，避免环境变量切换后旧订单用错 key
function getWxVPayAppKeyByEnv(payEnv) {
  return payEnv === WXVPAY_ENV_PROD
    ? (process.env.WXPAY_LIVE_KEY || '')
    : (process.env.WXPAY_SANDBOX_KEY || '');
}

// 官方 env_type: 1=现网, 2=沙箱；本地 payEnv: 0=现网, 1=沙箱
function getWxOrderEnvType(payEnv) {
  return payEnv === WXVPAY_ENV_PROD ? 1 : 2;
}

function hmacSha256Hex(key, message) {
  return nodeCrypto.createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

// paySig    = HMAC-SHA256(appKey,    "requestVirtualPayment&" + signDataString)
// signature = HMAC-SHA256(sessionKey, signDataString)
function createVirtualPaymentSign({ signDataString, appKey, sessionKey }) {
  const paySigSource = `requestVirtualPayment&${signDataString}`;
  const paySig = hmacSha256Hex(appKey, paySigSource);
  const signature = hmacSha256Hex(sessionKey, signDataString);
  return { paySig, signature };
}

// 用 wx.login() 返回的 code 换取 session_key（一次性，不可复用）
async function wxJsCode2Session(code) {
  if (!WXVPAY_APPID) throw new Error('WXVPAY_APPID 未配置');
  const appSecret = process.env.WX_APP_SECRET || '';
  if (!appSecret) throw new Error('WX_APP_SECRET 未配置');
  const res = await requestJsonUrl(
    'GET',
    `https://api.weixin.qq.com/sns/jscode2session?appid=${WXVPAY_APPID}&secret=${appSecret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`,
    null, {}, 10000
  );
  if (res.errcode) throw new Error(`jscode2session 失败(${res.errcode}): ${res.errmsg}`);
  if (!res.session_key) throw new Error('jscode2session 未返回 session_key');
  return res; // { openid, session_key, unionid? }
}

// 获取 access_token（需云函数环境变量 WX_APP_SECRET）
async function getWxAccessToken() {
  if (!WXVPAY_APPID) throw new Error('WXVPAY_APPID 未配置');
  const appSecret = process.env.WX_APP_SECRET || '';
  if (!appSecret) throw new Error('WX_APP_SECRET 未配置，无法验证支付');
  const res = await requestJsonUrl(
    'GET',
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WXVPAY_APPID}&secret=${appSecret}`,
    null, {}, 10000
  );
  if (!res.access_token) throw new Error(`获取 access_token 失败: ${res.errmsg || JSON.stringify(res)}`);
  return res.access_token;
}

// 服务端接口签名：HMAC-SHA256(appKey, "/xpay/{path}&" + JSON.stringify(body))
// body 必须与实际发送的请求体完全一致
function xpayServerSign(appKey, path, body) {
  return hmacSha256Hex(appKey, `${path}&${JSON.stringify(body)}`);
}

// 查询虚拟支付订单
// 官方文档: api_query_order —— body: { openid, env, order_id }
// URL 附带 access_token 和 pay_sig
async function queryXpayOrder({ accessToken, appKey, openid, env, orderNo }) {
  const body = { openid, env, order_id: orderNo };
  const paySig = xpayServerSign(appKey, '/xpay/query_order', body);
  const res = await requestJsonUrl(
    'POST',
    `https://api.weixin.qq.com/xpay/query_order?access_token=${accessToken}&pay_sig=${paySig}`,
    body, {}, 10000
  );
  return res;
}

// 通知微信道具已发货，完成订单闭环
// 官方文档: api_notify_provide_goods —— body: { order_id, env }
async function notifyProvideGoods({ accessToken, appKey, orderNo, env }) {
  const body = { order_id: orderNo, env };
  const paySig = xpayServerSign(appKey, '/xpay/notify_provide_goods', body);
  const res = await requestJsonUrl(
    'POST',
    `https://api.weixin.qq.com/xpay/notify_provide_goods?access_token=${accessToken}&pay_sig=${paySig}`,
    body, {}, 10000
  );
  return res;
}

async function aiImageCreatePayOrder(openid, data = {}) {
  const userId = openid || 'anonymous';
  if (!userId || userId === 'anonymous') {
    return { success: false, error: '请先登录' };
  }

  const { loginCode } = data;
  if (!loginCode) {
    return { success: false, error: '登录凭证缺失，请重新进入小程序' };
  }

  // 用 code 换 session_key，每次 wx.login() 的 code 只能用一次
  let sessionKey;
  try {
    const sessionRes = await wxJsCode2Session(loginCode);
    // 校验 openid 一致性，防止 code 被盗用
    if (sessionRes.openid && sessionRes.openid !== userId) {
      console.error('[aiImageCreatePayOrder] openid mismatch:', sessionRes.openid, userId);
      return { success: false, error: '用户身份验证失败' };
    }
    sessionKey = sessionRes.session_key;
  } catch (err) {
    console.error('[aiImageCreatePayOrder] jscode2session failed:', err.message);
    return { success: false, error: `登录态获取失败: ${err.message}` };
  }

  const payEnv = getWxVPayEnv();
  const appKey = getWxVPayAppKey();
  if (!appKey) {
    return { success: false, error: '支付配置缺失，请联系管理员' };
  }

  const pack = await getAiImagePackageById(data.packageId);
  if (!pack || pack.enabled === false) {
    return { success: false, error: '套餐不存在或已下架' };
  }

  const imageCount = Number(pack.imageCount || 0);
  if (!imageCount || imageCount <= 0) {
    return { success: false, error: '套餐图片数量配置不正确' };
  }

  if (!WXVPAY_OFFER_ID) {
    return { success: false, error: '支付 OfferID 未配置，请联系管理员' };
  }

  // productId 必须来自数据库套餐配置，不允许 fallback
  const productId = String(pack.productId || '').trim();
  if (!productId) {
    return { success: false, error: '套餐道具 ID 未配置，请联系管理员' };
  }

  const quota = await ensureAiImageQuota(userId);
  const beforeTotal = normalizeAiImageQuotaNumber(quota.total);
  const beforeUsed = normalizeAiImageQuotaNumber(quota.used, 0);
  const beforeRemaining = Math.max(0, beforeTotal - beforeUsed);

  // 预算充值后的目标值，写入订单供 confirmPayment 使用
  // 剩余=0：重置（total=购买量, used=0）；剩余>0：叠加（total累加, used不变）
  const afterTotal = beforeRemaining === 0 ? imageCount : beforeTotal + imageCount;
  const afterUsed = beforeRemaining === 0 ? 0 : beforeUsed;

  const pricing = getAiImagePackagePricing(pack);
  const goodsPrice = Math.round(pricing.discountedPrice * 100); // 元 → 分
  if (!goodsPrice || goodsPrice <= 0) {
    return { success: false, error: '套餐价格配置不正确' };
  }

  const now = Date.now();
  const orderNo = createAiImageOrderNo(now);
  const userInfo = {
    appUserId: quota.appUserId || '',
    nickname: quota.nickname || '',
    phone: quota.phone || '',
    phoneMask: quota.phoneMask || '',
    avatar: quota.avatar || ''
  };

  await db.collection('ai_image_orders').add({
    data: {
      orderNo,
      userId,
      ...userInfo,
      packageId: pack._id,
      packageKey: pack.packageId || '',
      title: pack.title || '',
      price: pricing.discountedPrice,
      originalPrice: pricing.originalPrice,
      discount: pricing.discount,
      discountedPrice: pricing.discountedPrice,
      beforePrice: pricing.originalPrice,
      afterPrice: pricing.discountedPrice,
      imageCount,
      beforeTotal,
      beforeUsed,
      beforeRemaining,
      afterTotal,
      afterUsed,
      afterRemaining: afterTotal - afterUsed,
      productId,
      goodsPrice,
      payEnv,
      status: 'pending_payment',
      payType: payEnv === WXVPAY_ENV_PROD ? 'virtual_live' : 'virtual_sandbox',
      createdAt: now,
      paidAt: 0
    }
  });

  // 字段顺序固定，保证后端签名用的字符串与传给前端的逐字一致
  const signDataString = JSON.stringify({
    offerId: WXVPAY_OFFER_ID,
    buyQuantity: 1,
    env: payEnv,
    currencyType: 'CNY',
    productId,
    goodsPrice,
    outTradeNo: orderNo,
    attach: pack.title || 'AI生图套餐'
  });

  const { paySig, signature } = createVirtualPaymentSign({ signDataString, appKey, sessionKey });

  return { success: true, orderNo, signData: signDataString, paySig, signature };
}

async function aiImageConfirmPayment(openid, data = {}) {
  const userId = openid || 'anonymous';
  const { orderNo } = data;

  if (!orderNo) {
    return { success: false, error: '订单号不能为空' };
  }

  const now = Date.now();

  // ── Step 1: 原子抢占订单 ──────────────────────────────────────────────────
  // 将 pending_payment → confirming_payment，同一订单只有第一个并发请求能成功。
  // 后续重复调用（网络重试、用户多次点击）会因 status 不匹配而 updated=0，直接拒绝。
  const claimRes = await db.collection('ai_image_orders')
    .where({ orderNo, userId, status: 'pending_payment' })
    .update({ data: { status: 'confirming_payment', confirmingAt: now } });

  if (!claimRes.stats || claimRes.stats.updated <= 0) {
    return { success: false, error: '订单不存在、已处理或处理中，请勿重复提交' };
  }

  // rollback helper：可重试的失败（微信查询报错、额度冲突）回滚为 pending_payment，
  // 让用户稍后重试；不可逆错误（金额/环境不匹配）保持 confirming_payment 供人工核查。
  const rollbackOrder = () =>
    db.collection('ai_image_orders')
      .where({ orderNo, userId, status: 'confirming_payment' })
      .update({ data: { status: 'pending_payment', confirmingAt: 0 } })
      .catch(e => console.warn('[confirmPayment] rollback failed:', e.message));

  // ── Step 2: 读取完整订单数据 ──────────────────────────────────────────────
  const orderRes = await db.collection('ai_image_orders')
    .where({ orderNo, userId })
    .limit(1)
    .get();
  const order = orderRes.data && orderRes.data[0];
  if (!order) {
    // 极小概率：claim 成功但读取失败，回滚让用户重试
    await rollbackOrder();
    return { success: false, error: '订单读取失败，请联系客服' };
  }

  // ── Step 3: 按订单创建时的环境选 appKey ───────────────────────────────────
  const appKey = getWxVPayAppKeyByEnv(order.payEnv);
  if (!appKey) {
    await rollbackOrder();
    return { success: false, error: '支付配置缺失，请联系管理员' };
  }

  // ── Step 4: 查询微信侧订单状态 ───────────────────────────────────────────
  let accessToken;
  try {
    accessToken = await getWxAccessToken();
  } catch (err) {
    await rollbackOrder();
    return { success: false, error: `获取支付凭证失败: ${err.message}` };
  }

  let queryRes;
  try {
    queryRes = await queryXpayOrder({
      accessToken,
      appKey,
      openid: userId,
      env: order.payEnv,
      orderNo
    });
  } catch (err) {
    await rollbackOrder();
    return { success: false, error: `支付查询异常: ${err.message}` };
  }

  if (queryRes.errcode !== 0) {
    console.error('[aiImageConfirmPayment] query_order failed:', queryRes);
    await rollbackOrder();
    return { success: false, error: `支付查询失败(${queryRes.errcode}): ${queryRes.errmsg || ''}` };
  }

  const wxOrder = queryRes.order;
  if (!wxOrder) {
    await rollbackOrder();
    return { success: false, error: '微信侧订单不存在' };
  }

  // 官方状态: 1=创建成功(未付款) 2=已支付待发货 3=发货中 4=已发货
  // 只有 2/3/4 才算已付款，1 不能入账
  if (![2, 3, 4].includes(wxOrder.status)) {
    await rollbackOrder();
    return { success: false, error: `支付未完成，当前状态: ${wxOrder.status}` };
  }

  // 校验金额、类型、环境，防止错单入账（不回滚，留 confirming_payment 供人工核查）
  if (wxOrder.order_fee !== order.goodsPrice) {
    console.error('[aiImageConfirmPayment] fee mismatch:', { wx: wxOrder.order_fee, local: order.goodsPrice });
    return { success: false, error: '订单金额不匹配，请联系客服' };
  }
  if (![0, 7].includes(wxOrder.order_type)) {
    return { success: false, error: `订单类型异常: ${wxOrder.order_type}` };
  }
  const expectedEnvType = getWxOrderEnvType(order.payEnv);
  if (wxOrder.env_type !== expectedEnvType) {
    return { success: false, error: `订单环境不匹配: ${wxOrder.env_type} !== ${expectedEnvType}` };
  }

  // ── Step 5: 重新读取当前额度，计算充值后结果 ──────────────────────────────
  // 确认时重新读而非用下单时快照，避免"钱扣了没到账"（生成任务扣减、多笔订单并发等）
  const imageCount = order.imageCount || 0;
  const quota = await ensureAiImageQuota(userId);
  const currentTotal = normalizeAiImageQuotaNumber(quota.total);
  const currentUsed = normalizeAiImageQuotaNumber(quota.used, 0);
  const currentRemaining = Math.max(0, currentTotal - currentUsed);

  // 剩余=0：重置（total=购买量, used=0）；剩余>0：叠加（total累加, used不变）
  const newTotal = currentRemaining === 0 ? imageCount : currentTotal + imageCount;
  const newUsed = currentRemaining === 0 ? 0 : currentUsed;
  const newRemaining = newTotal - newUsed;

  // 乐观锁：锁当前值，防止同一时刻另一笔并发写入
  const quotaUpdateRes = await db.collection('ai_image_quotas')
    .where({ _id: quota._id, total: currentTotal, used: currentUsed })
    .update({ data: { total: newTotal, used: newUsed, updatedAt: now } });

  if (!quotaUpdateRes.stats || quotaUpdateRes.stats.updated <= 0) {
    await rollbackOrder();
    return { success: false, error: '额度更新冲突，请稍后重试' };
  }

  // ── Step 6: 标记订单 paid，写入实际到账数据供后台查账 ─────────────────────
  await db.collection('ai_image_orders')
    .where({ orderNo, userId, status: 'confirming_payment' })
    .update({
      data: {
        status: 'paid',
        paidAt: now,
        updatedAt: now,
        afterTotal: newTotal,
        afterUsed: newUsed,
        afterRemaining: newRemaining,
        orderType: wxOrder.order_type,
        wxOrderStatus: wxOrder.status,
        wxEnvType: wxOrder.env_type
      }
    });

  // 通知微信道具已发货，完成订单闭环（失败仅记录日志，不阻塞用户）
  notifyProvideGoods({ accessToken, appKey, orderNo, env: order.payEnv })
    .catch(err => console.warn('[notifyProvideGoods] failed:', err.message));

  return { success: true, summary: await getAiImageSummaryData(userId) };
}

// ==================== End WeChat Virtual Payment ====================

async function aiImagePackages() {
  try {
    const res = await db.collection('ai_image_packages')
      .where({ enabled: true })
      .orderBy('sort', 'asc')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return {
      success: true,
      packages: (res.data || []).map(normalizeAiImagePackage)
    };
  } catch (err) {
    console.warn('读取 AI 生图套餐失败:', err);
    return {
      success: true,
      packages: []
    };
  }
}

async function getAiImagePackageById(packageId) {
  if (!packageId) return null;

  try {
    const docRes = await db.collection('ai_image_packages').doc(packageId).get();
    const doc = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
    if (doc && doc._id) return doc;
  } catch (err) {
    // 不是文档 _id 时继续按 packageId 查。
  }

  const res = await db.collection('ai_image_packages')
    .where({ packageId })
    .limit(1)
    .get();
  return res.data && res.data[0] ? res.data[0] : null;
}

async function aiImagePurchasePackage(openid, data = {}) {
  const userId = openid || 'anonymous';
  const pack = await getAiImagePackageById(data.packageId);

  if (!pack || pack.enabled === false) {
    return { success: false, error: '套餐不存在或已下架' };
  }

  const imageCount = Number(pack.imageCount || 0);
  if (!imageCount || imageCount <= 0) {
    return { success: false, error: '套餐图片数量配置不正确' };
  }

  const quota = await ensureAiImageQuota(userId);
  const beforeTotal = normalizeAiImageQuotaNumber(quota.total);
  const beforeUsed = normalizeAiImageQuotaNumber(quota.used, 0);
  const beforeRemaining = Math.max(0, beforeTotal - beforeUsed);

  const afterTotal = beforeRemaining === 0 ? imageCount : beforeTotal + imageCount;
  const afterUsed = beforeRemaining === 0 ? 0 : beforeUsed;
  const now = Date.now();
  const orderNo = createAiImageOrderNo(now);
  const userInfo = {
    appUserId: quota.appUserId || '',
    nickname: quota.nickname || '',
    phone: quota.phone || '',
    phoneMask: quota.phoneMask || '',
    avatar: quota.avatar || ''
  };
  const pricing = getAiImagePackagePricing(pack);

  const quotaUpdateRes = await db.collection('ai_image_quotas')
    .where({ _id: quota._id, total: beforeTotal, used: beforeUsed })
    .update({ data: { total: afterTotal, used: afterUsed, updatedAt: now } });

  if (!quotaUpdateRes.stats || quotaUpdateRes.stats.updated <= 0) {
    return { success: false, error: '额度更新冲突，请稍后重试' };
  }

  await db.collection('ai_image_orders').add({
    data: {
      orderNo,
      userId,
      ...userInfo,
      packageId: pack._id,
      packageKey: pack.packageId || '',
      title: pack.title || '',
      price: pricing.discountedPrice,
      originalPrice: pricing.originalPrice,
      discount: pricing.discount,
      discountedPrice: pricing.discountedPrice,
      beforePrice: pricing.originalPrice,
      afterPrice: pricing.discountedPrice,
      imageCount,
      beforeTotal,
      beforeUsed,
      beforeRemaining,
      afterTotal,
      afterUsed,
      afterRemaining: Math.max(0, afterTotal - afterUsed),
      status: 'paid',
      payType: 'mock',
      createdAt: now,
      paidAt: now
    }
  });

  return {
    success: true,
    package: normalizeAiImagePackage(pack),
    summary: await getAiImageSummaryData(userId)
  };
}

function normalizeAiImageTemplate(item = {}) {
  const imageUrl = item.imageUrl || item.coverUrl || item.previewUrl || item.coverImage || item.image || '';
  const imageFileID = item.imageFileID || item.coverFileID || item.previewFileID || '';

  return {
    id: item.templateId || item._id || '',
    _id: item._id || '',
    mode: item.mode === 'image' ? 'image' : 'text',
    scene: String(item.scene || '').trim(),
    title: item.title || '',
    desc: item.desc || '',
    badge: item.badge || '',
    ratio: item.ratio || '1:1',
    style: item.style || '',
    prompt: item.prompt || '',
    imageUrl: imageUrl || imageFileID,
    imageFileID,
    sort: typeof item.sort === 'number' ? item.sort : 0,
    enabled: item.enabled !== false,
    likeCount: item.likeCount || 0,
    dislikeCount: item.dislikeCount || 0,
    userVote: item.userVote || ''
  };
}

function sanitizeAiImageTemplatePayload(data = {}, existed = {}) {
  const now = Date.now();
  const templateId = String(data.templateId || existed.templateId || '').trim();
  const rawMode = data.mode || existed.mode;
  const mode = rawMode === 'image' ? 'image' : 'text';
  const scene = String(data.scene || existed.scene || '').trim();
  const title = String(data.title || existed.title || '').trim();
  const prompt = String(data.prompt || existed.prompt || '').trim();

  if (!title) {
    throw new Error('模板标题不能为空');
  }

  if (!prompt) {
    throw new Error('模板提示词不能为空');
  }

  const imageFileID = String(data.imageFileID || data.coverFileID || data.previewFileID || existed.imageFileID || existed.coverFileID || '').trim();
  const imageUrl = String(data.imageUrl || data.coverUrl || data.previewUrl || data.coverImage || existed.imageUrl || existed.coverUrl || existed.previewUrl || existed.coverImage || '').trim();

  return {
    templateId,
    mode,
    scene,
    title,
    desc: String(data.desc || existed.desc || '').trim(),
    badge: String(data.badge || existed.badge || scene || '').trim(),
    ratio: String(data.ratio || existed.ratio || '1:1').trim(),
    style: String(data.style || existed.style || '').trim(),
    prompt,
    imageUrl: imageUrl || imageFileID,
    imageFileID,
    sort: Number.isFinite(Number(data.sort)) ? Number(data.sort) : (typeof existed.sort === 'number' ? existed.sort : 999),
    enabled: data.enabled === undefined ? (existed.enabled !== false) : data.enabled !== false,
    likeCount: typeof existed.likeCount === 'number' ? existed.likeCount : 0,
    dislikeCount: typeof existed.dislikeCount === 'number' ? existed.dislikeCount : 0,
    updatedAt: now
  };
}

async function aiImageTemplates(openid, data = {}) {
  const mode = data.mode === 'image' ? 'image' : data.mode === 'text' ? 'text' : '';
  const scene = String(data.scene || '').trim();
  const limit = Math.min(Math.max(parseInt(data.limit, 10) || 100, 1), 100);
  const where = { enabled: true };
  if (mode) where.mode = mode;
  if (scene) where.scene = scene;

  try {
    const res = await db.collection('ai_image_templates')
      .where(where)
      .orderBy('sort', 'asc')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const templates = (res.data || []).map(normalizeAiImageTemplate);

    if (openid) {
      for (const template of templates) {
        try {
          const voteRes = await db.collection('ai_image_template_votes')
            .where({
              userId: openid,
              templateId: template._id
            })
            .limit(1)
            .get();
          template.userVote = voteRes.data && voteRes.data[0] ? voteRes.data[0].vote || '' : '';
        } catch (err) {
          console.warn('读取 AI 模板反馈失败:', err);
        }
      }
    }

    return {
      success: true,
      templates
    };
  } catch (err) {
    console.warn('读取 AI 生图模板失败:', err);
    return {
      success: true,
      templates: []
    };
  }
}

async function getAiImageTemplateById(templateId) {
  if (!templateId) return null;

  try {
    const docRes = await db.collection('ai_image_templates').doc(templateId).get();
    const doc = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
    if (doc && doc._id) return doc;
  } catch (err) {
    // 不是文档 _id 时继续按 templateId 查。
  }

  const res = await db.collection('ai_image_templates')
    .where({ templateId })
    .limit(1)
    .get();
  return res.data && res.data[0] ? res.data[0] : null;
}

async function aiImageTemplateVote(openid, data = {}) {
  const template = await getAiImageTemplateById(data.templateId);
  const vote = data.vote === 'dislike' ? 'dislike' : data.vote === 'like' ? 'like' : '';
  const userId = openid || 'anonymous';

  if (!template || !template._id) {
    return { success: false, error: '模板不存在' };
  }

  if (!vote) {
    return { success: false, error: '反馈类型不正确' };
  }

  const voteRes = await db.collection('ai_image_template_votes')
    .where({
      userId,
      templateId: template._id
    })
    .limit(1)
    .get();
  const existedVote = voteRes.data && voteRes.data[0] ? voteRes.data[0] : null;
  const updates = { updatedAt: Date.now() };
  let userVote = vote;

  if (!existedVote) {
    updates[vote === 'like' ? 'likeCount' : 'dislikeCount'] = _.inc(1);
    await db.collection('ai_image_template_votes').add({
      data: {
        userId,
        templateId: template._id,
        vote,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    });
  } else if (existedVote.vote === vote) {
    updates[vote === 'like' ? 'likeCount' : 'dislikeCount'] = _.inc(-1);
    userVote = '';
    await db.collection('ai_image_template_votes').doc(existedVote._id).remove();
  } else {
    updates[vote === 'like' ? 'likeCount' : 'dislikeCount'] = _.inc(1);
    if (existedVote.vote === 'like' || existedVote.vote === 'dislike') {
      updates[existedVote.vote === 'like' ? 'likeCount' : 'dislikeCount'] = _.inc(-1);
    }
    await db.collection('ai_image_template_votes').doc(existedVote._id).update({
      data: {
        vote,
        updatedAt: Date.now()
      }
    });
  }

  await db.collection('ai_image_templates').doc(template._id).update({ data: updates });
  const latest = await getAiImageTemplateById(template._id);

  return {
    success: true,
    templateId: template._id,
    likeCount: latest && latest.likeCount ? latest.likeCount : 0,
    dislikeCount: latest && latest.dislikeCount ? latest.dislikeCount : 0,
    userVote
  };
}

async function aiImageTemplateCreate(openid, data = {}) {
  const now = Date.now();
  const payload = sanitizeAiImageTemplatePayload(data);

  if (payload.templateId) {
    const existed = await getAiImageTemplateById(payload.templateId);
    if (existed && existed._id) {
      return { success: false, error: '模板标识已存在' };
    }
  }

  const addRes = await db.collection('ai_image_templates').add({
    data: {
      ...payload,
      createdBy: openid || '',
      createdAt: now,
      updatedAt: now
    }
  });
  const latest = await getAiImageTemplateById(addRes._id);

  return {
    success: true,
    template: normalizeAiImageTemplate(latest)
  };
}

async function aiImageTemplateUpdate(openid, data = {}) {
  const template = await getAiImageTemplateById(data.templateId || data._id || data.id);

  if (!template || !template._id) {
    return { success: false, error: '模板不存在' };
  }

  const payload = sanitizeAiImageTemplatePayload(data, template);
  await db.collection('ai_image_templates').doc(template._id).update({
    data: {
      ...payload,
      updatedBy: openid || '',
      updatedAt: Date.now()
    }
  });
  const latest = await getAiImageTemplateById(template._id);

  return {
    success: true,
    template: normalizeAiImageTemplate(latest)
  };
}

async function recordAiImageTask(openid, data, task) {
  const newRecord = {
    userId: openid || 'anonymous',
    responseId: task.taskId,
    status: task.status || 'queued',
    external: Boolean(task.external),
    channelId: String(task.channelId || data.channelId || '').trim(),
    channelName: String(task.channelName || data.channelName || '').trim(),
    mode: data.mode,
    prompt: getEffectiveAiImagePrompt(data),
    style: getEffectiveAiImageStyle(data),
    ratio: data.ratio || '',
    model: task.model || '',
    referenceFileID: data.referenceFileID || '',
    images: buildInitialAiImages(task),
    usage: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const res = await db.collection('ai_image_generations').add({ data: newRecord });
  newRecord._id = res._id;
  return newRecord;
}

async function syncAiImageRecord(openid, record) {
  if (!record || record.status === 'completed' || record.status === 'failed') {
    return record;
  }

  const statusRes = await aiImageStatus(openid, { taskId: record.responseId });

  if (!statusRes.success && statusRes.status !== 'failed') {
    return record;
  }

  const updates = {
    status: statusRes.status || (statusRes.success ? 'completed' : 'failed'),
    updatedAt: Date.now()
  };

  if (!statusRes.success) {
    updates.error = statusRes.error || '生成失败';
    updates.images = syncImagesStatus(record.images, 'failed', updates.error);
  } else if (isAiImageLoadingStatus(updates.status)) {
    updates.images = syncImagesStatus(record.images, updates.status);
  }

  if (statusRes.status === 'completed' && statusRes.image) {
    updates.status = 'completed';
    updates.images = buildCompletedAiImages(statusRes.image, record.responseId);
    updates.completedAt = Date.now();
    if (record.chargedAt) {
      updates.chargedAt = record.chargedAt;
    } else if (statusRes.charged) {
      updates.chargedAt = Date.now();
    }
  }

  try {
    await db.collection('ai_image_generations').doc(record._id).update({ data: updates });
  } catch (err) {
    console.warn('同步 AI 生图记录失败:', err);
  }

  return { ...record, ...updates };
}

async function aiImageList(openid, data = {}) {
  const userId = openid || 'anonymous';
  const page = Math.max(parseInt(data.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(data.pageSize, 10) || 5, 1), 20);
  const res = await db.collection('ai_image_generations')
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  const items = [];
  const channels = await listAiImageChannels(true);
  const channelNameById = channels.reduce((map, channel) => {
    if (channel.channelId && channel.name) {
      map[channel.channelId] = channel.name;
    }
    return map;
  }, {});

  const records = res.data || [];
  const concurrency = 5;
  for (let i = 0; i < records.length; i += concurrency) {
    const batch = records.slice(i, i + concurrency);
    const syncedBatch = await Promise.all(batch.map(record => syncAiImageRecord(openid, record)));
    syncedBatch.forEach(synced => {
      items.push(formatAiImageRecord(synced, channelNameById));
    });
  }

  return {
    success: true,
    summary: await getAiImageSummaryData(openid),
    images: items,
    page,
    pageSize,
    hasMore: records.length === pageSize
  };
}

async function aiImageChannels(data = {}) {
  const includeDisabled = data.includeDisabled === true || data.includeDisabled === 'true';
  const channels = await listAiImageChannels(includeDisabled);
  const defaultChannel = includeDisabled ? (channels[0] || null) : await getDefaultAiImageChannel();

  return {
    success: true,
    channels,
    defaultChannelId: defaultChannel && defaultChannel.channelId ? defaultChannel.channelId : ''
  };
}

function normalizeAiImageCloudFileID(value) {
  if (!value || typeof value !== 'string') return '';
  let fileID = value.trim().split('?')[0];
  if (!fileID) return '';

  if (fileID.startsWith('//')) {
    fileID = `https:${fileID}`;
  }

  if (fileID.startsWith('https://') || fileID.startsWith('http://')) {
    try {
      const parsed = new URL(fileID);
      const pathname = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
      if (pathname.startsWith('ai-images/') || pathname.startsWith('ai-references/')) {
        return buildAiImageCloudFileID(pathname, fileID);
      }
    } catch (err) {
      return '';
    }
    return '';
  }

  if (fileID.startsWith('cloud://')) {
    const path = fileID.replace(/^cloud:\/\/[^/]+\//, '');
    if (path.startsWith('ai-images/') || path.startsWith('ai-references/')) {
      return fileID;
    }
    return '';
  }

  if (fileID.startsWith('ai-images/') || fileID.startsWith('ai-references/')) {
    return buildAiImageCloudFileID(fileID);
  }

  return '';
}

function collectAiImageCloudFileIDs(record = {}, candidates = []) {
  const fileIDs = [];
  const addFileID = (value) => {
    const fileID = normalizeAiImageCloudFileID(value);
    if (fileID && !fileIDs.includes(fileID)) {
      fileIDs.push(fileID);
    }
  };

  addFileID(buildAiImageGeneratedCloudPath(record.responseId));
  addFileID(record.generatedFileID);
  addFileID(record.fileID);
  candidates.forEach(addFileID);
  addFileID(record.referenceFileID);
  (record.images || []).forEach((image) => {
    addFileID(image.key);
    addFileID(image.fileID);
    addFileID(image.cloudPath);
    addFileID(image.url);
    addFileID(image.signedUrl);
    addFileID(image.publicUrl);
  });

  return fileIDs;
}

function isCloudDeleteSuccess(item = {}) {
  const message = String(`${item.status || ''} ${item.code || ''} ${item.errMsg || ''} ${item.message || ''}`).toLowerCase();
  return item.status === 0 ||
    item.status === '0' ||
    item.code === 'SUCCESS' ||
    item.code === 'OK' ||
    item.success === true ||
    String(item.errMsg || '').toLowerCase().includes('ok') ||
    message.includes('-503003') ||
    message.includes('not exist') ||
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('no such file');
}

async function deleteAiImageCloudFiles(fileIDs) {
  if (!fileIDs.length) {
    return { deletedFiles: 0 };
  }

  const failed = [];

  for (let i = 0; i < fileIDs.length; i += 50) {
    const fileList = fileIDs.slice(i, i + 50);
    const res = await cloud.deleteFile({ fileList });
    const resultList = res.fileList || [];

    fileList.forEach((fileID, index) => {
      const item = resultList[index] || {};
      if (!isCloudDeleteSuccess(item)) {
        failed.push({
          fileID,
          status: item.status,
          code: item.code,
          errMsg: item.errMsg || item.message || ''
        });
      }
    });
  }

  if (failed.length > 0) {
    const first = failed[0];
    const detail = first.errMsg || first.code || first.status || 'unknown';
    const error = new Error(`云存储文件删除失败：${detail}`);
    error.failedFiles = failed;
    throw error;
  }

  return { deletedFiles: fileIDs.length };
}

async function aiImageDelete(openid, data = {}) {
  const userId = openid || 'anonymous';
  const id = data.id || data._id || data.taskId || data.responseId;
  const candidateFileIDs = Array.isArray(data.fileIDs) ? data.fileIDs : [];

  if (!id) {
    return { success: false, error: '作品ID不能为空' };
  }

  let record = null;

  try {
    const docRes = await db.collection('ai_image_generations').doc(id).get();
    const doc = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data;
    if (doc) {
      record = {
        ...doc,
        _id: doc._id || id
      };
    }
  } catch (err) {
    // 不是文档 _id 时继续按 responseId 查询。
  }

  if (!record) {
    const res = await db.collection('ai_image_generations')
      .where({
        userId,
        responseId: id
      })
      .limit(1)
      .get();
    record = res.data && res.data[0] ? res.data[0] : null;
  }

  if (!record || !record._id) {
    return { success: false, error: '作品不存在' };
  }

  if (record.userId !== userId) {
    return { success: false, error: '无权删除该作品' };
  }

  const fileIDs = collectAiImageCloudFileIDs(record, candidateFileIDs);
  let deleteResult = { deletedFiles: 0 };
  if (fileIDs.length > 0) {
    try {
      deleteResult = await deleteAiImageCloudFiles(fileIDs);
    } catch (err) {
      console.warn('删除 AI 作品云存储文件失败:', err);
      return {
        success: false,
        error: err.message || '云存储文件删除失败，请稍后重试',
        fileIDs,
        failedFiles: err.failedFiles || []
      };
    }
  }

  await db.collection('ai_image_generations').doc(record._id).remove();

  return {
    success: true,
    deletedId: record._id,
    deletedFiles: deleteResult.deletedFiles,
    summary: await getAiImageSummaryData(openid)
  };
}

function isAiReferenceCloudFile(value) {
  const fileID = normalizeAiImageCloudFileID(value);
  if (!fileID) return false;
  return fileID.replace(/^cloud:\/\/[^/]+\//, '').startsWith('ai-references/');
}

async function buildAiReferenceTempUrlMap(fileIDs = []) {
  const tempUrlMap = {};
  const normalized = [...new Set(fileIDs.map(fileID => normalizeAiImageCloudFileID(fileID)).filter(Boolean))];

  for (let i = 0; i < normalized.length; i += 50) {
    const fileList = normalized.slice(i, i + 50);
    const res = await cloud.getTempFileURL({ fileList });
    (res.fileList || []).forEach((item) => {
      if (item.fileID && item.tempFileURL) {
        tempUrlMap[item.fileID] = item.tempFileURL;
      }
    });
  }

  return tempUrlMap;
}

function formatAiReferenceAdminItem(record = {}, tempUrlMap = {}) {
  const normalizedFileID = normalizeAiImageCloudFileID(record.referenceFileID);
  return {
    _id: record._id || '',
    responseId: record.responseId || '',
    userId: record.userId || '',
    prompt: record.prompt || '',
    status: record.status || '',
    createdAt: record.createdAt || 0,
    updatedAt: record.updatedAt || 0,
    referenceFileID: normalizedFileID,
    referenceUrl: tempUrlMap[normalizedFileID] || ''
  };
}

async function adminAiReferenceList(data = {}) {
  const page = Math.max(1, Number(data.page || 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(data.pageSize || 100) || 100));
  const query = db.collection('ai_image_generations')
    .where({
      mode: 'image',
      referenceFileID: _.neq('')
    });

  const countRes = await query.count();
  const res = await query
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  const records = (res.data || []).filter(record => isAiReferenceCloudFile(record.referenceFileID));
  const tempUrlMap = await buildAiReferenceTempUrlMap(records.map(record => record.referenceFileID));

  return {
    success: true,
    page,
    pageSize,
    total: countRes.total || 0,
    items: records.map(record => formatAiReferenceAdminItem(record, tempUrlMap))
  };
}

async function adminAiReferenceCleanup(data = {}) {
  const olderThanDays = Number(data.olderThanDays || 0);
  if (!Number.isFinite(olderThanDays) || olderThanDays <= 0) {
    return { success: false, message: 'olderThanDays 必须大于 0' };
  }

  const threshold = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const res = await db.collection('ai_image_generations')
    .where({
      mode: 'image',
      createdAt: _.lt(threshold),
      referenceFileID: _.neq('')
    })
    .orderBy('createdAt', 'asc')
    .limit(1000)
    .get();

  const records = (res.data || []).filter(record => isAiReferenceCloudFile(record.referenceFileID));
  const fileIDs = [...new Set(records.map(record => normalizeAiImageCloudFileID(record.referenceFileID)).filter(Boolean))];

  if (!records.length || !fileIDs.length) {
    return {
      success: true,
      olderThanDays,
      matchedRecords: 0,
      deletedFiles: 0,
      updatedRecords: 0
    };
  }

  const deleteResult = await deleteAiImageCloudFiles(fileIDs);
  const updatedAt = Date.now();

  for (const record of records) {
    await db.collection('ai_image_generations').doc(record._id).update({
      data: {
        referenceFileID: '',
        updatedAt,
        referenceDeletedAt: updatedAt
      }
    });
  }

  return {
    success: true,
    olderThanDays,
    matchedRecords: records.length,
    deletedFiles: deleteResult.deletedFiles,
    updatedRecords: records.length
  };
}

function formatAiImageRecord(record, channelNameById = {}) {
  const images = (record.images && record.images.length ? record.images : buildInitialAiImages({
    taskId: record.responseId,
    status: record.status || 'queued'
  })).map((image, index) => normalizeAiImageItem({
    ...image,
    id: image.id || `${record.responseId || record._id || 'image'}_${index}`,
    status: image.status || record.status || 'queued',
    error: image.error || record.error || ''
  }, {
    taskId: record.responseId,
    status: record.status || 'queued'
  }));
  const firstImage = images[0] || {};

  return {
    _id: record._id,
    taskId: record.responseId,
    status: record.status || 'queued',
    mode: record.mode || 'text',
    channelId: record.channelId || '',
    channelName: record.channelName || channelNameById[record.channelId] || '',
    prompt: record.prompt || '',
    style: record.style || '',
    ratio: record.ratio || '',
    referenceFileID: record.referenceFileID || '',
    imageUrl: firstImage.publicUrl || '',
    publicUrl: firstImage.publicUrl || '',
    images,
    createdAt: record.createdAt || 0,
    completedAt: record.completedAt || 0,
    error: record.error ? getAiImageErrorText(record.error) : ''
  };
}

module.exports = {
  syncAiImageQuotaUserInfo,
  aiImageGenerate,
  aiImageStatus,
  aiImageSummary,
  aiImageList,
  aiImageDelete,
  aiImageChannels,
  aiImagePackages,
  aiImagePurchasePackage,
  aiImageCreatePayOrder,
  aiImageConfirmPayment,
  aiImageTemplates,
  aiImageTemplateVote,
  aiImageTemplateCreate,
  aiImageTemplateUpdate,
  adminAiReferenceList,
  adminAiReferenceCleanup
};
