# AI 生图服务端修改跟踪

**更新时间**：2026-05-11

---

## 状态总览

| 编号 | 项目 | 状态 | 说明 |
|---|---|---|---|
| R9 | 错误映射三端共享配置 | 已完成 | 已抽共享规则源，并生成三端本地规则模块 |
| R13 | HTTP keepAlive agent | 已完成 | AI 服务和云函数手写 HTTP 请求已接入 |
| R14 | 渠道 env suffix 缓存 | 已完成 | AI 服务启动时缓存 `channelId -> suffix` |
| R15 | Node 版本声明 | 已完成 | `package.json` / lockfile / README 已同步 |
| R16 | COS_BUCKET 格式说明 | 已完成 | README / 部署指南已同步 |

---

## 已完成项

### R9 错误映射三端共享配置

**位置**：
- [shared/ai-image-error-rules.json](../../shared/ai-image-error-rules.json)
- [scripts/sync-ai-image-error-rules.js](../../scripts/sync-ai-image-error-rules.js)
- [miniprogram/utils/ai-image-error.js](../../miniprogram/utils/ai-image-error.js) — `formatAiImageErrorMessage`
- [cloudfunctions/api/index.js](../../cloudfunctions/api/index.js) — `getAiImageErrorText`
- [services/ai-image-service/src/server.js](../../services/ai-image-service/src/server.js) — `formatUserFacingError`

**已修改**：
- 新增共享规则源 `shared/ai-image-error-rules.json`。
- 新增同步脚本 `scripts/sync-ai-image-error-rules.js`，生成三端本地规则模块。
- 三端错误函数已改为调用生成模块里的 `formatAiImageSharedErrorMessage`。
- `npm run test:ai:unit` 已加入生成文件同步检查。

### R13 HTTP keepAlive agent

**位置**：
- [cloudfunctions/api/index.js](../../cloudfunctions/api/index.js) — `requestOpenAI` / `requestJsonUrl`
- [services/ai-image-service/src/server.js](../../services/ai-image-service/src/server.js) — `requestOpenAI` / `requestOpenAIMultipart` / `downloadBinary`

**已修改**：
- 云函数侧新增 keepAlive `http.Agent` / `https.Agent`。
- AI 服务侧新增 keepAlive `http.Agent` / `https.Agent`。
- AI 服务侧新增 `AI_IMAGE_HTTP_MAX_SOCKETS`，默认 `10`。

### R14 渠道 env suffix 缓存

**位置**：[services/ai-image-service/src/server.js](../../services/ai-image-service/src/server.js)

**已修改**：服务启动时构建 `channelId -> suffix` 缓存，`getChannelSuffixFromEnv` 后续直接查表。

### R15 Node 版本声明

**位置**：
- [services/ai-image-service/package.json](../../services/ai-image-service/package.json)
- [services/ai-image-service/package-lock.json](../../services/ai-image-service/package-lock.json)
- [services/ai-image-service/README.md](../../services/ai-image-service/README.md)

**已修改**：声明 AI 服务 Node.js 最低版本为 `>=14.17.0`。Dockerfile 当前使用 `node:20-alpine`，无需修改。

### R16 COS_BUCKET 格式说明

**位置**：
- [services/ai-image-service/README.md](../../services/ai-image-service/README.md)
- [docs/deploy-guide.md](../deploy-guide.md)

**已修改**：补充 `COS_BUCKET=example-1250000000` 示例，并明确必须包含腾讯云 appid 后缀；同时补充 `COS_PUBLIC_BASE_URL` 配置说明。

---

## 剩余待做

### COS SDK agent 配置调研

**优先级**：P3

**现状**：本轮只给手写 HTTP/HTTPS 请求接入 keepAlive。腾讯 COS SDK 是否支持稳定注入 agent 还未确认。

**待做**：后续如上传链路压力变高，再调研 COS SDK agent 配置方式。
