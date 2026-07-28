# 社区 V1 上线检查清单

> 日期：2026-07-28
> 结论：开发环境的发布、COS 上传、自动图片审核、展示和删除链路已完成首轮联调；
> 以下 P0 项未全部确认前，不应直接提交正式版。

> 2026-07-28 验证记录：`community-media-check-result` 已部署到当前开发云环境；
> 多图作品已完成真实发布验证，审核状态能够正常结束。并发回调实现采用“单图结果
> 独立落库 + 作品状态事务汇总”，事务冲突最多自动重试 3 次。

## 1. P0：正式环境与部署

- [ ] 修改 `miniprogram/utils/env.js`：`prod.cloudEnv` 目前仍是 `prod-demo`。
  若本次不拆分生产环境，应明确改为当前实际环境
  `cloud1-d2gel5jl093988c07`；若拆分环境，则填写真实生产环境 ID。
- [ ] 同步修改 `package.json` 的 `deploy:prod`，它目前仍执行
  `cloudbase deploy --env prod-demo`。
- [ ] 核对 `cloudbaserc.json` 的目标环境、云函数运行时和超时设置。不要在没有
  验证目标环境的情况下执行批量部署。
- [ ] 在目标环境部署 `api` 和 `community-media-check-result`，确认
  `cloudfunctions/api/config.json` 中的 `security.msgSecCheck` 与
  `security.mediaCheckAsync` 调用权限生效。
- [ ] 使用正式版/体验版分别验证 `wx.cloud.init` 实际连接的环境，避免开发工具
  正常而 release 包连接错误环境。

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
community_image_audits
community_upload_drafts
community_cleanup_tasks
```

建议索引：

```text
community_posts:
  status + reviewStatus + createdAt(desc) + _id(desc)
  authorId + status + createdAt(desc) + _id(desc)
  draftId（唯一）

community_likes:
  postId + createdAt(desc) + _id(desc)
  userId + createdAt(desc)

community_comments:
  postId + status + createdAt(desc) + _id(desc)
  authorId + status + createdAt(desc)

community_image_audits:
  postId
  expiresAt

community_upload_drafts:
  ownerId + status + createdAt
  expiresAt

community_cleanup_tasks:
  status + createdAt
```

- [ ] 数据库权限设为客户端不可直接读写；社区数据统一经云函数访问。
- [ ] 用真实分页数据验证复合索引字段顺序与排序方向，不能只验证空集合。
- [ ] 确认唯一索引不会被历史脏数据阻止创建。
- [ ] 验证同一用户连续点赞/取消点赞不会产生重复记录或负数计数。
- [ ] 验证评论通过 `msgSecCheck` 后写入，违规评论被阻止，评论数与列表一致。

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
- [ ] 多图必须全部 `pass` 才进入公共社区；任一 `review`/`risky` 都进入
  `manual_review`。
- [x] 在当前开发环境发布多张图片并验证并发回调：每张图片均有完成记录，作品状态正确
  汇总，不依赖 10 分钟补偿才能完成。

当前补偿机制是：作者打开“我的作品”时，超过 10 分钟仍为 `reviewing` 的作品
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
- `manual_review` 没有管理页或通过/拒绝接口，会长期停留在人工审核。
- 没有运营端的查看、下架和封禁流程。

正式开放社区前至少需要：

- [ ] 可用的内容举报入口，记录举报人、作品、原因、时间与处理状态。
- [ ] 管理员可查看作品并执行通过、拒绝/下架。
- [ ] 明确 `manual_review` 的处理人和响应时间。
- [ ] 隐私政策中承诺的举报方式与产品真实能力一致。

如果本次提审前不开发后台，应至少建立真实可执行的人工流程和数据处理入口；
仅显示“建设中”不算闭环。

## 7. P1：存储清理与运营监控

- [ ] 删除作品会先软删除数据库，再立即删除 COS。查看
  `community_cleanup_tasks`，对失败对象重试；当前代码没有队列执行器。
- [ ] 24 小时过期的上传草稿及用户放弃发布留下的 COS 对象，目前没有自动清理
  执行器。上线前建立定时清理云函数，或至少建立每日人工巡检。
- [ ] 为 `reviewing` 超时、回调失败、清理任务积压和云函数错误设置告警。
- [ ] 核对 COS 流量、存储、请求量和云开发调用量的预算与告警阈值。
- [ ] 定期备份社区数据，并明确软删除数据的保留周期。

## 8. 提审前验收

- [ ] 运行 `npm test`、`npm run test:community`、`npm run test:trip-log`、
  `npm run test:metrics`。
- [ ] 微信开发者工具不使用灰度基础库；固定一个稳定基础库并在真机验证。
- [ ] iOS、Android 至少各测一次：登录、纯文字、定位、1 图、9 图、弱网重试、
  图片预览、删除、关闭小程序后审核回调。
- [ ] 验证四种本人可见状态：已发布、审核中、人工审核、审核未通过。
- [ ] 验证公共社区只展示 `approved + active`。
- [ ] 验证头像、昵称、定位、分页和删除后的列表状态。
- [ ] 验证未登录点击点赞进入登录；登录后点赞状态和数量刷新后保持一致。
- [ ] 清理测试动态、测试 COS 对象和无用消息推送规则。
- [ ] 检查上传包中没有 SecretId、SecretKey、测试账号或调试日志中的敏感信息。
- [ ] 根据是否需要排障决定是否保留 source map；`project.config.json` 当前为
  `uploadWithSourceMap=true`。

全部 P0 完成并留存一条真实图片审核回调的日志证据后，再上传体验版做最终回归，
最后提交微信审核。
