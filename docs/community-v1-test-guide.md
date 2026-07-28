# 社区 V1 联调与测试清单

本文用于项目所有者在补齐腾讯云密钥后完成部署、联调和验收。不要把
`SecretId`、`SecretKey` 写进代码、配置文件、聊天记录或 Git。

## 1. 当前可测试范围

不配置 COS 密钥时：

- 社区 Tab、列表空态、未登录拦截可测试。
- 纯文字、定位发布的前端和自动化逻辑可测试。
- 图片选择、压缩、删除、重试 UI 可测试。
- 图片真实上传不可测试，页面会明确提示 COS 尚未配置。

配置完成后：

- 1～9 张图片直传 COS。
- 上传会话过期与单张失败重试。
- 云函数通过 `headObject` 校验对象后创建动态。
- 公共社区只展示已通过审核的动态。
- “我的作品”展示本人所有未删除作品，包括审核中、人工审核、已发布和审核未通过。

## 2. 云函数环境变量

在微信云开发控制台给 `api` 云函数配置：

```text
COMMUNITY_COS_BUCKET=imagica-images-1436573577
COMMUNITY_COS_REGION=ap-beijing
COMMUNITY_COS_BASE_URL=https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com
COMMUNITY_COS_PREFIX=miniapp/community/
COS_SECRET_ID=<在控制台填写>
COS_SECRET_KEY=<在控制台填写>
```

前四项代码中已有同值默认配置，但生产环境建议显式填写。最后两项只能存在
于云函数环境变量。

更新环境变量后，重新上传并部署 `cloudfunctions/api`，选择“云端安装依赖”或
确保云端安装了该目录 `package.json` 中的依赖。

## 3. 腾讯云 CAM 最小权限

使用本小程序专用 CAM 子用户，不使用主账号密钥。该身份至少需要：

- 调用 STS `GetFederationToken`。
- 对
  `imagica-images-1436573577/miniapp/community/*` 执行 `PutObject`。
- 对同一范围执行 `HeadObject`，供云函数在发布前校验对象。
- 对同一范围执行 `DeleteObject`，供作者删除作品时立即清理图片。

小程序拿到的临时凭证权限更小：只允许写本次会话中由云函数生成的精确对象
Key，有效期 15 分钟，不允许读取、列目录或删除。

## 4. 微信小程序域名与 COS

在微信公众平台把以下域名加入与网络请求、上传和图片下载相关的合法域名：

```text
https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com
```

如果 COS 控制台启用了跨域规则，至少允许小程序实际使用的 `PUT`、`HEAD`、
`GET`，并放行 `Content-Type`、临时凭证相关请求头。正式规则应限制到本小程序
需要的来源和方法，不要为了联调长期保留无限制写权限。

## 5. 数据库集合与索引

在当前云开发环境创建：

```text
community_posts
community_likes
community_comments
community_image_audits
community_upload_drafts
community_cleanup_tasks
```

建议创建：

```text
community_posts:
  status + reviewStatus + createdAt + _id
  authorId + status + createdAt + _id
  draftId（唯一）

community_likes:
  postId + createdAt
  userId + createdAt

community_comments:
  postId + status + createdAt + _id
  authorId + status + createdAt

community_image_audits:
  postId
  expiresAt

community_upload_drafts:
  ownerId + status + createdAt
  expiresAt

community_cleanup_tasks:
  status + createdAt
```

若列表接口提示“缺少索引”，以云开发控制台错误中给出的字段顺序为准创建索引，
然后重新测试翻页。

### 点赞验证

1. 未登录浏览社区时能够看到点赞数，点击点赞进入登录流程。
2. 登录后点赞，按钮立即变为已点赞，刷新页面后状态和数量保持一致。
3. 再次点击取消点赞，数量不会小于 0。
4. 同一用户快速重复点击不会产生多条点赞记录。
5. `community_likes` 保存 `userId`、`userName`、`userAvatar` 和 `createdAt`，可供
   后续点赞列表使用。
6. 审核中、人工审核、审核不通过或已删除的作品不能点赞。

### 评论验证

1. 点击动态正文、图片或评论图标进入详情页。
2. 无评论时展示“来聊聊这个话题吧～”。
3. 输入纯文本并使用键盘发送，评论立即出现在列表顶部，输入框清空。
4. 社区列表和详情页评论数同步增加，重新进入后数量保持一致。
5. `community_comments` 保存评论者 ID、昵称、头像、正文和创建时间。
6. 违规文本不写入数据库；审核中、人工审核、审核不通过或已删除作品不能评论。

## 6. 本地自动化

项目根目录执行：

```bash
npm test
npm run test:community
npm run test:trip-log
npm run test:metrics
```

微信开发者工具登录且“安全设置 → 服务端口”开启后，再执行：

```bash
npm run test:e2e
npm run test:core
```

## 7. 手工验收用例

### 社区列表

1. 未登录可进入社区 Tab。
2. 空列表显示空态与“发布动态”按钮。
3. 点击发布后进入登录；登录完成可回到发布页。
4. 下拉刷新、上拉翻页不重复、不漏数据。
5. 一图、二图、三至九图布局正常，图片可预览。
6. 定位可点击并打开地图。
7. 作者可以删除自己的动态；其他人不能删除。
8. 公共列表不展示 `reviewing`、`manual_review`、`rejected`。

### 我的作品

1. 展示本人所有 `status=active` 的作品，不按审核状态过滤。
2. 头像、昵称、图片和定位与社区卡片一致。
3. 四种状态分别显示：已发布、审核中、人工审核、审核未通过。
4. 审核中的作品在页面可见时每 5 秒刷新。
5. 右上角三个点可以删除，删除后列表立即移除。

### 发布页

1. 正文、图片、定位不能同时为空。
2. 正文最多 300 字。
3. 最多选择 9 张，仅允许 JPEG、PNG、WebP，单张不超过 10 MB。
4. 图片上传最多 3 并发；失败图片可重试且不会和其他图片串位。
5. 发布中连续点击不会重复创建动态。
6. 纯文字或定位动态发布成功后进入公共列表。
7. 缺少 COS 配置时，图片发布显示明确提示，纯文字发布不受影响。

### COS 与安全

1. COS 控制台确认对象都在 `miniapp/community/年/月/draftId/`。
2. 对象名为服务端生成的 UUID，不含 openid、手机号、昵称。
3. 修改客户端提交 Key 后，云函数拒绝发布。
4. 超过 10 MB、Content-Type 不一致、对象不存在时，云函数拒绝发布。
5. 永久密钥不出现在小程序包、日志、数据库和 Git diff 中。
6. 删除作品后 COS 对象消失；删除失败时
   `community_cleanup_tasks` 出现待处理任务。

## 8. 图片审核说明

当前安全策略是：

- 正文和定位文字调用微信 `msgSecCheck` V2，只有 `pass` 才允许创建；`review`、`risky` 和未知结果均阻止发布。
- 带图片的动态会把 COS 公网图片地址提交给微信 `mediaCheckAsync`，创建后保持 `reviewing`，审核完成前任何人都不可见。
- 所有图片均为 `pass` 后动态自动变成 `approved`；任一图片为 `risky` 或 `review` 则变成 `manual_review`，等待后续人工审核明确通过或拒绝。
- 公共列表只展示 `approved`。

部署后需要在同一云环境的消息推送设置中创建并启用：

```text
消息类型：event
事件类型：wxa_media_check
目标云函数：community-media-check-result
```

控制台按钮显示“停用”代表规则当前已启用。发布图片后在日志中确认
`submitted → callback received → callback completed`。作者打开“我的作品”时，
超过 10 分钟仍未完成的审核会补提，最多 3 次；这只是回调丢失补偿，不替代正确
配置消息推送。

多图场景需要单独验证：一次发布 2～9 张图片，确认每个 `traceId` 都写入完成状态，
最终作品只汇总一次正确结果。多条回调同时到达时会先分别落库，再以事务汇总作品
状态；事务冲突自动重试最多 3 次。

2026-07-28 已在当前开发环境完成多图真实发布验证，作品审核能够正常结束；自动化
测试同时覆盖了两个回调并发执行及一次事务冲突。正式环境部署后仍需按相同步骤
重新验收。

## 9. 上线前结论

开发环境的登录、COS 密钥、合法域名和图片审核消息推送已经完成过联调，但正式
包不能据此直接上线。必须逐项执行
`docs/community-v1-release-checklist.md`，尤其注意：

- release 环境目前仍指向占位值 `prod-demo`。
- 正式环境的云函数变量、集合、索引和消息推送需要单独核验。
- 举报与人工审核处置尚未闭环。
- COS 删除失败队列和废弃草稿暂时没有自动清理执行器。
