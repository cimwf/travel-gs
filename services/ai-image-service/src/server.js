const crypto = require('crypto');
const https = require('https');
const http = require('http');
const express = require('express');
const COS = require('cos-nodejs-sdk-v5');
const FormData = require('form-data');

const app = express();
app.use(express.json({ limit: '30mb' }));

const tasks = new Map();

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function getConfig() {
  return {
    port: Number(env('PORT', '3000')),
    apiKey: env('OPENAI_API_KEY'),
    openaiBaseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com'),
    openaiApiMode: env('OPENAI_API_MODE', 'images'),
    chatImageInputMode: env('CHAT_IMAGE_INPUT_MODE', 'multimodal'),
    openaiSubmitTimeoutMs: Number(env('OPENAI_SUBMIT_TIMEOUT_MS', '90000')),
    openaiPollTimeoutMs: Number(env('OPENAI_POLL_TIMEOUT_MS', '30000')),
    imageModel: env('OPENAI_IMAGE_MODEL', 'gpt-image-2'),
    responsesModel: env('OPENAI_RESPONSES_MODEL', 'gpt-4.1-mini'),
    sharedSecret: env('AI_IMAGE_SERVICE_SECRET'),
    cosSecretId: env('TENCENT_SECRET_ID'),
    cosSecretKey: env('TENCENT_SECRET_KEY'),
    cosBucket: env('COS_BUCKET'),
    cosRegion: env('COS_REGION'),
    publicBaseUrl: env('COS_PUBLIC_BASE_URL')
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

function requestOpenAI(method, path, payload, timeoutMs = 180000) {
  const { apiKey, openaiBaseUrl } = getConfig();
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

function getOpenAIRequestOptions(method, path, headers = {}) {
  const { apiKey, openaiBaseUrl } = getConfig();
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
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...headers
      }
    }
  };
}

function requestOpenAIMultipart(path, form, timeoutMs = 180000) {
  const { transport, options } = getOpenAIRequestOptions('POST', path, form.getHeaders());

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
    '9:16': '1024x1536'
  };
  return sizeMap[ratio] || '1024x1024';
}

function buildPrompt(data) {
  const rawStyle = String(data.style || '').trim();
  const style = ['none', '无', '不要', '不加风格', '无风格'].includes(rawStyle) ? '' : rawStyle;
  const parts = [
    String(data.prompt || '').trim() || (data.mode === 'image' ? '请基于参考图生成一张高质量图片' : ''),
    style ? `视觉风格：${style}` : '',
    '请生成适合在旅行社交小程序中展示的高质量图片。'
  ].filter(Boolean);

  if (data.mode === 'image' && data.referenceImageBase64) {
    parts.push('请以我上传的参考图为基础进行图生图：尽量保留参考图中的主体、构图、姿态和关键视觉元素，只按我的描述调整风格与画面。');
  }

  return parts.join('\n');
}

function extractImageBase64(response) {
  for (const item of response.output || []) {
    if (item.type === 'image_generation_call' && item.result) {
      return item.result;
    }

    for (const contentItem of item.content || []) {
      if (contentItem.type === 'image_generation_call' && contentItem.result) {
        return contentItem.result;
      }
    }
  }

  return '';
}

function extractImageUrlFromImagesResponse(response) {
  return response && response.data && response.data[0] && response.data[0].url
    ? response.data[0].url
    : '';
}

function extractImageBase64FromImagesResponse(response) {
  return response && response.data && response.data[0] && response.data[0].b64_json
    ? response.data[0].b64_json
    : '';
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

function downloadBinary(url, timeoutMs = 120000) {
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const req = transport.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'GET'
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadBinary(new URL(res.headers.location, url).toString(), timeoutMs));
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

async function uploadToCos(taskId, imageBase64) {
  return await uploadBufferToCos(taskId, Buffer.from(imageBase64, 'base64'), 'image/png', 'png');
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

async function runGeneration(taskId, payload) {
  const config = getConfig();
  const task = tasks.get(taskId);

  try {
    task.status = 'in_progress';
    task.stage = 'openai_submitting';
    task.updatedAt = Date.now();

    const content = [{ type: 'input_text', text: buildPrompt(payload) }];
    if (payload.referenceImageBase64) {
      content.push({
        type: 'input_image',
        image_url: `data:${payload.referenceMimeType || 'image/jpeg'};base64,${payload.referenceImageBase64}`
      });
    }

    if (config.openaiApiMode === 'images') {
      await runImagesGeneration(taskId, payload);
      return;
    }

    if (config.openaiApiMode === 'chat_completions') {
      await runChatCompletionGeneration(taskId, payload);
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
      }, config.openaiSubmitTimeoutMs);
    } catch (err) {
      throw new Error(`OpenAI 调用失败：${formatError(err)}`);
    }

    task.responseId = response.id;
    task.stage = 'openai_polling';
    task.updatedAt = Date.now();

    response = await waitForOpenAIResponse(response.id);

    const imageBase64 = extractImageBase64(response);
    if (!imageBase64) {
      throw new Error(`OpenAI 未返回图片数据，responseId=${response.id || ''}, status=${response.status || ''}`);
    }

    task.stage = 'cos_uploading';
    task.updatedAt = Date.now();

    let uploaded;
    try {
      uploaded = await uploadToCos(taskId, imageBase64);
    } catch (err) {
      throw new Error(`COS 上传失败：${formatError(err)}`);
    }

    task.status = 'completed';
    task.stage = 'completed';
    task.image = uploaded;
    task.responseId = response.id;
    task.updatedAt = Date.now();
  } catch (err) {
    console.error('AI image generation failed', {
      taskId,
      stage: task.stage,
      error: formatError(err),
      rawError: err
    });
    task.status = 'failed';
    task.error = formatError(err);
    task.updatedAt = Date.now();
  }
}

async function runImagesGeneration(taskId, payload) {
  const config = getConfig();
  const task = tasks.get(taskId);

  task.stage = payload.mode === 'image' ? 'images_editing' : 'images_generating';
  task.updatedAt = Date.now();

  let response;
  try {
    if (payload.mode === 'image' && payload.referenceImageBase64) {
      const ext = getExtFromMime(payload.referenceMimeType || 'image/jpeg');
      const form = new FormData();
      form.append('model', config.imageModel);
      form.append('prompt', buildPrompt(payload));
      form.append('size', mapImageSize(payload.ratio));
      form.append('n', '1');
      form.append('response_format', 'url');
      form.append('image', Buffer.from(payload.referenceImageBase64, 'base64'), {
        filename: `reference.${ext}`,
        contentType: payload.referenceMimeType || 'image/jpeg'
      });

      response = await requestOpenAIMultipart('/v1/images/edits', form, config.openaiSubmitTimeoutMs);
    } else {
      response = await requestOpenAI('POST', '/v1/images/generations', {
        model: config.imageModel,
        prompt: buildPrompt(payload),
        size: mapImageSize(payload.ratio),
        n: 1,
        response_format: 'url'
      }, config.openaiSubmitTimeoutMs);
    }
  } catch (err) {
    throw new Error(`Images API 调用失败：${formatError(err)}`);
  }

  let downloaded;
  const imageUrl = extractImageUrlFromImagesResponse(response);
  const imageBase64 = extractImageBase64FromImagesResponse(response);

  task.stage = 'image_downloading';
  task.sourceImageUrl = imageUrl || '';
  task.updatedAt = Date.now();

  try {
    if (imageUrl) {
      downloaded = await downloadBinary(imageUrl);
    } else if (imageBase64) {
      downloaded = {
        buffer: Buffer.from(imageBase64, 'base64'),
        contentType: 'image/png'
      };
    } else {
      throw new Error('Images API 未返回图片 URL 或 base64');
    }
  } catch (err) {
    throw new Error(`图片获取失败：${formatError(err)}`);
  }

  task.stage = 'cos_uploading';
  task.updatedAt = Date.now();

  const contentType = normalizeImageContentType(downloaded.contentType);
  const ext = getExtFromMime(contentType);

  let uploaded;
  try {
    uploaded = await uploadBufferToCos(taskId, downloaded.buffer, contentType, ext);
  } catch (err) {
    throw new Error(`COS 上传失败：${formatError(err)}`);
  }

  task.status = 'completed';
  task.stage = 'completed';
  task.image = uploaded;
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

async function runChatCompletionGeneration(taskId, payload) {
  const config = getConfig();
  const task = tasks.get(taskId);

  task.stage = 'chat_generating';
  task.updatedAt = Date.now();

  const promptText = `${buildPrompt(payload)}\n\n请直接返回生成图片的 URL，不要返回解释文字。`;
  const messageContent = payload.referenceImageBase64 && config.chatImageInputMode === 'multimodal'
    ? [
        { type: 'text', text: promptText },
        {
          type: 'image_url',
          image_url: {
            url: `data:${payload.referenceMimeType || 'image/jpeg'};base64,${payload.referenceImageBase64}`
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
    }, config.openaiSubmitTimeoutMs);
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

  task.stage = 'image_downloading';
  task.sourceImageUrl = imageUrl;
  task.updatedAt = Date.now();

  let downloaded;
  try {
    downloaded = await downloadBinary(imageUrl);
  } catch (err) {
    throw new Error(`图片下载失败：${formatError(err)}`);
  }

  task.stage = 'cos_uploading';
  task.updatedAt = Date.now();

  const contentType = downloaded.contentType.includes('jpeg') ? 'image/jpeg' : downloaded.contentType.includes('webp') ? 'image/webp' : 'image/png';
  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';

  let uploaded;
  try {
    uploaded = await uploadBufferToCos(taskId, downloaded.buffer, contentType, ext);
  } catch (err) {
    throw new Error(`COS 上传失败：${formatError(err)}`);
  }

  task.status = 'completed';
  task.stage = 'completed';
  task.image = uploaded;
  task.responseId = response.id;
  task.updatedAt = Date.now();
}

async function waitForOpenAIResponse(responseId) {
  let latest = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(attempt < 5 ? 3000 : 5000);
    latest = await requestOpenAI('GET', `/v1/responses/${encodeURIComponent(responseId)}`, null, getConfig().openaiPollTimeoutMs);

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/health', (req, res) => {
  res.json({ success: true });
});

app.post('/v1/ai-image/tasks', requireSecret, (req, res) => {
  const config = getConfig();
  if (!config.apiKey) {
    res.status(500).json({ success: false, error: '未配置 OPENAI_API_KEY' });
    return;
  }

  if (req.body.mode === 'text' && (!req.body.prompt || !String(req.body.prompt).trim())) {
    res.status(400).json({ success: false, error: '创作描述不能为空' });
    return;
  }

  if (req.body.mode === 'image' && !req.body.referenceImageBase64) {
    res.status(400).json({ success: false, error: '参考图片不能为空' });
    return;
  }

  const taskId = crypto.randomUUID();
  tasks.set(taskId, {
    taskId,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  runGeneration(taskId, req.body);
  res.json({ success: true, taskId, status: 'queued' });
});

app.get('/v1/ai-image/tasks/:taskId', requireSecret, (req, res) => {
  const task = tasks.get(req.params.taskId);
  if (!task) {
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
