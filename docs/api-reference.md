# 云函数接口

> 基线日期：2026-08-19。所有接口统一调用 `cloudfunctions/api`，事件格式为
> `{ action, data, runtimeEnv, dataEnvironment }`。小程序封装位于
> `miniprogram/utils/api.js`。

## 调用约定

- `openid` 由云函数通过 `cloud.getWXContext()` 获取，客户端不应伪造。
- 普通用户接口在 handler 内校验登录用户、作者、行程发起人等权限。
- 后台接口要求 `adminId`，并校验 `admin_users` 中的角色。
- 成功返回 `{ success: true, ... }`，失败返回 `{ success: false, error }`。
- 列表通常返回 `items/list`、分页或游标与 `hasMore`；每个模块的字段以 handler 为准。

## 认证和用户

| Action | 用途 |
| --- | --- |
| `auth/publicKey` | 获取客户端敏感字段加密所需公钥 |
| `auth/trackEvent` | 记录转化事件 |
| `user/register` | 注册用户 |
| `user/login` | 微信身份登录 |
| `user/loginPassword` | 密码登录兼容接口 |
| `user/loginByPhone` | 手机号登录/绑定 |
| `user/update` | 更新当前用户资料 |
| `user/get` | 获取裁剪后的公开用户资料 |
| `user/followStatus` | 获取关注关系 |
| `user/followToggle` | 关注/取消关注 |
| `user/followList` | 关注或粉丝分页列表 |

## 社区

| Action | 用途 |
| --- | --- |
| `community/list` | 社区分页、关注和地区筛选，应用 `readEnvs` |
| `community/get` | 获取可见动态详情 |
| `community/my` | 当前用户全部未删除作品及审核状态 |
| `community/createUploadSession` | 为作品或评论图片签发限定 Key 的 COS STS |
| `community/create` | 创建动态并写入 `writeEnv` |
| `community/toggleLike` | 点赞/取消点赞 |
| `community/likeList` | 点赞用户列表 |
| `community/interactions` | 当前用户赞过/评论过的内容 |
| `community/notifications` | 早期社区通知兼容接口 |
| `community/notificationsMarkRead` | 早期社区通知已读兼容接口 |
| `community/commentList` | 主评论列表 |
| `community/replyList` | 某主评论下回复列表 |
| `community/commentCreate` | 创建主评论或回复，支持图片 |
| `community/commentDelete` | 按作者/作品作者权限删除评论 |
| `community/delete` | 删除作品及关联数据，尝试清理 COS |

## 行程、旅途记录和评论

| Action | 用途 |
| --- | --- |
| `trip/create` | 创建行程并写入 `writeEnv` |
| `trip/list` | 公共行程游标分页列表，应用 `readEnvs`；按运营配置先返回今天及以后，再返回往期行程 |
| `trip/get` | 行程详情 |
| `trip/view` | 记录浏览 |
| `trip/join` | 兼容的直接加入操作 |
| `trip/quit` | 成员退出 |
| `trip/removeMember` | 发起人移除成员 |
| `trip/updateStatus` | 更新行程状态 |
| `trip/delete` | 删除行程 |
| `trip/update` | 编辑行程 |
| `trip/my` | 当前用户的行程 |
| `trip/listByUser` | 个人主页行程，应用 `readEnvs` |
| `tripMedia/createUploadSession` | 行程封面、日志、头像等 COS 上传会话 |
| `tripLog/start` | 开始出发 |
| `tripLog/end` | 结束行程 |
| `tripLog/list` | 旅行记录列表 |
| `tripLog/create` | 发布旅行记录并提交审核 |
| `tripLog/delete` | 删除旅行记录和媒体 |
| `tripLog/authorize` | 授权成员发布日志 |
| `tripLog/unauthorize` | 取消成员日志权限 |
| `tripComment/list` | 行程主评论列表 |
| `tripComment/replyList` | 行程评论回复列表 |
| `tripComment/create` | 创建行程评论或回复，支持图片 |
| `tripComment/delete` | 删除行程评论或回复 |

## 加入申请和通知

| Action | 用途 |
| --- | --- |
| `apply/create` | 提交行程申请及可选留言 |
| `apply/list` | 申请记录 |
| `apply/handle` | 发起人同意或拒绝 |
| `apply/notifications` | 旧申请通知分页兼容接口 |
| `apply/delete` | 删除申请记录 |
| `apply/cancel` | 申请人取消申请 |
| `apply/unreadCount` | 旧申请未读数量 |
| `apply/markRead` | 旧申请消息已读 |
| `notification/list` | 统一站内通知分页 |
| `notification/unreadCount` | 全局未读数量 |
| `notification/markRead` | 单条已读 |
| `notification/markAllRead` | 全部已读 |

## 景点、反馈和举报

| Action | 用途 |
| --- | --- |
| `place/list` / `place/get` / `place/search` / `place/view` | 早期完整景点能力 |
| `attractions/list` / `attractions/get` | 当前快速景点列表和详情 |
| `want/toggle` / `want/list` | 想去/收藏 |
| `comment/create` / `comment/list` | 早期景点评论 |
| `banner/list` | Banner 列表 |
| `feedback/create` | 提交用户反馈 |
| `report/create` | 提交内容举报 |
| `userSpots/create` | 用户上传景点 |
| `message/send` / `message/list` / `message/read` | 早期消息兼容能力 |

## 后台管理

后台项目 `../travel-be-gs` 是前端，以下接口仍由本云函数提供：

| Action | 用途 |
| --- | --- |
| `admin/login` / `admin/register` | 管理员登录及首个管理员注册 |
| `admin/dataList` / `admin/dataGet` | 白名单资源读取 |
| `admin/dataCreate` / `admin/dataUpdate` / `admin/dataDelete` | 白名单资源增删改 |
| `admin/dataBatchCreate` | 批量创建白名单资源 |
| `admin/spotPublish` | 将用户上传景点发布到快速景点 |
| `admin/communityReviewList` / `admin/communityReviewUpdate` | 社区审核 |
| `admin/tripReviewList` / `admin/tripReviewUpdate` | 行程审核 |
| `admin/tripLogReviewList` / `admin/tripLogReviewUpdate` | 旅行记录审核 |
| `admin/reportList` / `admin/reportUpdate` | 举报列表和处理状态 |
| `admin/officialAccountList` / `admin/officialAccountSave` | 官方账号管理 |
| `admin/officialUploadSession` | 官方动态 COS 上传会话 |
| `admin/officialPostList` / `admin/officialPostCreate` | 官方动态列表和创建 |
| `admin/officialPostUpdate` | 编辑、上下架及从开发环境发布到生产 |
| `admin/tripListVisibilityGet` | 读取 `dev/test/prod` 三套公共行程往期展示开关 |
| `admin/tripListVisibilityUpdate` | 按业务数据环境更新往期行程展示开关（管理员/运营可写） |

`admin/data*` 只允许访问服务端 `RESOURCES` 白名单，目前包括景点、快速景点、反馈、
用户上传、Banner、用户、浏览统计、用户统计及后台图片资源，不能由客户端传任意集合名。

## 其他云函数

- `login`：返回当前微信上下文身份，供登录和统计等流程使用。
- `community-media-check-result`：接收 `wxa_media_check` 事件，识别作品/评论/行程评论/
  旅行记录的审核 trace，并以事务方式汇总多图结果。
- `init-data`：早期景点种子导入工具，不是每次部署都要执行。
