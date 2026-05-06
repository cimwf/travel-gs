# AI Image Service

独立高清生图服务，用于绕开微信云函数 60 秒限制。

## 环境变量

必填：

```text
OPENAI_API_KEY=你的 OpenAI Key
OPENAI_BASE_URL=https://api.openai.com
OPENAI_API_MODE=images
CHAT_IMAGE_INPUT_MODE=multimodal
OPENAI_SUBMIT_TIMEOUT_MS=90000
OPENAI_POLL_TIMEOUT_MS=30000
OPENAI_IMAGE_MODEL=gpt-image-2
TENCENT_SECRET_ID=腾讯云 API SecretId
TENCENT_SECRET_KEY=腾讯云 API SecretKey
COS_BUCKET=例如 example-1250000000
COS_REGION=例如 ap-shanghai
```

建议填写：

```text
AI_IMAGE_SERVICE_SECRET=一段随机密钥
OPENAI_RESPONSES_MODEL=gpt-4.1-mini
COS_PUBLIC_BASE_URL=https://你的自定义域名或 COS 公网域名
```

如果部署环境无法直连 OpenAI，可以把 `OPENAI_BASE_URL` 配置为你自己的可访问中转地址。地址可以是根地址，例如 `https://api.openai.com`，也可以是带 `/v1` 的地址。

推荐使用 `OPENAI_API_MODE=images`：

- 文生图：`/v1/images/generations`
- 图生图：`/v1/images/edits`
- 服务会请求 URL 返回格式，下载图片后上传到 COS。

如果你的网关通过 `/v1/chat/completions` 返回图片 URL，把 `OPENAI_API_MODE` 改成：

```text
OPENAI_API_MODE=chat_completions
OPENAI_RESPONSES_MODEL=gpt-5.5
```

如果你的网关在 `/v1/chat/completions` 下不支持图生图多模态输入，可临时设置：

```text
CHAT_IMAGE_INPUT_MODE=text
```

这样图生图不会附带参考图二进制，只会把参考图要求写进文本提示词；是否能真正参考图片取决于网关能力。

## 启动

```bash
npm install
npm start
```

## 接口

创建任务：

```http
POST /v1/ai-image/tasks
```

查询任务：

```http
GET /v1/ai-image/tasks/:taskId
```

如果配置了 `AI_IMAGE_SERVICE_SECRET`，请求需要带：

```text
X-AI-Service-Secret: 同一段密钥
```
