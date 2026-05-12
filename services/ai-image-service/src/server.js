const crypto = require('crypto');
const https = require('https');
const http = require('http');
const dns = require('dns').promises;
const net = require('net');
const express = require('express');
const COS = require('cos-nodejs-sdk-v5');
const FormData = require('form-data');
const { formatAiImageSharedErrorMessage } = require('./ai-image-error-rules');

const app = express();
app.use(express.json({ limit: '30mb' }));

const tasks = new Map();
const DEFAULT_IMAGE_DOWNLOAD_ALLOWLIST = [
  'openai.com',
  'oaiusercontent.com',
  'blob.core.windows.net',
  'toapis.com',
  'toapis.cn',
  'myqcloud.com',
  'tencentcos.cn',
  'qcloud.la'
];

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function envFirst(names, fallback = '') {
  for (const name of names) {
    if (process.env[name]) {
      return process.env[name];
    }
  }
  return fallback;
}

function positiveNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const TASK_TTL_MS = positiveNumberEnv('AI_IMAGE_TASK_TTL_MS', 60 * 60 * 1000);
const TASK_CLEANUP_INTERVAL_MS = positiveNumberEnv('AI_IMAGE_TASK_CLEANUP_INTERVAL_MS', 5 * 60 * 1000);
const HTTP_AGENT_MAX_SOCKETS = positiveNumberEnv('AI_IMAGE_HTTP_MAX_SOCKETS', 10);
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: HTTP_AGENT_MAX_SOCKETS });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: HTTP_AGENT_MAX_SOCKETS });

function getKeepAliveAgent(protocol) {
  return protocol === 'http:' ? httpAgent : httpsAgent;
}

function cleanupExpiredTasks(now = Date.now()) {
  let deleted = 0;
  for (const [id, task] of tasks.entries()) {
    if (task.status !== 'completed' && task.status !== 'failed') continue;
    if (now - (task.updatedAt || task.createdAt || 0) <= TASK_TTL_MS) continue;
    tasks.delete(id);
    deleted += 1;
  }

  if (deleted) {
    logAiImageEvent('info', 'task-cleanup', {
      deleted,
      activeTaskCount: tasks.size,
      ttlMs: TASK_TTL_MS
    });
  }
}

const taskCleanupTimer = setInterval(cleanupExpiredTasks, TASK_CLEANUP_INTERVAL_MS);
if (taskCleanupTimer.unref) {
  taskCleanupTimer.unref();
}

function uniq(list) {
  return list.filter((item, index) => item && list.indexOf(item) === index);
}

function resolveChannelEnvSuffix(channelId, envSource = process.env) {
  const value = String(channelId || '').trim();
  if (!value) {
    return {
      matched: true,
      suffix: '',
      envKey: ''
    };
  }

  for (const [key, envValue] of Object.entries(envSource)) {
    const match = key.match(/^AI_IMAGE_CHANNEL_ID(\d+)$/i);
    if (!match) {
      continue;
    }

    if (String(envValue || '').trim() !== value) {
      continue;
    }

    return {
      matched: true,
      suffix: match[1] === '1' ? '' : match[1],
      envKey: key
    };
  }

  return {
    matched: false,
    suffix: '',
    envKey: ''
  };
}

function getConfig() {
  return {
    port: Number(env('PORT', '3000')),
    apiKey: env('OPENAI_API_KEY'),
    openaiBaseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com'),
    openaiApiMode: env('OPENAI_API_MODE', 'images'),
    chatImageInputMode: env('CHAT_IMAGE_INPUT_MODE', 'multimodal'),
    openaiSubmitTimeoutMs: Number(env('OPENAI_SUBMIT_TIMEOUT_MS', '600000')),
    openaiPollTimeoutMs: Number(env('OPENAI_POLL_TIMEOUT_MS', '30000')),
    imageModel: env('OPENAI_IMAGE_MODEL', 'gpt-image-2'),
    imageResolution: env('OPENAI_IMAGE_RESOLUTION', ''),
    responsesModel: env('OPENAI_RESPONSES_MODEL', 'gpt-4.1-mini'),
    channelProvider: env('AI_IMAGE_PROVIDER', 'openai'),
    sharedSecret: env('AI_IMAGE_SERVICE_SECRET'),
    cosSecretId: env('TENCENT_SECRET_ID'),
    cosSecretKey: env('TENCENT_SECRET_KEY'),
    cosBucket: env('COS_BUCKET'),
    cosRegion: env('COS_REGION'),
    publicBaseUrl: env('COS_PUBLIC_BASE_URL')
  };
}

function buildChannelEnvKey(key, suffix = '') {
  return suffix ? `${key}${suffix}` : key;
}

function getDefaultChannelProvider(baseProvider, suffix) {
  // 渠道 2 使用 toapis 的 image_urls 协议；默认渠道、渠道 1、渠道 3+ 共用 OpenAI Images 兼容协议。
  return suffix === '2' ? 'toapis' : baseProvider;
}

function getChannelConfig(channelId) {
  const base = getConfig();
  const id = String(channelId || '').trim();
  const channelEnv = resolveChannelEnvSuffix(id);

  if (!id) {
    return {
      ...base,
      channelId: '',
      channelMatched: true,
      channelEnvKey: '',
      channelEnvSuffix: ''
    };
  }

  return {
    ...base,
    channelId: id,
    channelMatched: channelEnv.matched,
    channelEnvKey: channelEnv.envKey,
    channelEnvSuffix: channelEnv.suffix,
    apiKey: channelEnv.matched ? env(buildChannelEnvKey('OPENAI_API_KEY', channelEnv.suffix), base.apiKey) : '',
    openaiBaseUrl: channelEnv.matched ? env(buildChannelEnvKey('OPENAI_BASE_URL', channelEnv.suffix), base.openaiBaseUrl) : base.openaiBaseUrl,
    openaiApiMode: channelEnv.matched ? env(buildChannelEnvKey('OPENAI_API_MODE', channelEnv.suffix), base.openaiApiMode) : base.openaiApiMode,
    chatImageInputMode: channelEnv.matched ? env(buildChannelEnvKey('CHAT_IMAGE_INPUT_MODE', channelEnv.suffix), base.chatImageInputMode) : base.chatImageInputMode,
    openaiSubmitTimeoutMs: Number(channelEnv.matched ? env(buildChannelEnvKey('OPENAI_SUBMIT_TIMEOUT_MS', channelEnv.suffix), String(base.openaiSubmitTimeoutMs)) : String(base.openaiSubmitTimeoutMs)),
    openaiPollTimeoutMs: Number(channelEnv.matched ? env(buildChannelEnvKey('OPENAI_POLL_TIMEOUT_MS', channelEnv.suffix), String(base.openaiPollTimeoutMs)) : String(base.openaiPollTimeoutMs)),
    imageModel: channelEnv.matched ? env(buildChannelEnvKey('OPENAI_IMAGE_MODEL', channelEnv.suffix), base.imageModel) : base.imageModel,
    imageResolution: channelEnv.matched ? env(buildChannelEnvKey('OPENAI_IMAGE_RESOLUTION', channelEnv.suffix), base.imageResolution) : base.imageResolution,
    responsesModel: channelEnv.matched ? env(buildChannelEnvKey('OPENAI_RESPONSES_MODEL', channelEnv.suffix), base.responsesModel) : base.responsesModel,
    channelProvider: env(
      buildChannelEnvKey('AI_IMAGE_PROVIDER', channelEnv.suffix),
      getDefaultChannelProvider(base.channelProvider, channelEnv.suffix)
    )
  };
}

function requireSecret(req, res, next) {
  const { sharedSecret } = getConfig();
  if (!sharedSecret) {
    next();
    return;
  }

  if (req.headers['x-ai-service-secret'] !== sharedSecret) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  next();
}

function requestOpenAI(method, path, payload, timeoutMs = 180000, channelConfig = null) {
  const { apiKey, openaiBaseUrl } = channelConfig || getConfig();
  const body = payload ? JSON.stringify(payload) : '';
  const baseUrl = new URL(openaiBaseUrl.replace(/\/$/, ''));
  const normalizedPath = baseUrl.pathname.endsWith('/v1') && path.startsWith('/v1/')
    ? path.slice(3)
    : path;
  const requestPath = `${baseUrl.pathname.replace(/\/$/, '')}${normalizedPath}`;
  const transport = baseUrl.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const req = transport.request({
      hostname: baseUrl.hostname,
      port: baseUrl.port || (baseUrl.protocol === 'http:' ? 80 : 443),
      path: requestPath,
      method,
      agent: getKeepAliveAgent(baseUrl.protocol),
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
          reject(new Error(`OpenAI 返回异常：${text.slice(0, 200)}`));
          return;
        }

        if (res.statusCode >= 400) {
          reject(new Error(parsed.error && parsed.error.message ? parsed.error.message : 'OpenAI 请求失败'));
          return;
        }

        resolve(parsed);
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('OpenAI 请求超时'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function requestJsonWithConfig(method, path, payload, timeoutMs = 180000, channelConfig = null) {
  return requestOpenAI(method, path, payload, timeoutMs, channelConfig);
}

function getOpenAIRequestOptions(method, path, headers = {}, channelConfig = null) {
  const { apiKey, openaiBaseUrl } = channelConfig || getConfig();
  const baseUrl = new URL(openaiBaseUrl.replace(/\/$/, ''));
  const normalizedPath = baseUrl.pathname.endsWith('/v1') && path.startsWith('/v1/')
    ? path.slice(3)
    : path;
  const requestPath = `${baseUrl.pathname.replace(/\/$/, '')}${normalizedPath}`;
  const transport = baseUrl.protocol === 'http:' ? http : https;

  return {
    transport,
    options: {
      hostname: baseUrl.hostname,
      port: baseUrl.port || (baseUrl.protocol === 'http:' ? 80 : 443),
      path: requestPath,
      method,
      agent: getKeepAliveAgent(baseUrl.protocol),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...headers
      }
    }
  };
}

function requestOpenAIMultipart(path, form, timeoutMs = 180000, channelConfig = null) {
  const { transport, options } = getOpenAIRequestOptions('POST', path, form.getHeaders(), channelConfig);

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          reject(new Error(`OpenAI 返回异常：${text.slice(0, 200)}`));
          return;
        }

        if (res.statusCode >= 400) {
          reject(new Error(parsed.error && parsed.error.message ? parsed.error.message : 'OpenAI 请求失败'));
          return;
        }

        resolve(parsed);
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('OpenAI 请求超时'));
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

function mapImageSize(ratio) {
  const sizeMap = {
    '1:1': '1024x1024',
    '3:4': '1024x1536',
    '4:3': '1536x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536'
  };
  return sizeMap[ratio] || '1024x1024';
}

function mapToapisImageSize(ratio) {
  const sizeMap = {
    '1:1': '1:1',
    '3:4': '3:4',
    '4:3': '4:3',
    '9:16': '9:16',
    '16:9': '16:9'
  };
  return sizeMap[ratio] || '1:1';
}

function hasReferenceImage(payload = {}) {
  return Boolean(payload.referenceImageUrl);
}

function buildPrompt(data) {
  const rawStyle = String(data.style || '').trim();
  const style = ['none', '无', '不要', '不加风格', '无风格', '默认风格'].includes(rawStyle) ? '' : rawStyle;
  const prompt = String(data.prompt || '').trim();
  const parts = [
    prompt || (data.mode === 'image' ? '请基于参考图生成一张高质量图片' : ''),
    style ? `视觉风格：${style}` : ''
  ].filter(Boolean);

  if (!prompt && !style) {
    parts.push('请生成适合在旅行社交小程序中展示的高质量图片。');
  }

  if (data.mode === 'image' && hasReferenceImage(data)) {
    parts.push('请以我上传的参考图为基础进行图生图：尽量保留参考图中的主体、构图、姿态和关键视觉元素，只按我的描述调整风格与画面。');
  }

  return parts.join('\n');
}

function findGeneratedImageUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const text = value.trim();
    return /^https?:\/\//i.test(text) ? text : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const imageUrl = findGeneratedImageUrl(item);
      if (imageUrl) return imageUrl;
    }
    return '';
  }
  if (typeof value === 'object') {
    const direct = value.url || value.image_url || value.imageUrl || value.public_url || value.publicUrl;
    const directUrl = findGeneratedImageUrl(direct);
    if (directUrl) return directUrl;
    return findGeneratedImageUrl(value.result || value.content || value.output || value.data);
  }
  return '';
}

function extractImageUrlFromResponse(response) {
  return findGeneratedImageUrl(response && response.output ? response.output : []);
}

function extractImageUrlFromImagesResponse(response) {
  return response && response.data && response.data[0] && response.data[0].url
    ? response.data[0].url
    : '';
}

function buildImageUrlResult(url, extra = {}) {
  return {
    url,
    signedUrl: url,
    key: '',
    width: 0,
    height: 0,
    format: '',
    bytes: 0,
    ...extra
  };
}

function supportsImageResponseFormat(model = '') {
  return !String(model || '').toLowerCase().startsWith('gpt-image');
}

function extractToapisTaskId(response) {
  return String(response && response.id ? response.id : '').trim();
}

function extractToapisImageUrl(response) {
  const data = response && response.result && Array.isArray(response.result.data)
    ? response.result.data
    : [];
  const item = data.find(entry => entry && entry.url);
  return item ? String(item.url || '').trim() : '';
}

function getToapisErrorMessage(response) {
  if (!response) return '生成任务失败';
  if (typeof response.error === 'string') return response.error;
  if (response.error && response.error.message) return response.error.message;
  if (response.error && response.error.code) return response.error.code;
  return `生成任务${response.status || 'failed'}`;
}

function extractImageUrlFromChatCompletion(response) {
  const content = response && response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content
    : '';

  if (!content) return '';

  const markdownMatch = content.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/);
  if (markdownMatch) {
    return markdownMatch[1];
  }

  const urlMatch = content.match(/https?:\/\/[^\s"'<>]+/);
  return urlMatch ? urlMatch[0] : '';
}

function getChatCompletionContent(response) {
  return response && response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message.content || ''
    : '';
}

function normalizeDownloadHostname(hostname = '') {
  const trimmed = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  return trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
}

function getImageDownloadAllowlist() {
  const configured = env('AI_IMAGE_DOWNLOAD_ALLOWLIST', '')
    .split(',')
    .map(item => normalizeDownloadHostname(item).replace(/^\./, ''))
    .filter(Boolean);
  return uniq([...DEFAULT_IMAGE_DOWNLOAD_ALLOWLIST, ...configured]);
}

function isAllowedImageDownloadHost(hostname) {
  const host = normalizeDownloadHostname(hostname);
  return getImageDownloadAllowlist().some(domain => host === domain || host.endsWith(`.${domain}`));
}

function isBlockedIpAddress(address) {
  const value = normalizeDownloadHostname(address);
  const ipVersion = net.isIP(value);
  if (!ipVersion) return false;

  if (ipVersion === 4) {
    const parts = value.split('.').map(part => Number(part));
    const [a, b] = parts;
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

function isBlockedDownloadHostname(hostname) {
  const host = normalizeDownloadHostname(hostname);
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal' ||
    isBlockedIpAddress(host)
  );
}

async function assertSafeDownloadUrl(url, options = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    throw new Error('图片下载地址格式不正确');
  }

  const allowHttp = options.allowHttp || env('AI_IMAGE_ALLOW_HTTP_DOWNLOADS', '').toLowerCase() === 'true';
  if (parsedUrl.protocol !== 'https:' && !(allowHttp && parsedUrl.protocol === 'http:')) {
    throw new Error('图片下载地址必须使用 HTTPS');
  }

  if (isBlockedDownloadHostname(parsedUrl.hostname)) {
    throw new Error('图片下载地址被安全策略拒绝');
  }

  if (options.requireAllowedHost && !isAllowedImageDownloadHost(parsedUrl.hostname)) {
    throw new Error('图片下载地址不在允许的域名列表中');
  }

  let addresses;
  try {
    addresses = net.isIP(normalizeDownloadHostname(parsedUrl.hostname))
      ? [{ address: normalizeDownloadHostname(parsedUrl.hostname) }]
      : await dns.lookup(parsedUrl.hostname, { all: true, verbatim: true });
  } catch (err) {
    throw new Error(`图片下载地址解析失败：${formatError(err)}`);
  }

  if ((addresses || []).some(item => isBlockedIpAddress(item.address))) {
    throw new Error('图片下载地址解析到内网地址，已拒绝下载');
  }

  return parsedUrl;
}

async function downloadBinary(url, timeoutMs = 120000, options = {}, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error('图片下载重定向次数过多');
  }

  const parsedUrl = await assertSafeDownloadUrl(url, options);
  const transport = parsedUrl.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const req = transport.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'GET',
      agent: getKeepAliveAgent(parsedUrl.protocol)
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadBinary(new URL(res.headers.location, url).toString(), timeoutMs, options, redirectCount + 1));
        return;
      }

      if (res.statusCode >= 400) {
        reject(new Error(`图片下载失败(${res.statusCode})`));
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: res.headers['content-type'] || 'image/png'
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('图片下载超时'));
    });
    req.on('error', reject);
    req.end();
  });
}

function formatError(err, fallback = '生成失败') {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.error && err.error.message) return err.error.message;
  if (err.error && err.error.Message) return err.error.Message;
  if (err.Message) return err.Message;
  if (err.code || err.statusCode) {
    return `${err.code || 'ERROR'} ${err.statusCode || ''}`.trim();
  }

  try {
    return JSON.stringify(err).slice(0, 500);
  } catch (e) {
    return fallback;
  }
}

function logAiImageEvent(level, event, details = {}, err = null) {
  const payload = {
    event,
    ...details
  };
  if (err) {
    payload.error = {
      message: formatError(err),
      code: err.code || '',
      statusCode: err.statusCode || err.status || '',
      stack: err.stack ? String(err.stack).split('\n').slice(0, 5).join('\n') : ''
    };
  }
  const logger = level === 'error' ? console.error : (level === 'warn' ? console.warn : console.info);
  logger('[ai-image-service]', payload);
}

function formatUserFacingError(err, fallback = '这次没有生成成功，请稍后重试，或换个描述/参考图再试') {
  const message = formatError(err, '');
  return formatAiImageSharedErrorMessage(message, fallback, { scope: 'service' });
}

function getCosClient() {
  const config = getConfig();
  if (!config.cosSecretId || !config.cosSecretKey || !config.cosBucket || !config.cosRegion) {
    throw new Error('未配置 COS 存储环境变量');
  }

  return new COS({
    SecretId: config.cosSecretId,
    SecretKey: config.cosSecretKey
  });
}

function getImageMeta(buffer, contentType = '') {
  const meta = {
    width: 0,
    height: 0,
    format: getExtFromMime(contentType),
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

function normalizePublicBaseUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('https://') || value.startsWith('http://')) {
    return value.replace(/\/$/, '');
  }
  if (value.startsWith('//')) {
    return `https:${value}`.replace(/\/$/, '');
  }
  return `https://${value}`.replace(/\/$/, '');
}

async function uploadBufferToCos(taskId, buffer, contentType = 'image/png', ext = 'png') {
  const config = getConfig();
  const cos = getCosClient();
  const key = `ai-images/${taskId}.${ext}`;

  await new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: config.cosBucket,
      Region: config.cosRegion,
      Key: key,
      Body: buffer,
      ContentType: contentType
    }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const baseUrl = normalizePublicBaseUrl(config.publicBaseUrl) || `https://${config.cosBucket}.cos.${config.cosRegion}.myqcloud.com`;
  const signedUrl = cos.getObjectUrl({
    Bucket: config.cosBucket,
    Region: config.cosRegion,
    Key: key,
    Sign: true,
    Expires: 60 * 60 * 24
  });

  return {
    url: `${baseUrl}/${key}`,
    signedUrl,
    key,
    ...getImageMeta(buffer, contentType)
  };
}

async function runGeneration(taskId, payload, channelConfig = null) {
  const config = channelConfig || getChannelConfig(payload.channelId);
  const task = tasks.get(taskId);

  try {
    logAiImageEvent('info', 'generation-started', {
      taskId,
      channelId: config.channelId || '',
      provider: config.channelProvider,
      apiMode: config.openaiApiMode,
      mode: payload.mode || '',
      ratio: payload.ratio || '',
      style: payload.style || '',
      hasReference: hasReferenceImage(payload)
    });
    task.status = 'in_progress';
    task.stage = 'openai_submitting';
    task.channelId = config.channelId || '';
    task.updatedAt = Date.now();

    if (config.channelProvider === 'toapis') {
      await runToapisGeneration(taskId, payload, config);
      return;
    }

    const content = [{ type: 'input_text', text: buildPrompt(payload) }];
    if (payload.referenceImageUrl) {
      content.push({
        type: 'input_image',
        image_url: payload.referenceImageUrl
      });
    }

    if (config.openaiApiMode === 'images') {
      await runImagesGeneration(taskId, payload, config);
      return;
    }

    if (config.openaiApiMode === 'chat_completions') {
      await runChatCompletionGeneration(taskId, payload, config);
      return;
    }

    let response;
    try {
      response = await requestOpenAI('POST', '/v1/responses', {
        model: config.responsesModel,
        input: [{ role: 'user', content }],
        background: true,
        tools: [{
          type: 'image_generation',
          model: config.imageModel,
          size: mapImageSize(payload.ratio),
          quality: 'high',
          output_format: 'png'
        }]
      }, config.openaiSubmitTimeoutMs, config);
    } catch (err) {
      throw new Error(`OpenAI 调用失败：${formatError(err)}`);
    }

    task.responseId = response.id;
    task.stage = 'openai_polling';
    task.updatedAt = Date.now();

    response = await waitForOpenAIResponse(response.id, config);

    const imageUrl = extractImageUrlFromResponse(response);
    if (!imageUrl) {
      throw new Error(`OpenAI 未返回图片 URL，responseId=${response.id || ''}, status=${response.status || ''}`);
    }

    task.status = 'completed';
    task.stage = 'completed';
    task.sourceImageUrl = imageUrl;
    task.image = buildImageUrlResult(imageUrl);
    task.responseId = response.id;
    task.updatedAt = Date.now();
    logAiImageEvent('info', 'generation-completed', {
      taskId,
      channelId: config.channelId || '',
      provider: config.channelProvider,
      responseId: response.id || '',
      imageUrlHost: new URL(imageUrl).hostname,
      imageKey: ''
    });
  } catch (err) {
    logAiImageEvent('error', 'generation-failed', {
      taskId,
      channelId: config.channelId || '',
      provider: config.channelProvider,
      baseUrl: config.openaiBaseUrl,
      stage: task.stage,
      responseId: task.responseId || '',
      providerTaskId: task.providerTaskId || ''
    }, err);
    task.status = 'failed';
    task.error = formatUserFacingError(err);
    task.errorDetail = formatError(err);
    task.updatedAt = Date.now();
  }
}

async function runToapisGeneration(taskId, payload, config = getConfig()) {
  const task = tasks.get(taskId);

  task.stage = 'toapis_submitting';
  task.updatedAt = Date.now();

  const requestPayload = {
    model: config.imageModel,
    prompt: buildPrompt(payload),
    n: 1,
    size: mapToapisImageSize(payload.ratio),
    resolution: payload.resolution || payload.imageResolution || config.imageResolution || '1K',
    response_format: 'url'
  };

  if (payload.mode === 'image') {
    if (payload.referenceImageUrl) {
      requestPayload.image_urls = [payload.referenceImageUrl];
      task.referenceImageUrl = payload.referenceImageUrl;
    }
  }

  let submitResponse;
  try {
    submitResponse = await requestJsonWithConfig('POST', '/v1/images/generations', requestPayload, config.openaiSubmitTimeoutMs, config);
  } catch (err) {
    throw new Error(`Toapis 提交失败：${formatError(err)}`);
  }

  const providerTaskId = extractToapisTaskId(submitResponse);
  if (!providerTaskId) {
    throw new Error('Toapis 未返回任务 ID');
  }

  task.providerTaskId = providerTaskId;
  task.responseId = providerTaskId;
  task.stage = 'toapis_polling';
  task.updatedAt = Date.now();

  const result = await waitForToapisTask(providerTaskId, config);
  const imageUrl = extractToapisImageUrl(result);
  if (!imageUrl) {
    throw new Error(`Toapis 未返回图片 URL，taskId=${providerTaskId}`);
  }

  task.sourceImageUrl = imageUrl;
  task.status = 'completed';
  task.stage = 'completed';
  task.image = buildImageUrlResult(imageUrl);
  task.responseId = providerTaskId;
  task.updatedAt = Date.now();
}

async function runImagesGeneration(taskId, payload, config = getConfig()) {
  const task = tasks.get(taskId);

  task.stage = payload.mode === 'image' ? 'images_editing' : 'images_generating';
  task.updatedAt = Date.now();

  let response;
  try {
    if (payload.mode === 'image' && hasReferenceImage(payload)) {
      const form = new FormData();
      form.append('model', config.imageModel);
      form.append('prompt', buildPrompt(payload));
      form.append('size', mapImageSize(payload.ratio));
      form.append('n', '1');
      form.append('response_format', 'url');
      if (payload.referenceImageUrl) {
        const downloadedReference = await downloadBinary(payload.referenceImageUrl, 120000, { source: 'reference-image' });
        const contentType = normalizeImageContentType(downloadedReference.contentType);
        const ext = getExtFromMime(contentType);
        form.append('image', downloadedReference.buffer, {
          filename: `reference.${ext}`,
          contentType
        });
      }

      response = await requestOpenAIMultipart('/v1/images/edits', form, config.openaiSubmitTimeoutMs, config);
    } else {
      response = await requestOpenAI('POST', '/v1/images/generations', {
        model: config.imageModel,
        prompt: buildPrompt(payload),
        size: mapImageSize(payload.ratio),
        n: 1,
        response_format: 'url'
      }, config.openaiSubmitTimeoutMs, config);
    }
  } catch (err) {
    throw new Error(`Images API 调用失败：${formatError(err)}`);
  }

  const imageUrl = extractImageUrlFromImagesResponse(response);
  if (!imageUrl) {
    throw new Error('Images API 未返回图片 URL');
  }

  task.status = 'completed';
  task.stage = 'completed';
  task.sourceImageUrl = imageUrl;
  task.image = buildImageUrlResult(imageUrl);
  task.responseId = response.created ? String(response.created) : '';
  task.updatedAt = Date.now();
}

function normalizeImageContentType(contentType = '') {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'image/jpeg';
  if (contentType.includes('webp')) return 'image/webp';
  if (contentType.includes('png')) return 'image/png';
  return 'image/png';
}

function getExtFromMime(contentType = '') {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  return 'png';
}

async function runChatCompletionGeneration(taskId, payload, config = getConfig()) {
  const task = tasks.get(taskId);

  task.stage = 'chat_generating';
  task.updatedAt = Date.now();

  const promptText = `${buildPrompt(payload)}\n\n请直接返回生成图片的 URL，不要返回解释文字。`;
  const messageContent = hasReferenceImage(payload) && config.chatImageInputMode === 'multimodal'
    ? [
        { type: 'text', text: promptText },
        {
          type: 'image_url',
          image_url: {
            url: payload.referenceImageUrl
          }
        }
      ]
    : promptText;

  let response;
  try {
    response = await requestOpenAI('POST', '/v1/chat/completions', {
      model: config.responsesModel,
      messages: [{
        role: 'user',
        content: messageContent
      }]
    }, config.openaiSubmitTimeoutMs, config);
  } catch (err) {
    throw new Error(`Chat Completions 调用失败：${formatError(err)}`);
  }

  const imageUrl = extractImageUrlFromChatCompletion(response);
  if (!imageUrl) {
    const content = getChatCompletionContent(response);
    console.warn('Chat Completions did not return image URL', {
      taskId,
      content: typeof content === 'string' ? content.slice(0, 500) : JSON.stringify(content).slice(0, 500),
      finishReason: response && response.choices && response.choices[0] ? response.choices[0].finish_reason : ''
    });
    throw new Error(`Chat Completions 未返回图片 URL：${typeof content === 'string' ? content.slice(0, 120) : ''}`);
  }

  task.sourceImageUrl = imageUrl;
  task.status = 'completed';
  task.stage = 'completed';
  task.image = buildImageUrlResult(imageUrl);
  task.responseId = response.id;
  task.updatedAt = Date.now();
}

async function waitForOpenAIResponse(responseId, config = getConfig()) {
  let latest = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(attempt < 5 ? 3000 : 5000);
    latest = await requestOpenAI('GET', `/v1/responses/${encodeURIComponent(responseId)}`, null, config.openaiPollTimeoutMs, config);

    if (latest.status === 'completed') {
      return latest;
    }

    if (latest.status === 'failed' || latest.status === 'cancelled') {
      const message = latest.error && latest.error.message ? latest.error.message : `OpenAI 任务${latest.status}`;
      throw new Error(message);
    }
  }

  throw new Error('OpenAI 生成超时，请稍后重试');
}

async function waitForToapisTask(providerTaskId, config = getConfig()) {
  let latest = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(attempt < 5 ? 3000 : 5000);
    latest = await requestJsonWithConfig(
      'GET',
      `/v1/images/generations/${encodeURIComponent(providerTaskId)}`,
      null,
      config.openaiPollTimeoutMs,
      config
    );

    if (latest.status === 'completed') {
      return latest;
    }

    if (latest.status === 'failed' || latest.status === 'cancelled') {
      throw new Error(getToapisErrorMessage(latest));
    }
  }

  throw new Error('Toapis 生成超时，请稍后重试');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/health', (req, res) => {
  res.json({ success: true });
});

app.post('/v1/ai-image/tasks', requireSecret, (req, res) => {
  const config = getChannelConfig(req.body.channelId);
  if (config.channelId && !config.channelMatched) {
    logAiImageEvent('error', 'task-create-channel-unmatched', {
      channelId: config.channelId || '',
      requestedChannelId: req.body.channelId || ''
    });
    res.status(400).json({
      success: false,
      error: `渠道 ${config.channelId} 未匹配到 AI_IMAGE_CHANNEL_ID 配置`
    });
    return;
  }

  if (!config.apiKey) {
    logAiImageEvent('error', 'task-create-config-missing', {
      channelId: config.channelId || '',
      requestedChannelId: req.body.channelId || '',
      channelEnvKey: config.channelEnvKey || '',
      channelEnvSuffix: config.channelEnvSuffix || '',
      provider: config.channelProvider,
      apiMode: config.openaiApiMode
    });
    res.status(500).json({
      success: false,
      error: config.channelId ? `渠道 ${config.channelId} 未配置 APIKEY` : '未配置 OPENAI_API_KEY'
    });
    return;
  }

  if (req.body.mode === 'text' && (!req.body.prompt || !String(req.body.prompt).trim())) {
    res.status(400).json({ success: false, error: '创作描述不能为空' });
    return;
  }

  if (req.body.mode === 'image' && !hasReferenceImage(req.body)) {
    res.status(400).json({ success: false, error: '参考图片不能为空' });
    return;
  }

  const taskId = crypto.randomUUID();
  logAiImageEvent('info', 'task-created', {
    taskId,
    channelId: config.channelId || '',
    requestedChannelId: req.body.channelId || '',
    channelEnvKey: config.channelEnvKey || '',
    channelEnvSuffix: config.channelEnvSuffix || '',
    provider: config.channelProvider,
    apiMode: config.openaiApiMode,
    mode: req.body.mode || '',
    ratio: req.body.ratio || '',
    style: req.body.style || '',
    promptLength: req.body.prompt ? String(req.body.prompt).length : 0,
    hasReference: hasReferenceImage(req.body)
  });
  tasks.set(taskId, {
    taskId,
    channelId: config.channelId || '',
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  runGeneration(taskId, {
    ...req.body,
    channelId: config.channelId || req.body.channelId || ''
  }, config);
  res.json({ success: true, taskId, channelId: config.channelId || '', status: 'queued' });
});

app.get('/v1/ai-image/tasks/:taskId', requireSecret, (req, res) => {
  const task = tasks.get(req.params.taskId);
  if (!task) {
    logAiImageEvent('warn', 'task-query-missing', {
      taskId: req.params.taskId,
      requestedChannelId: String(req.query.channelId || req.headers['x-ai-channel-id'] || '').trim(),
      activeTaskCount: tasks.size
    });
    res.status(404).json({ success: false, error: '任务不存在' });
    return;
  }

  const requestChannelId = String(req.query.channelId || req.headers['x-ai-channel-id'] || '').trim();
  if (requestChannelId && task.channelId && requestChannelId !== task.channelId) {
    logAiImageEvent('warn', 'task-query-channel-mismatch', {
      taskId: req.params.taskId,
      requestedChannelId: requestChannelId,
      taskChannelId: task.channelId,
      status: task.status,
      stage: task.stage || ''
    });
    res.status(404).json({ success: false, error: '任务不存在' });
    return;
  }

  if (task.status === 'completed' && task.image && task.image.key) {
    try {
      const config = getConfig();
      const cos = getCosClient();
      task.image.signedUrl = cos.getObjectUrl({
        Bucket: config.cosBucket,
        Region: config.cosRegion,
        Key: task.image.key,
        Sign: true,
        Expires: 60 * 60 * 24
      });
    } catch (err) {
      console.warn('刷新 COS 临时链接失败:', err);
    }
  }

  res.json({ success: true, ...task });
});

app.listen(getConfig().port, () => {
  console.log(`AI image service listening on ${getConfig().port}`);
});
