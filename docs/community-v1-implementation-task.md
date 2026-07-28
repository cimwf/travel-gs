# 社区 V1 开发任务单

> 执行角色：Claude Code
> 复核角色：Codex
> 日期：2026-07-27
> 状态：已实现；本文保留为实施记录，实际上线以测试指南和上线清单为准
> 产品与技术基线：`docs/community-v1-product-tech-spec.md`

## 1. 交付目标

在现有微信小程序中完整增加「社区」V1：

1. 底部 Tab 从「行程 / 我的」调整为「行程 / 社区 / 我的」。
2. 社区首页可以浏览公开动态。
3. 已登录用户可以发布文字、0～9 张图片和可选定位。
4. 图片使用腾讯云 COS，不经过微信云存储中转。
5. 微信云函数仍是唯一后端，不增加独立服务器。
6. 没有 SecretId/SecretKey 时，项目仍可编译，社区纯文字发布和列表功能不得被 COS 配置拖垮；图片上传应给出明确配置提示。

## 2. 视觉基准

社区首页参考图：

```text
/Users/shan/.codex/generated_images/019f6506-a4d4-7db1-9774-24137bcc1805/call_8UgEfeoRYad2hIjEt4Z6cDsI.png
```

发布页参考图：

```text
/Users/shan/.codex/generated_images/019f6506-a4d4-7db1-9774-24137bcc1805/call_5kHfthmZTcOh63KudDDndoZR.png
```

实现要求：

- 使用原生微信小程序 WXML/WXSS/JS，不创建 Web 原型替代真实页面。
- 延续项目现有 `#4A90E2` 主色、系统中文字体和轻量白色界面。
- 首页保留参考图的头像、昵称、时间、正文、定位和 1/3/9 图布局。
- V1 不做点赞和评论，因此不要保留不可操作的点赞/评论按钮；这是相对参考图的有意产品差异。
- 社区和发布页均使用系统导航栏；社区使用右下角加号，发布按钮位于页面底部。
- 所有核心按钮必须真实可操作，不使用静态假按钮。
- 不使用 emoji 代替核心 UI 图标；优先复用项目已有 PNG 图标或使用微信原生能力。新增 Tab 图标必须是符合微信要求的本地 PNG。
- 列表需有加载、空、失败、触底无更多、下拉刷新状态；发布需有上传进度、单图失败重试、防重复提交状态。

## 3. 前端范围

新增页面：

```text
miniprogram/pages/community/community
miniprogram/pages/community-publish/community-publish
```

修改：

```text
miniprogram/app.json
miniprogram/utils/api.js
miniprogram/images/
```

### 3.1 社区首页

- `community/list` 游标分页，每页 10 条。
- 下拉刷新清空游标，触底加载下一页，避免重复请求。
- 点击右上发布按钮：
  - 已登录：进入发布页。
  - 未登录：保存 `/pages/community-publish/community-publish` deep link 后进入登录页。
- 点击图片调用 `wx.previewImage`。
- 点击定位调用 `wx.openLocation`。
- 作者本人通过更多菜单删除，其他用户显示举报入口并明确“功能建设中”或接入安全的占位行为，不伪造成功。
- 页面从发布页返回时，如果存在发布成功标记，刷新首屏。
- 时间显示支持“刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期”。
- 图片布局规则：
  - 1 图：大图。
  - 2 图：两列。
  - 3～9 图：三列。

### 3.2 发布页

- 正文上限 300 字。
- 使用 `wx.chooseMedia` 选择相册/相机图片，最多补足到 9 张。
- 选择后读取图片尺寸，尽可能先压缩；不支持 GIF 和视频。
- 单张压缩后仍超过 10 MB 时阻止上传并说明原因。
- 图片可删除、可预览、失败后可单张重试。
- 位置通过 `wx.chooseLocation` 选择，并允许移除。
- 正文、图片、位置至少一项不为空。
- 纯文字或纯位置动态不需要 COS 凭证，应能正常发布。
- 有图片时：
  1. 调用 `community/createUploadSession`。
  2. 使用官方 `cos-wx-sdk-v5` 和临时凭证直传 COS。
  3. 最大并发 3。
  4. 上传完调用 `community/create`。
- 发布中禁止退出造成重复提交；失败时保留页面输入。
- 成功后设置刷新标记并返回社区 Tab。

## 4. COS 固定配置

```text
Bucket: imagica-images-1436573577
Region: ap-beijing
Base URL: https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com
Root prefix: miniapp/
Community prefix: miniapp/community/
ACL: 公有读、私有写
```

对象 Key：

```text
miniapp/community/{yyyy}/{MM}/{draftId}/{uuid}.{ext}
```

约束：

- 对象 Key 不包含 openid、昵称、手机号。
- 不允许覆盖旧对象。
- 允许 `image/jpeg`、`image/png`、`image/webp`。
- 单张最大 10 MB，总数最多 9。
- 永久密钥不得写入前端、仓库、示例配置或日志。

## 5. 云函数范围

在现有 `cloudfunctions/api` 中新增 `handlers/community.js`，并在统一路由注册：

```text
community/list
community/createUploadSession
community/create
community/delete
```

### 5.1 `community/list`

- 仅返回 `status=active` 且 `reviewStatus=approved` 的公开内容。
- 首版游标至少包含 `createdAt`；如实现复合游标，需保持向后兼容。
- 返回当前用户是否为作者，前端不得自己用客户端传入 openid 判断权限。
- 头像如果是 `cloud://`，沿用现有临时 URL 解析方式。

### 5.2 `community/createUploadSession`

- 必须要求当前 openid 对应已注册用户。
- 创建 `community_upload_drafts` 草稿，状态 `uploading`，24 小时过期。
- 使用 `qcloud-cos-sts` 生成 15 分钟临时凭证。
- STS 策略只允许云函数为本次草稿逐张生成的精确对象 Key 执行
  `name/cos:PutObject`，并限制大小和图片 Content-Type。
- 不开放任意 Bucket、任意 Key、删除和读取权限。
- 缺少 COS 环境变量时返回稳定错误码：

```text
COS_NOT_CONFIGURED
```

- 返回 Bucket、Region、Base URL、allowedPrefix、逐文件 `uploadItems` 和临时
  凭证，不返回永久密钥；客户端不能自行生成或替换对象 Key。

### 5.3 `community/create`

- 要求已注册用户。
- 校验 300 字、最多 9 图、至少一项内容。
- 有图片时必须校验：
  - 草稿存在、属于当前用户、未过期且未完成。
  - Key 必须精确存在于草稿的 `uploadItems` 中，且不能重复提交。
  - URL 必须由服务端根据 Key 和固定 Base URL生成，不能信任客户端 URL。
  - 使用 `cos-nodejs-sdk-v5` 的 `headObject` 验证对象存在、大小、Content-Type。
- 作者昵称和头像从 `users` 集合读取，不能信任客户端提交。
- 使用数据库事务或等价的幂等保护，保证同一草稿只能发布一次。
- 纯文字和定位文字执行微信 `msgSecCheck`，仅 `pass` 可创建。
- 图片调用微信 `mediaCheckAsync`，由消息推送事件 `wxa_media_check` 触发
  `community-media-check-result` 汇总审核结果。
- 图片动态默认 `reviewStatus=reviewing`；公共列表不展示，我的作品可查看状态。
- 所有图片 `pass` 自动变为 `approved`；`review` 或 `risky` 变为
  `manual_review`。
- 返回新动态。

### 5.4 `community/delete`

- 只能删除本人动态。
- 软删除，写入 `status=deleted` 和 `deletedAt`。
- 软删除后立即删除 COS 对象；失败项写入 `community_cleanup_tasks`。

## 6. 依赖和配置

云函数依赖：

```text
qcloud-cos-sts
cos-nodejs-sdk-v5
```

前端依赖：

```text
cos-wx-sdk-v5
```

前端 SDK 必须采用适合当前项目的可复现集成方式：

- 优先使用小程序 npm 构建并提交必要的配置/锁文件。
- 如果当前工具链不能可靠构建小程序 npm，可以将官方发布包的浏览器/小程序构建产物放到 `miniprogram/vendor/`，同时记录包名、固定版本和来源，不手写 COS 签名算法。

云函数环境变量：

```text
COS_SECRET_ID
COS_SECRET_KEY
COMMUNITY_COS_BUCKET=imagica-images-1436573577
COMMUNITY_COS_REGION=ap-beijing
COMMUNITY_COS_BASE_URL=https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com
COMMUNITY_COS_PREFIX=miniapp/community/
```

当前不会提供 SecretId/SecretKey。实现和测试必须能在缺少密钥时完成，涉及真实图片上传的集成测试标记为待配置，不得填假密钥。

## 7. 数据库

更新 `database/schema.js` 和相关配置说明，增加：

```text
community_posts
community_image_audits
community_upload_drafts
community_cleanup_tasks
```

至少记录以下索引要求：

```text
community_posts: status + reviewStatus + createdAt + _id
community_posts: authorId + status + createdAt + _id
community_posts: draftId（唯一）
community_image_audits: postId
community_image_audits: expiresAt
community_upload_drafts: ownerId + status + createdAt
community_upload_drafts: expiresAt
community_cleanup_tasks: status + createdAt
```

不要在代码中假装索引已经自动创建；将控制台操作写入部署说明。

## 8. 测试要求

新增社区专项测试并接入根目录 npm scripts，至少覆盖：

- `app.json` 的三 Tab 顺序和新页面注册。
- 未登录发布跳转登录页并保存 deep link。
- 正文长度、空内容、9 图上限。
- 纯文字发布不请求上传凭证。
- 多图上传最大并发不超过 3。
- 单图失败可重试，失败时不提交动态。
- 云函数缺少 COS 配置返回 `COS_NOT_CONFIGURED`。
- 上传会话不能为任意 Key 签发权限。
- 创建动态拒绝越权 Key、伪造 URL、超数量和重复草稿。
- 删除只能由作者执行。
- 列表只返回审核通过且未删除内容。

运行并记录：

```text
npm test
npm run test:metrics
npm run test:e2e
npm run test:core
npm run test:trip-log
npm run test:community
```

同时运行：

```text
git diff --check
```

## 9. 不允许的改动

- 不迁移现有行程日志图片。
- 不修改现有云开发环境 ID。
- 不加入点赞、评论、关注、私信、视频或推荐算法。
- 不删除或覆盖当前工作区中已有的未提交文档。
- 不提交 Git commit，由 Codex 复核通过后统一处理。
- 不把测试夹具、假用户或演示动态放进正式社区列表。

## 10. Claude 执行流程

1. 先阅读本任务单、产品技术方案、两张视觉参考图和相关现有页面。
2. 使用已安装的 Codex 插件检查实现计划，吸收其意见后再改代码。
3. 完成全部实现和测试。
4. 再使用 Codex 插件做一次代码检查，修复其指出的 P0/P1/P2 问题。
5. 向外层复核者报告：
   - 修改文件清单。
   - 架构说明。
   - 测试命令和结果。
   - 未使用 SecretId/SecretKey 时无法完成的真实联调项。
   - 任何仍需人工在微信/腾讯云控制台完成的步骤。

## 11. 完成标准

只有同时满足以下条件才可声明开发完成：

- 社区、发布和我的作品三个页面及主要交互已经实现。
- 云函数接口和权限校验已经实现。
- COS 永久密钥未泄露。
- 无密钥状态可预测、可理解，不导致页面崩溃。
- 社区专项测试和原有测试全部通过。
- `git diff --check` 通过。
- 没有明显回归或未说明的高风险项。
