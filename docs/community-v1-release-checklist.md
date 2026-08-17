# 社区 V1 上线检查清单

> 日期：2026-07-28
> 结论：开发环境的发布、COS 上传、自动图片审核、展示和删除链路已完成首轮联调；
> 以下 P0 项未全部确认前，不应直接提交正式版。

> 2026-07-28 验证记录：`community-media-check-result` 已部署到当前开发云环境；
> 多图作品已完成真实发布验证，审核状态能够正常结束。并发回调实现采用“单图结果
> 独立落库 + 作品状态事务汇总”，事务冲突最多自动重试 3 次。

## 1. P0：正式环境与部署

- [x] `miniprogram/utils/env.js` 已将开发版、体验版和正式版统一连接
  `cloud1-d2gel5jl093988c07`，业务数据使用 `dataEnv` 隔离。
- [x] `package.json` 的 `deploy:prod` 已同步指向共享云环境。
- [ ] 核对 `cloudbaserc.json` 的目标环境、云函数运行时和超时设置。不要在没有
  验证目标环境的情况下执行批量部署。
- [ ] 在目标环境部署 `api` 和 `community-media-check-result`，确认
  `cloudfunctions/api/config.json` 中的 `security.msgSecCheck` 与
  `security.mediaCheckAsync` 调用权限生效。
- [ ] 使用正式版/体验版分别验证 `wx.cloud.init` 均连接共享云环境，并验证首页
  只展示各自 `readEnvs` 允许的数据。

## 2. P0：云函数环境变量与密钥

在目标环境的 `api` 云函数配置并重新部署：

```text
COS_SECRET_ID=<控制台填写>
COS_SECRET_KEY=<控制台填写>
COMMUNITY_COS_BUCKET=imagica-images-1436573577
COMMUNITY_COS_REGION=ap-beijing
COMMUNITY_COS_BASE_URL=https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com
COMMUNITY_COS_PREFIX=miniapp/community/
```

- [ ] 使用专用 CAM 子用户，不使用主账号密钥。
- [ ] CAM 最小权限覆盖 STS `GetFederationToken`，以及
  `miniapp/community/*` 下的 `PutObject`、`HeadObject`、`DeleteObject`。
- [ ] 永久密钥只存在云函数环境变量，不出现在代码、Git、数据库、前端包和日志。
- [ ] 如果密钥曾在聊天、截图或仓库中暴露，上线前轮换。

说明：前端获得的 STS 临时凭证仍只允许写入本次会话的精确 Key，不具备删除
权限。`DeleteObject` 只授予服务端 CAM 身份。

## 3. P0：数据库

在目标云环境创建并核对以下集合：

```text
community_posts
community_likes
community_comments
community_comment_replies
community_image_audits
community_upload_drafts
community_cleanup_tasks
user_follows
official_upload_sessions
```

建议索引：

```text
community_posts:
  status + reviewStatus + createdAt(desc) + _id(desc)
  authorId + status + createdAt(desc) + _id(desc)
  status + adminReviewStatus + machineSuggest + createdAt(desc)
  draftId（唯一）
  authorType + createdAt(desc)

users:
  accountType + createdAt(desc)

community_likes:
  postId + createdAt(desc) + _id(desc)
  userId + createdAt(desc) + _id(desc)

community_comments:
  postId + status + createdAt(desc) + _id(desc)
  authorId + status + createdAt(desc) + _id(desc)

community_comment_replies:
  postId + rootCommentId + status + createdAt(asc) + _id(asc)
  authorId + status + createdAt(desc) + _id(desc)

community_image_audits:
  postId
  expiresAt

community_upload_drafts:
  ownerId + status + createdAt
  expiresAt

community_cleanup_tasks:
  status + createdAt

user_follows:
  followerId + createdAt(desc) + _id(desc)
  followingId + createdAt(desc) + _id(desc)

official_upload_sessions:
  ownerId + status + createdAt(desc)
  expiresAt
```

后台“社区运营”说明：官方账号存放在 `users`，使用 `accountType=official` 和
`isOfficial=true` 标识，不绑定真实微信账号；官方动态仍写入 `community_posts`，
默认由管理员审核通过。后台每次发布都必须手动选择 `prod` 或 `dev`，不设置默认值；
云函数会拒绝未选择环境的请求，线上内容应选择 `prod`。

- [ ] 数据库权限设为客户端不可直接读写；社区数据统一经云函数访问。
- [ ] 用真实分页数据验证复合索引字段顺序与排序方向，不能只验证空集合。
- [ ] 确认唯一索引不会被历史脏数据阻止创建。
- [ ] 验证同一用户连续点赞/取消点赞不会产生重复记录或负数计数。
- [ ] 验证评论通过 `msgSecCheck` 后写入，违规评论被阻止，评论数与列表一致。
- [ ] 验证评论者和作品作者可删除评论，其他用户无法越权删除，删除后评论数不为负。
- [ ] 验证 A 回复 B、C 回复 A 均平铺在同一主评论下；删除主评论后整条回复链隐藏。
- [ ] 验证关注、取消关注、相互关注状态与双方统计数字一致，且不能关注自己。

## 4. P0：图片审核消息推送

在与正式版相同的云环境中配置并启用：

```text
消息类型：event
事件类型：wxa_media_check
目标云函数：community-media-check-result
```

- [ ] 规则处于启用状态；控制台操作按钮显示“停用”表示当前已启用。
- [ ] 删除或清楚标注旧的错误/禁用规则，避免后续运维人员误启用。
- [ ] 发布一张正常图片，确认云函数日志依次出现：
  `[community/image-audit] submitted`、
  `[community/image-audit-callback] received`、
  `[community/image-audit-callback] completed`。
- [ ] 小程序关闭后仍能收到回调并自动把作品改为 `approved`。
- [ ] 图片作品发布后立即进入公共社区；`review/risky` 只写入
  `adminReviewStatus=pending`，人工拒绝后才隐藏。
- [x] 在当前开发环境发布多张图片并验证并发回调：每张图片均有完成记录，作品状态正确
  汇总，不依赖 10 分钟补偿才能完成。

当前补偿机制是：作者打开“我的作品”时，超过 10 分钟图片审核仍为 `pending` 的作品
会补提审核，最多 3 次；页面可见时每 5 秒刷新状态。它不是全局定时任务，作者
长期不打开页面时不会主动补偿。

## 5. P0：微信合法域名、COS 与隐私

将以下 HTTPS 域名加入正式小程序的 `request`、`uploadFile` 和
`downloadFile` 合法域名，并用当前微信后台规则复核：

```text
https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com
```

- [ ] COS CORS 允许实际链路需要的 `PUT`、`HEAD`、`GET` 及临时凭证相关请求头。
- [ ] Bucket 保持“公有读、私有写”；确认团队接受“知道 URL 即可读取图片”的
  风险。若不能接受，应改为私有读和签名 URL，不应只改 ACL。
- [ ] `project.config.json` 当前 `urlCheck=false` 仅适合本地联调；提审前改为
  `true` 并重新做一次完整真机测试，提前暴露域名遗漏。
- [ ] 在小程序用户隐私保护指引中声明相册/相机图片、用户主动选择的位置及社区
  内容的用途，并核对 `chooseMedia`、`chooseLocation` 等隐私接口配置。
- [ ] 核对服务类目、社区/用户生成内容能力及当期微信审核要求。

## 6. P0：UGC 运营闭环

代码审计发现以下功能仍未闭环：

- 其他用户点击“举报”只提示“举报功能建设中”，并未提交记录。
- 社区审核管理页已实现，但正式上线前仍需验证管理员权限、操作通知和审核响应时间。
- 没有运营端的查看、下架和封禁流程。

正式开放社区前至少需要：

- [ ] 可用的内容举报入口，记录举报人、作品、原因、时间与处理状态。
- [x] 管理员可查看 `review/risky` 作品并执行通过或拒绝。
- [ ] 明确 `adminReviewStatus=pending` 的处理人和响应时间。
- [ ] 隐私政策中承诺的举报方式与产品真实能力一致。

如果本次提审前不开发后台，应至少建立真实可执行的人工流程和数据处理入口；
仅显示“建设中”不算闭环。

## 7. P1：存储清理与运营监控

- [ ] 删除作品会先软删除数据库，再立即删除 COS。查看
  `community_cleanup_tasks`，对失败对象重试；当前代码没有队列执行器。
- [ ] 24 小时过期的上传草稿及用户放弃发布留下的 COS 对象，目前没有自动清理
  执行器。上线前建立定时清理云函数，或至少建立每日人工巡检。
- [ ] 为图片审核 `pending` 超时、回调失败、清理任务积压和云函数错误设置告警。
- [ ] 核对 COS 流量、存储、请求量和云开发调用量的预算与告警阈值。
- [ ] 定期备份社区数据，并明确软删除数据的保留周期。

## 8. 提审前验收

- [ ] 运行 `npm test`、`npm run test:community`、`npm run test:trip-log`、
  `npm run test:metrics`。
- [ ] 微信开发者工具不使用灰度基础库；固定一个稳定基础库并在真机验证。
- [ ] iOS、Android 至少各测一次：登录、纯文字、定位、1 图、9 图、弱网重试、
  图片预览、删除、关闭小程序后审核回调。
- [ ] 验证三种本人可见状态：已发布、已发布待复核、审核未通过。
- [ ] 验证公共社区只展示 `approved + active`。
- [ ] 验证头像、昵称、定位、分页和删除后的列表状态。
- [ ] 验证未登录点击点赞进入登录；登录后点赞状态和数量刷新后保持一致。
- [ ] 清理测试动态、测试 COS 对象和无用消息推送规则。
- [ ] 检查上传包中没有 SecretId、SecretKey、测试账号或调试日志中的敏感信息。
- [ ] 根据是否需要排障决定是否保留 source map；`project.config.json` 当前为
  `uploadWithSourceMap=true`。

全部 P0 完成并留存一条真实图片审核回调的日志证据后，再上传体验版做最终回归，
最后提交微信审核。
