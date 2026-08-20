# 数据库集合与索引

> 基线日期：2026-08-19。集合不会由代码自动创建；首次部署到新云环境时需要在云开发
> 控制台手动创建。所有业务集合均建议设置为“所有用户不可读写”，云函数和云控制台
> 仍可读写。

## 1. 权限原则

- 小程序不直接调用 `wx.cloud.database()` 读写业务数据。
- 小程序和后台管理统一调用 `api` 云函数，由云函数校验用户或管理员身份。
- 不要给 `trips`、`community_posts`、`users` 等集合开放“所有用户可写”，否则客户端
  可以绕过审核、伪造作者、数量和状态。
- `admin_users`、审核、通知、上传会话、清理任务必须仅由云函数访问。

## 2. 当前集合

### 用户与运营

| 集合 | 用途 |
| --- | --- |
| `users` | 普通用户和官方账号资料、统计字段 |
| `user_follows` | 关注关系 |
| `user_stats` | 行为统计 |
| `admin_users` | 后台管理员身份与权限 |
| `notifications` | 统一站内通知 |
| `feedbacks` | 用户反馈 |
| `reports` | 内容举报及处理状态 |

### 社区

| 集合 | 用途 |
| --- | --- |
| `community_posts` | 普通和官方社区动态 |
| `community_likes` | 点赞记录 |
| `community_comments` | 主评论 |
| `community_comment_replies` | 评论回复 |
| `community_image_audits` | 作品和评论图片审核跟踪 |
| `community_upload_drafts` | COS 上传草稿/会话 |
| `community_cleanup_tasks` | COS 删除失败补偿任务 |
| `official_upload_sessions` | 后台官方动态 COS 上传会话 |

### 行程

| 集合 | 用途 |
| --- | --- |
| `trips` | 行程主体、成员、状态和审核状态 |
| `applies` | 行程申请、接收副本、留言和处理状态 |
| `trip_logs` | 旅行记录 |
| `trip_log_image_audits` | 旅行记录图片审核跟踪 |
| `trip_comments` | 行程主评论 |
| `trip_comment_replies` | 行程评论回复 |
| `trip_comment_image_audits` | 行程评论图片审核跟踪 |
| `trip_media_upload_sessions` | 头像、封面、日志等 COS 上传会话 |
| `trip_media_cleanup_tasks` | 行程媒体删除失败补偿任务 |

### 景点和其他早期能力

| 集合 | 用途 |
| --- | --- |
| `quick_attractions` | 当前快速景点列表和行程关联景点 |
| `places` | 早期完整景点数据 |
| `place_view_stats` | 景点浏览统计 |
| `wants` | 想去/收藏关系 |
| `comments` | 早期景点评论 |
| `banners` | Banner 配置 |
| `user_spots` | 用户上传景点 |
| `messages` | 早期消息能力；当前站内通知以 `notifications` 为主 |
| `system_config` | 行程日志、公共行程往期展示等服务端配置 |
| `beImages` | 后台图片资源 |
| `beImage_folder` | 后台图片文件夹 |

## 3. 关键字段约定

### 环境字段

- `dataEnv`: `dev` / `test` / `prod`。
- 缺少 `dataEnv` 的旧数据只在读取 `dev` 时纳入。

### 公共内容状态

- `status`: `active` 为有效，`deleted` 为软删除。
- `reviewStatus`: `approved` 为公开，`rejected` 为人工拒绝后隐藏。
- `machineSuggest`: `pending` / `pass` / `review` / `risky`。
- `adminReviewStatus`: `not_required` / `pending` / `approved` / `rejected`。

机器建议不会直接隐藏已经发布的内容；只有管理员拒绝才把 `reviewStatus` 改为
`rejected`。

## 4. 索引命名与规则

- 下列索引除明确标注外均为**普通、非唯一索引**。
- 索引名称只用于识别，可以按下列名称创建；真正影响查询的是字段、顺序和方向。
- 云数据库对 OR 查询可能提示额外索引，应以真实数据查询时控制台返回的字段顺序为准。
- 创建索引后不需要重新部署云函数，但必须重新请求验证。

## 5. 上线必需/高频索引

### `community_posts`

| 名称 | 字段 |
| --- | --- |
| `idx_posts_env_status_review_time` | `dataEnv` 升序、`status` 升序、`reviewStatus` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_posts_env_status_review_author_time` | `dataEnv` 升序、`status` 升序、`reviewStatus` 升序、`authorId` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_posts_status_admin_machine_time` | `status` 升序、`adminReviewStatus` 升序、`machineSuggest` 升序、`createdAt` 降序 |
| `idx_posts_author_type_time` | `authorType` 升序、`createdAt` 降序 |
| `uidx_posts_draft_id` | `draftId` 升序，**唯一** |

关注和地区组合查询若控制台报缺少索引，再按照报错为 `authorId/authorRegion` 等筛选字段
建立对应索引，不要猜测方向。

### `community_likes`

| 名称 | 字段 |
| --- | --- |
| `idx_likes_post_time` | `postId` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_likes_user_time` | `userId` 升序、`createdAt` 降序、`_id` 降序 |

### `community_comments`

| 名称 | 字段 |
| --- | --- |
| `idx_comments_post_status_time` | `postId` 升序、`status` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_comments_author_status_time` | `authorId` 升序、`status` 升序、`createdAt` 降序、`_id` 降序 |

### `community_comment_replies`

| 名称 | 字段 |
| --- | --- |
| `idx_replies_post_root_status_time` | `postId` 升序、`rootCommentId` 升序、`status` 升序、`createdAt` 升序、`_id` 升序 |
| `idx_replies_author_status_time` | `authorId` 升序、`status` 升序、`createdAt` 降序、`_id` 降序 |

### `trips`

| 名称 | 字段 |
| --- | --- |
| `idx_trips_env_review_time` | `dataEnv` 升序、`reviewStatus` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_trips_env_review_status_time` | `dataEnv` 升序、`reviewStatus` 升序、`status` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_trips_env_review_place_time` | `dataEnv` 升序、`reviewStatus` 升序、`placeId` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_trips_env_review_date_time` | `dataEnv` 升序、`reviewStatus` 升序、`date` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_trips_env_review_stage_date_time` | `dataEnv` 升序、`reviewStatus` 升序、`tripStage` 升序、`date` 升序、`createdAt` 降序、`_id` 降序 |

公共行程列表现在按 `date` 分为“今天及以后”和“往期”两个游标阶段，每个阶段内部按
`createdAt + _id` 倒序。若云控制台提示缺少索引，优先创建
`idx_trips_env_review_stage_date_time`；历史数据缺少 `reviewStatus` 或 `dataEnv` 时仍按代码
中的兼容分支读取。`system_config/trip_list_visibility` 不需要复合索引，文档结构如下：

```json
{
  "_id": "trip_list_visibility",
  "showPastTripsByEnv": {
    "dev": false,
    "test": false,
    "prod": false
  }
}
```

无需手工创建该文档；后台系统设置第一次保存时会自动创建。未创建或读取失败时三个环境
都按关闭处理。

注意：`system_config` 集合本身必须先在云开发控制台手工创建，权限设为“所有用户不可
读写”；这里只是无需手工创建集合中的 `trip_list_visibility` 文档。

### `trip_logs`

| 名称 | 字段 |
| --- | --- |
| `idx_trip_logs_trip_status_created` | `tripId` 升序、`status` 升序、`createdAt` 升序 |
| `idx_trip_logs_admin_review_created` | `status` 升序、`adminReviewStatus` 升序、`machineSuggest` 升序、`createdAt` 降序 |
| `idx_trip_logs_review_status_created` | `status` 升序、`reviewStatus` 升序、`machineSuggest` 升序、`createdAt` 降序 |

### `trip_comments` 与 `trip_comment_replies`

| 名称 | 字段 |
| --- | --- |
| `idx_trip_comments_trip_status_time` | `tripId` 升序、`status` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_trip_replies_trip_root_status_time` | `tripId` 升序、`rootCommentId` 升序、`status` 升序、`createdAt` 升序、`_id` 升序 |

### `notifications`

| 名称 | 字段 |
| --- | --- |
| `idx_notifications_receiver_time` | `receiverId` 升序、`status` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_notifications_receiver_category_time` | `receiverId` 升序、`status` 升序、`category` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_notifications_receiver_unread` | `receiverId` 升序、`status` 升序、`isRead` 升序 |

### `user_follows`

| 名称 | 字段 |
| --- | --- |
| `idx_follows_follower_time` | `followerId` 升序、`createdAt` 降序、`_id` 降序 |
| `idx_follows_following_time` | `followingId` 升序、`createdAt` 降序、`_id` 降序 |

## 6. 上传、审核和清理索引

| 集合 | 建议索引 |
| --- | --- |
| `community_image_audits` | `postId`；`expiresAt` |
| `community_upload_drafts` | `ownerId + status + createdAt`；`expiresAt` |
| `community_cleanup_tasks` | `status + createdAt` |
| `official_upload_sessions` | `ownerId + status + createdAt`；`expiresAt` |
| `trip_media_upload_sessions` | `ownerId + tripId + status`；`expiresAt` |
| `trip_media_cleanup_tasks` | `status + createdAt` |

## 7. 新环境创建顺序

1. 按第 2 节创建需要的集合。
2. 将所有集合的小程序端权限设为“所有用户不可读写”。
3. 先创建高频列表索引，再部署云函数。
4. 使用非空的真实或测试数据逐个验证社区、行程、评论、关注、通知和后台分页。
5. 如果出现缺少复合索引，根据控制台链接创建后重新请求；不要仅凭空集合判断成功。
