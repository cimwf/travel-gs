# 社区 V1 产品与技术方案

> 状态：V1 已实现并完成首轮联调；正式上线仍需执行上线清单
> 日期：2026-07-28
> 适用范围：微信小程序新增「社区」Tab，不改动现有行程日志和云存储链路
> 上线检查：见 `docs/community-v1-release-checklist.md`

## 1. 目标

社区 V1 只解决两个核心问题：

1. 用户可以浏览其他用户公开发布的旅行动态。
2. 登录用户可以发布文字、图片和可选定位。

社区基础发布与审核完成后，V1.1 增加社区信息流点赞，V1.2 增加纯文本一级评论；
关注、转发、话题、推荐算法和私密可见范围仍不在当前范围。

## 2. 已确定的产品规则

### 2.1 页面

社区当前包含五个页面：

- `pages/community/community`：社区信息流。
- `pages/community-detail/community-detail`：动态详情、点赞预览和评论列表。
- `pages/community-likes/community-likes`：完整点赞用户列表。
- `pages/community-publish/community-publish`：发布社区动态。
- `pages/community-mine/community-mine`：我的作品，展示本人所有未删除作品及审核状态。

底部 Tab 固定为：

1. 行程
2. 社区
3. 我的

社区信息流允许未登录用户浏览；点击发布时检查登录，未登录用户进入现有登录流程。

### 2.2 社区信息流

- 按发布时间倒序展示。
- 每页 10 条。
- 支持下拉刷新和触底加载。
- 每条动态展示头像、昵称、发布时间、正文、定位和图片。
- 1 张图片使用大图布局。
- 2～3 张图片使用等宽网格。
- 4～9 张图片使用三列网格。
- 点击图片进入微信原生图片预览。
- 点击定位调用 `wx.openLocation`。
- 右上角更多菜单第一版只提供：
  - 作者本人：删除动态。
  - 其他用户：举报入口预留，正式上线前接入。
- 卡片右下角展示点赞按钮、点赞数和当前用户是否已点赞。
- 点赞右侧展示评论入口和实时评论数；点击评论或动态内容区域进入详情页。

### 2.3 发布动态

- 正文最大 300 字。
- 图片最多 9 张。
- 定位可选。
- 正文、图片、定位至少填写一项。
- 图片来源支持相册和相机。
- 图片上传过程中显示总进度和失败项。
- 单张上传失败只重试失败图片。
- 发布成功后返回社区首页；图片作品审核通过后才会进入公共信息流。
- 发布按钮需要防重复点击。
- 发布按钮位于页面底部，提交期间显示 loading。

### 2.4 删除

- 只有作者本人可以删除动态。
- 数据库先执行软删除。
- 随后立即尝试物理删除 COS 图片。
- 删除失败的对象写入 `community_cleanup_tasks`，等待重试或人工处理。
- 当前没有 7 天恢复期，用户确认删除后不可恢复。

### 2.5 点赞

- 未登录用户可以浏览点赞数，点击点赞时进入登录流程。
- 登录用户可点赞和取消点赞；同一用户对同一作品最多保留一条点赞记录。
- 点赞记录保存用户 ID、昵称、头像和点赞时间，供详情页预览和完整点赞列表展示。
- 昵称和头像保存点赞时快照；如后续要求资料实时更新，再关联用户表刷新。
- 点赞记录和作品 `likeCount` 在同一事务中更新。
- 只允许点赞 `active + approved` 的公开作品。
- 详情页加载前 12 位点赞用户；点击“查看全部”进入稳定分页的完整列表。
- 点赞列表中的头像和用户行可以进入现有个人主页。
- 删除作品时同时清理其点赞记录。

### 2.6 评论入口

- 与点赞一起放在动态卡片右下角。
- 详情页主评论按创建时间倒序稳定分页；每条主评论下的回复按时间正序平铺展示。
- 登录用户通过底部输入框和键盘发送动作发表评论，不展示独立发送按钮。
- 评论正文最大 300 字，服务端使用 `msgSecCheck` V2、社交场景检测；只有
  `pass` 才写入数据库。
- 评论者可长按删除自己的评论；作品作者可长按删除自己作品下的任意评论。
- 其他用户长按评论不展示删除操作；云函数仍会再次校验评论作者或作品作者身份。
- 删除评论使用软删除，并在同一事务中同步减少作品 `commentCount`，数量不低于 0。
- 点击主评论或回复时间右侧的“回复”按钮后进入回复状态，输入框提示
  “回复给XX”；回复展示格式为
  “A 回复 B：内容”。所有回复仍归属同一条主评论，不继续增加视觉缩进层级。
- 主评论默认展示前 3 条回复，可点击“展开更多回复”继续分页。
- `commentCount` 统计主评论和回复总数。
- 删除单条回复只删除该回复；删除主评论时，其下全部回复同时隐藏并从总数扣除。
- 回复正文同样使用 `msgSecCheck`，最大 300 字。
- 第一版不做评论点赞、评论图片和评论举报。

## 3. 已选视觉方向

### 3.1 社区首页

采用已确认的社区首页方案 1：

- 白色主界面。
- `#4A90E2` 为主色。
- 使用与行程页一致的系统导航栏，标题「社区」。
- 右下角使用蓝色圆形加号发布入口。
- 以旅行图片为核心的纵向动态流。
- 轻分割线、少阴影、较大留白。

### 3.2 发布页

采用已确认的发布页方案 1：

- 使用系统导航栏，标题「发布动态」。
- 头像和大面积文字输入区。
- 三列图片网格。
- 图片数量提示。
- 定位和公开可见设置行。
- 蓝色发布按钮固定在页面内容底部。

V1 只有公开发布，因此「所有人可见」保持固定值，不提供切换选项；保留展示是为了明确发布范围。

## 4. COS 存储方案

### 4.1 固定配置

| 配置 | 值 |
|---|---|
| Bucket | `imagica-images-1436573577` |
| Region | `ap-beijing` |
| 访问域名 | `https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com` |
| 权限 | 公有读、私有写 |
| 小程序根前缀 | `miniapp/` |
| 社区图片前缀 | `miniapp/community/` |

COS 目录是对象 Key 的前缀，不需要在控制台提前创建。第一张图片上传后目录自动出现。

### 4.2 对象 Key

采用以下格式：

```text
miniapp/community/{yyyy}/{MM}/{draftId}/{uuid}.{ext}
```

示例：

```text
miniapp/community/2026/07/post_draft_8f31/6c7d2f0e.jpg
```

规则：

- URL 中不出现 openid、手机号、昵称等用户信息。
- 文件名使用 UUID。
- 不覆盖已有对象。
- 只允许 `jpg`、`jpeg`、`png` 和 `webp`。
- GIF 和视频不在 V1 范围。

### 4.3 图片限制

- 客户端选择后优先调用 `wx.compressImage`。
- 单张上传文件最大 10 MB。
- 发布时由云函数通过 COS `headObject` 再次校验文件大小和 Content-Type。
- 云函数不信任客户端上报的文件后缀、大小和 URL。
- V1 保留原图比例，不做裁剪。
- 后续缩略图和 WebP 可在不改变数据库结构的情况下增加。

### 4.4 数据库存储

数据库不存 COS 密钥，不存本地临时路径，只存稳定对象信息：

```js
{
  provider: "cos",
  key: "miniapp/community/2026/07/post_draft_8f31/6c7d2f0e.jpg",
  url: "https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com/miniapp/community/2026/07/post_draft_8f31/6c7d2f0e.jpg",
  width: 1920,
  height: 1280,
  size: 856231,
  mimeType: "image/jpeg",
  sort: 0
}
```

Bucket 当前为公有读，因此展示时可以直接使用 `url`，不需要生成临时签名链接。

## 5. 上传架构

### 5.1 决策

不新增独立后端，现有微信云函数仍是小程序唯一后端。采用“云函数签发最小权限临时凭证，小程序直传 COS”：

- 永久 `SecretId` 和 `SecretKey` 只配置在云函数环境变量中，绝不进入小程序包。
- 云函数通过 `qcloud-cos-sts` 签发 15 分钟有效的临时凭证。
- 临时凭证只允许向云函数为本次草稿生成的每一个精确对象 Key 执行
  `PutObject`，不能写入同目录下的其他对象，不能读取或删除对象。
- 小程序使用官方 `cos-wx-sdk-v5` 把本地图片直接上传 COS。
- 云函数不接收图片二进制，也不使用 base64 通过 `wx.cloud.callFunction` 传图。
- 不采用“先传微信云存储、再由云函数搬运到 COS”，避免双倍流量、额外耗时和临时文件清理。

云函数无法直接读取手机上的 `wxfile://` 临时文件，所以让云函数自身执行 `putObject` 并不适合本项目。

### 5.2 上传会话

上传流程：

1. 小程序调用 `community/createUploadSession`。
2. 云函数从微信上下文获取真实 openid，创建归属于该用户的 `draftId`。
3. 云函数根据客户端提交的文件数量、MIME 和大小，为每张图片生成一个
   不可由客户端指定的 UUID Key，并签发限定到这些精确 Key、15 分钟有效的
   STS 临时凭证。
4. 小程序通过 `cos-wx-sdk-v5` 直接上传，最多 3 张并发。
5. 小程序保存每张图的 Key、URL、尺寸、大小和顺序。
6. 全部上传完成后调用 `community/create`。
7. 云函数校验草稿归属、Key 前缀，并通过 COS `headObject` 确认对象真实存在且符合限制，再创建动态。

`community/createUploadSession` 响应：

```js
{
  success: true,
  draftId: "post_draft_8f31",
  bucket: "imagica-images-1436573577",
  region: "ap-beijing",
  baseUrl: "https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com",
  allowedPrefix: "miniapp/community/2026/07/post_draft_8f31/",
  uploadItems: [
    {
      index: 0,
      cosKey: "miniapp/community/2026/07/post_draft_8f31/6c7d2f0e.jpg",
      maxSize: 10485760,
      allowedMime: "image/jpeg"
    }
  ],
  credentials: {
    tmpSecretId: "<临时 SecretId>",
    tmpSecretKey: "<临时 SecretKey>",
    sessionToken: "<临时 Token>",
    startTime: 1785149400,
    expiredTime: 1785150300
  }
}
```

STS 权限策略由云函数动态生成，资源列表固定为本次 `uploadItems` 中的精确
Key，Action 只开放 `name/cos:PutObject`，并限制上传大小和图片 Content-Type。
客户端不能自行指定 Key、扩大目录或延长有效期。

### 5.3 凭证与权限边界

- 云函数使用一个单独的腾讯云 CAM 子用户密钥申请临时凭证。
- CAM 子用户只授予本 Bucket 的必要 STS/COS 权限，不使用腾讯云主账号密钥。
- 临时凭证过期后，前端重新创建或刷新上传会话。
- `community/create` 只接受当前用户草稿 `uploadItems` 中由云函数生成的 Key，
  拒绝重复 Key，也不接受客户端提交的任意 URL。
- 相同 Key 禁止覆盖；对象名始终使用随机 UUID。
- Bucket 保持“公有读、私有写”，浏览时使用固定 HTTPS URL，写入必须持有有效临时凭证。

### 5.4 上传并发

- 前端最大并发数固定为 3。
- 最多上传 9 张。
- 不使用 9 张全并发。
- 支持单张重试。
- 页面离开时不自动创建社区动态。

## 6. 云函数接口

在现有统一云函数 `api` 中新增：

| Action | 作用 |
|---|---|
| `community/list` | 获取公开社区动态 |
| `community/my` | 获取本人所有未删除作品，并触发超时审核补偿 |
| `community/createUploadSession` | 创建草稿并签发最小权限 STS 临时凭证 |
| `community/create` | 验证上传结果并创建动态 |
| `community/toggleLike` | 点赞或取消点赞，返回最终点赞状态和数量 |
| `community/interactions` | 分页获取本人赞过、评论或回复过的公开动态 |
| `community/delete` | 作者删除自己的动态 |

### 6.1 `community/list`

请求：

```js
{
  cursor: 0,
  pageSize: 10,
  feedType: "all",       // all / following
  region: "朝阳区"       // 空字符串表示全北京，按作者资料地区筛选
}
```

响应：

```js
{
  success: true,
  posts: [],
  nextCursor: 1785100000000,
  hasMore: true
}
```

使用 `createdAt + _id` 作为稳定分页依据，避免新动态插入后造成重复或漏项。实现时以游标分页为准，不使用深度 `skip` 分页。
`following` 频道从 `user_follows` 获取当前用户关注的人；地区与关注频道可以同时生效，结果仍按发布时间倒序展示。

### 6.2 `community/toggleLike`

请求：

```js
{ postId: "post_xxx" }
```

响应：

```js
{ success: true, liked: true, likeCount: 12 }
```

客户端可以先做乐观更新，但必须以接口返回的 `liked` 和 `likeCount` 为准；请求
失败时回滚界面。

### 6.3 `community/create`

请求：

```js
{
  draftId: "post_draft_8f31",
  content: "周末去了京西古道，风比想象中温柔。",
  images: [],
  location: {
    name: "门头沟",
    address: "北京市门头沟区",
    latitude: 39.94,
    longitude: 116.10
  }
}
```

云函数必须校验：

- 当前用户已登录。
- `draftId` 属于当前用户。
- 正文不超过 300 字。
- 图片不超过 9 张。
- 图片 Key 必须以本次草稿目录开头。
- 图片 URL 必须属于指定 COS 域名。
- 每个对象必须能通过 COS `headObject` 验证存在、大小不超过 10 MB，且 Content-Type 在白名单内。
- 正文、图片和有效定位不能同时为空。
- 同一草稿只能成功发布一次。

### 6.3 `community/delete`

- 只能删除自己的动态。
- 数据库写入 `status: "deleted"`。
- 记录 `deletedAt`。
- 立即尝试删除 COS 图片；失败项写入 `community_cleanup_tasks`。

## 7. 数据库设计

### 7.1 `community_posts`

```js
{
  _id: "post_xxx",
  draftId: "post_draft_8f31",
  authorId: "openid_xxx",
  authorName: "小鹿在路上",
  authorAvatar: "https://...",
  content: "周末去了京西古道，风比想象中温柔。",
  images: [],
  imageCount: 3,
  location: {
    name: "门头沟",
    address: "北京市门头沟区",
    latitude: 39.94,
    longitude: 116.10
  },
  visibility: "public",
  likeCount: 12,
  reviewStatus: "approved",
  imageAuditStatus: "approved",
  imageAuditTraceIds: [],
  imageAuditRetryAt: 0,
  imageAuditRetryCount: 0,
  imageAuditLastError: "",
  status: "active",
  createdAt: 1785100000000,
  updatedAt: 1785100000000,
  deletedAt: 0
}
```

索引：

```text
status + reviewStatus + createdAt + _id
status + reviewStatus + authorId + createdAt + _id
authorId + status + createdAt + _id
draftId（唯一）
```

### 7.2 `community_likes`

```js
{
  _id: "服务端确定性哈希",
  postId: "post_xxx",
  postAuthorId: "openid_author",
  userId: "openid_liker",
  userName: "旅行者",
  userAvatar: "https://...",
  createdAt: 1785149400000,
  updatedAt: 1785149400000
}
```

索引：

```text
postId + createdAt + _id
userId + createdAt + _id
```

确定性 `_id` 由 `postId + openid` 在服务端计算，防止重复点赞；点赞列表直接
使用记录中的昵称与头像快照。

### 7.3 `community_upload_drafts`

```js
{
  _id: "post_draft_8f31",
  ownerId: "openid_xxx",
  status: "uploading",
  maxFiles: 9,
  uploadedKeys: [],
  allowedPrefix: "miniapp/community/2026/07/post_draft_8f31/",
  uploadItems: [{
    index: 0,
    cosKey: "miniapp/community/2026/07/post_draft_8f31/6c7d2f0e.jpg",
    maxSize: 10485760,
    allowedMime: "image/jpeg"
  }],
  expiresAt: 1785150000000,
  createdAt: 1785149400000,
  completedAt: 0
}
```

状态：

```text
uploading → completed
uploading → expired
```

草稿 24 小时后过期。当前代码尚无自动清理过期草稿和孤儿 COS 对象的执行器，
上线前需按上线清单决定由定时云函数处理，或先建立人工巡检。

## 8. 内容安全

社区属于用户生成内容，正式上线前必须具备：

- 正文安全检测。
- 图片安全检测。
- 作者删除。
- 用户举报入口。
- 后台查看和下架能力。

作品公开状态只由人工结论最终控制：

```text
approved
rejected
```

- 纯文字/定位执行 `msgSecCheck`，`pass/review/risky` 均直接发布；后两者进入人工复核。
- 图片通过微信 `mediaCheckAsync` 异步审核。
- 消息推送事件 `wxa_media_check` 由
  `community-media-check-result` 云函数接收。
- 多张图片的回调可能同时到达。回调函数先独立保存每张图片的审核结果，再用事务
  汇总作品状态；汇总冲突会自动重试最多 3 次，避免单张图片结果丢失。
- 创建成功时直接写入 `reviewStatus=approved` 并进入公共社区。
- 机器返回 `pass` 时不改变业务状态；`review/risky` 只写入
  `adminReviewStatus=pending`，作品继续公开。
- 后台人工拒绝才写入 `reviewStatus=rejected` 并下架；人工通过保持 `approved`。
- 我的作品页可展示“已发布 · 待复核”。回调丢失时，图片审核超过 10 分钟会在
  作者打开我的作品时补提审核，最多 3 次。

开发环境验证记录（2026-07-28）：多图真实发布后的审核能够正常结束；并发自动化
测试覆盖两个图片回调同时到达及事务冲突重试。正式环境仍需独立部署和复验。

同级后台项目 `travel-be-gs` 已加入“社区内容审核”：支持按处理状态及
`review/risky` 筛选、查看正文和图片、填写备注并通过或拒绝。人工结果会同步修改
作品公开状态并向作者写入人工审核结果通知；机器审核不发送通知。

## 9. 环境变量

### 9.1 微信云函数 `api`

```text
COS_SECRET_ID
COS_SECRET_KEY
COMMUNITY_COS_BUCKET=imagica-images-1436573577
COMMUNITY_COS_REGION=ap-beijing
COMMUNITY_COS_BASE_URL=https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com
COMMUNITY_COS_PREFIX=miniapp/community/
```

`COS_SECRET_ID` 和 `COS_SECRET_KEY` 使用专用 CAM 子用户凭证。所有密钥只能配置在云函数运行环境，不能写入代码、配置样例值、Git 历史或小程序包，也不需要提供给开发人员。

## 10. 微信公众平台配置

正式版需要配置：

- COS 访问域名：按照 `cos-wx-sdk-v5` 的要求加入微信公众平台 `request`、`uploadFile` 和 `downloadFile` 合法域名。
- 定位接口：继续使用项目现有 `chooseLocation` 权限。
- 用户隐私保护指引：增加社区图片和主动选择位置信息的用途。

## 11. 兼容和非目标

### 11.1 保持不变

- 现有旅行日志仍使用微信云存储。
- 现有行程封面、头像和景点图片不迁移。
- 不迁移任何历史图片。
- 不修改现有云开发环境 ID。

### 11.2 当前不做

- 评论点赞和评论图片。
- 关注。
- 分享和转发。
- 话题。
- 推荐算法。
- 视频。
- 草稿箱。
- 图片编辑器。
- 历史 CloudBase 图片迁移。

## 12. 开发顺序

1. 增加社区 Tab 图标、社区首页和发布页。
2. 使用模拟数据完成 UI 和交互验收。
3. 增加 `community_posts` 和 `community_upload_drafts`。
4. 在云函数中接入 `qcloud-cos-sts` 和社区接口。
5. 在小程序中接入 `cos-wx-sdk-v5`，完成 COS 直传。
6. 接入 COS 图片展示和对象校验。
7. 增加内容审核、删除和垃圾清理。
8. 真机测试弱网、9 图上传、定位、重复发布和异常恢复。

## 13. 验收标准

- 社区 Tab 可正常进入。
- 未登录用户可以浏览。
- 未登录用户点击发布会进入登录流程。
- 登录用户可以发布文字、图片和定位。
- 0～9 张图片的布局正确。
- 9 张图片上传时页面不卡死。
- 上传失败可以重试。
- 发布过程中不能重复提交。
- 纯文字/定位动态发布后出现在列表顶部；图片动态审核通过后才出现在列表。
- COS URL 可以在真机正常显示和预览。
- 其他用户不能删除非本人动态。
- 不合规内容不进入公共信息流。
- 现有行程和我的页面不受影响。

## 14. 上线前配置

完整、可勾选的上线步骤见 `docs/community-v1-release-checklist.md`。其中当前代码
审计已确认的 P0 项包括：

1. 开发版、体验版和正式版统一连接 `cloud1-d2gel5jl093988c07`，行程和社区首页
   通过 `dataEnv` 进行业务数据隔离。
2. `package.json` 的 `deploy:prod` 已指向上述共享云环境，执行前仍需核对目标。
3. 共享云环境必须确认 COS 密钥、社区集合、索引、云函数和
   `wxa_media_check` 消息推送配置完整。
4. CAM 权限需要包含 `DeleteObject`，因为删除作品会立即删除 COS 对象。
5. 微信合法域名、COS CORS、定位与图片隐私用途必须在正式版重新核验。
6. 举报入口和人工审核处置目前未形成闭环，正式开放社区前必须补齐或形成可执行
   的人工运营方案。
