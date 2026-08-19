// 数据库集合初始化脚本
// 在微信开发者工具 - 云开发控制台 - 数据库中手动创建以下集合

/*
==========================================
数据库集合列表
==========================================

1. users - 用户表
2. places - 地点表
3. trips - 行程表
4. applies - 申请表
5. wants - 想去表
6. messages - 消息表
7. comments - 评论表
8. notifications - 通知表
9. community_posts - 社区动态表
10. community_likes - 社区点赞记录表
11. community_image_audits - 社区图片异步审核映射表
12. community_upload_drafts - 社区上传草稿表
13. community_cleanup_tasks - COS清理任务表
14. community_comments - 社区评论表
15. community_comment_replies - 社区评论回复表
16. user_follows - 用户关注关系表
17. trip_media_upload_sessions - 行程媒体COS上传会话表
18. trip_media_cleanup_tasks - 行程媒体COS清理任务表
19. trip_comments - 行程评论表
20. trip_comment_replies - 行程评论回复表
21. trip_comment_image_audits - 行程评论图片异步审核映射表
22. official_upload_sessions - 后台官方内容 COS 上传会话表
==========================================
集合结构说明
==========================================
*/

// 1. users - 用户表
const userSchema = {
  _id: "user_xxx",
  userId: "BJ143052A7F3",           // 用户唯一标识：前缀 + 时间戳后6位 + 4位随机数
  openid: "xxx",                    // 微信openid
  nickname: "旅行达人",              // 昵称
  avatar: "https://...",            // 头像展示URL（新上传使用COS）
  accountType: "user",              // user/official；官方运营账号复用用户主页和关注能力
  isOfficial: false,                 // 是否展示“官方”标识
  avatarObject: {                    // COS头像对象，用于替换时清理旧文件
    provider: "cos",
    key: "miniapp/user-avatars/2026/08/trip_media_xxx/img_xxx.jpg",
    url: "https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com/miniapp/user-avatars/...jpg"
  },
  gender: 1,                        // 性别 0未知 1男 2女
  bio: "热爱户外",                   // 简介
  phone: "138****8888",             // 手机号（脱敏）

  // 统计
  following: 128,                   // 关注数
  followers: 256,                   // 粉丝数
  trips: 15,                        // 参与行程数
  places: 42,                       // 去过的地方数
  
  // 标签
  tags: ["户外", "摄影", "自驾"],
  carOwner: true,                   // 是否有车
  
  // 时间
  createdAt: 1711123200000,
  lastActiveAt: 1711392000000
};

// 2. places - 地点表
const placeSchema = {
  _id: "place_xxx",
  name: "东灵山",
  category: "爬山",                  // 爬山/水上/古镇/露营
  tags: ["日出", "云海", "露营"],
  
  // 位置
  location: {
    lat: 40.0123,
    lng: 115.4567,
    address: "北京市门头沟区",
    distance: 120                    // 距离市中心km
  },
  
  // 描述
  description: "北京最高峰...",
  images: ["https://..."],
  
  // 统计
  wantCount: 256,                   // 想去人数
  visitCount: 128,                  // 去过人数
  tripCount: 32,                    // 行程数
  
  // 难度
  difficulty: "中等",               // 简单/中等/困难
  
  createdAt: 1711123200000
};

// 3. trips - 行程表
const tripSchema = {
  _id: "trip_xxx",
  dataEnv: "dev",                  // dev/test/prod；缺失时仅按dev数据处理
  placeId: "place_xxx",
  placeName: "东灵山",
  
  // 发起人
  creatorId: "user_xxx",
  creatorName: "旅行达人",
  creatorAvatar: "https://...",
  
  // 行程信息
  date: "2024-03-25",
  hasCar: true,
  currentCount: 2,                  // 已有人数
  needCount: 3,                     // 还需人数
  
  // 参与者
  participants: [
    {
      userId: "user_xxx",
      nickname: "旅行达人",
      avatar: "https://...",
      contactPhone: "13800138000"    // 申请加入时填写的本次行程联系方式
    }
  ],
  
  remark: "早上6点出发，AA制",
  status: "open",                   // open/full/cancelled
  reviewStatus: "approved",         // approved/rejected；发布默认通过，后台可停止展示
  adminReviewedAt: 0,
  adminReviewerName: "",
  adminReviewRemark: "",
  commentCount: 0,                  // 行程主评论与回复总数
  
  createdAt: 1711123200000
};

// 4. applies - 申请表
const applySchema = {
  _id: "apply_xxx",
  tripId: "trip_xxx",
  placeName: "东灵山",
  
  // 申请人
  userId: "user_xxx",
  userName: "小明",
  userAvatar: "https://...",
  
  // 行程发起人
  creatorId: "user_yyy",
  
  message: "我也想去，有户外经验",
  status: "pending",                // pending/accepted/rejected
  
  createdAt: 1711123200000
};

// 5. wants - 想去表
const wantSchema = {
  _id: "want_xxx",
  placeId: "place_xxx",
  placeName: "东灵山",
  userId: "user_xxx",
  
  createdAt: 1711123200000
};

// 6. messages - 消息表
const messageSchema = {
  _id: "msg_xxx",
  
  // 会话
  conversationId: "conv_xxx",       // 行程ID或用户对ID
  
  // 发送者
  fromUserId: "user_xxx",
  fromUserName: "小明",
  fromUserAvatar: "https://...",
  
  // 接收者（私聊时）
  toUserId: "user_yyy",
  
  // 消息内容
  content: "你好，还有位置吗？",
  type: "text",                     // text/image/location
  
  // 状态
  read: false,
  
  createdAt: 1711123200000
};

// 7. comments - 评论表
const commentSchema = {
  _id: "comment_xxx",
  placeId: "place_xxx",
  placeName: "东灵山",
  
  // 评论者（冗余字段便于显示）
  userId: "user_xxx",
  userName: "小明",
  userAvatar: "https://...",
  
  content: "风景很美，推荐！",
  rating: 5,                        // 1-5星
  images: ["https://..."],
  
  likes: 12,                        // 点赞数
  
  createdAt: 1711123200000
};

// 8. notifications - 通知表
const notificationSchema = {
  _id: "notify_xxx",
  receiverId: "openid_receiver",     // 接收者 openid
  category: "interaction",           // trip/interaction/system
  type: "community_comment",         // 具体通知类型

  actorId: "openid_actor",           // 触发者；系统通知为空
  actorName: "小明",                 // 触发时用户资料快照
  actorAvatar: "https://...",

  targetType: "community_post",      // community_post/user/trip/my_works
  targetId: "post_xxx",              // 点击目标ID
  sourceType: "comment",             // like/comment/reply/follow/apply/review
  sourceId: "comment_xxx",           // 幂等和来源追踪

  title: "评论通知",                 // 系统标题或无触发者时的兜底标题
  actionText: "评论了你",            // 与触发者昵称拼接展示
  content: "风景真不错",
  thumbnail: "https://...",

  isRead: false,
  readAt: 0,
  status: "active",                  // active/deleted
  createdAt: 1711123200000,
  updatedAt: 1711123200000
};

// 9. community_posts - 社区动态表
const communityPostSchema = {
  _id: "post_xxx",
  dataEnv: "dev",                 // dev/test/prod；缺失时仅按dev数据处理
  draftId: "post_draft_8f31",      // 关联上传草稿ID
  authorId: "openid_xxx",          // 作者openid
  authorName: "小鹿在路上",         // 作者昵称（服务端从users读取，不可信客户端）
  authorAvatar: "https://...",     // 作者头像（服务端从users读取）
  authorType: "user",              // user/official
  isOfficial: false,                // 官方动态为true
  content: "周末去了京西古道，风比想象中温柔。",
  images: [{
    provider: "cos",
    key: "miniapp/community/2026/07/post_draft_8f31/6c7d2f0e.jpg",
    url: "https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com/miniapp/community/2026/07/post_draft_8f31/6c7d2f0e.jpg",
    width: 1920,
    height: 1280,
    size: 856231,
    mimeType: "image/jpeg",
    sort: 0
  }],
  imageCount: 1,
  location: {
    name: "门头沟",
    address: "北京市门头沟区",
    latitude: 39.94,
    longitude: 116.10
  },
  visibility: "public",            // V1固定为public
  likeCount: 12,                   // 点赞数，和 community_likes 保持一致
  commentCount: 3,                 // 主评论+回复总数
  reviewStatus: "approved",        // approved/reviewing/manual_review/rejected
  machineSuggest: "pass",          // pending/pass/review/risky，微信审核聚合原始结论
  adminReviewStatus: "not_required", // not_required/pending/approved/rejected，人工复核状态
  imageAuditStatus: "approved",    // pending/reviewing/manual_review/approved/rejected
  imageAuditTraceIds: ["trace_xxx"], // 微信 mediaCheckAsync 任务ID
  imageAuditUpdatedAt: 1785100000000,
  imageAuditRetryAt: 0,            // 超时补提审核的最后占位时间
  imageAuditRetryCount: 0,         // 最多补提3次
  imageAuditLastError: "",
  status: "active",                // active/deleted
  createdAt: 1785100000000,
  updatedAt: 1785100000000,
  deletedAt: 0
};

// 10. community_likes - 社区点赞记录表
const communityLikeSchema = {
  _id: "sha256(postId + openid)",  // 服务端生成的确定性ID，防止重复点赞
  postId: "post_xxx",
  postAuthorId: "openid_author",
  userId: "openid_liker",
  userName: "旅行者",               // 点赞时的昵称快照，供点赞列表展示
  userAvatar: "https://...",       // 点赞时的头像快照
  createdAt: 1785149400000,
  updatedAt: 1785149400000
};

// 11. community_image_audits - 社区图片异步审核映射表
const communityImageAuditSchema = {
  _id: "trace_xxx",                // 微信 mediaCheckAsync traceId
  traceId: "trace_xxx",
  postId: "post_xxx",
  imageKey: "miniapp/community/2026/07/...",
  imageUrl: "https://...",
  status: "pending",               // pending/completed
  suggest: "pending",              // pending/pass/review/risky
  label: 0,
  detail: [],
  createdAt: 1711123200000,
  updatedAt: 1711123200000,
  completedAt: 0,
  expiresAt: 1711728000000
};

// 12. community_upload_drafts - 社区上传草稿表
const communityDraftSchema = {
  _id: "post_draft_8f31",
  ownerId: "openid_xxx",
  status: "uploading",             // uploading/completed/expired
  maxFiles: 9,
  uploadedKeys: [],
  allowedPrefix: "miniapp/community/2026/07/post_draft_8f31/",
  uploadItems: [{
    index: 0,
    cosKey: "miniapp/community/2026/07/post_draft_8f31/6c7d2f0e.jpg",
    maxSize: 10485760,
    allowedMime: "image/jpeg"
  }],
  expiresAt: 1785150000000,        // 24小时后过期
  createdAt: 1785149400000,
  completedAt: 0
};

// 21. official_upload_sessions - 后台官方内容 COS 上传会话表
const officialUploadSessionSchema = {
  _id: "official_upload_xxx",
  ownerId: "admin_xxx",
  purpose: "post",                 // avatar/post
  status: "uploading",             // uploading/completed
  maxFiles: 9,
  uploadItems: [{
    index: 0,
    cosKey: "miniapp/community/official/2026/08/official_upload_xxx/image.jpg",
    maxSize: 10485760,
    allowedMime: "image/jpeg"
  }],
  expiresAt: 1785150000000,
  createdAt: 1785149400000,
  updatedAt: 1785149400000,
  completedAt: 0,
  targetId: "post_xxx"
};

// 13. community_cleanup_tasks - COS清理任务表
const communityCleanupTaskSchema = {
  _id: "cleanup_xxx",
  postId: "post_xxx",
  provider: "cos",
  key: "miniapp/community/2026/07/post_draft_8f31/6c7d2f0e.jpg",
  status: "pending",               // pending/processing/completed/failed
  retryCount: 0,
  lastError: "",
  createdAt: 1711123200000,
  updatedAt: 1711123200000
};

// 17. trip_media_upload_sessions - 行程媒体及用户头像上传会话表
const tripMediaUploadSessionSchema = {
  _id: "trip_media_xxx",
  ownerId: "openid_xxx",
  tripId: "trip_xxx",
  purpose: "log",                // log/cover/avatar/comment/user_avatar
  status: "uploading",           // uploading/consumed/expired
  uploadItems: [{
    index: 0,
    cosKey: "miniapp/trip-logs/trip_xxx/2026/08/trip_media_xxx/img_xxx.jpg",
    maxSize: 10485760,
    allowedMime: "image/jpeg"
  }],
  expiresAt: 1786350000000,
  createdAt: 1786349400000,
  consumedAt: 0
};

// 18. trip_media_cleanup_tasks - 行程COS图片清理失败重试表
const tripMediaCleanupTaskSchema = {
  _id: "trip_cleanup_xxx",
  tripId: "trip_xxx",
  logId: "log_xxx",
  reason: "trip_log_deleted",
  provider: "cos",
  key: "miniapp/trip-logs/trip_xxx/2026/08/trip_media_xxx/img_xxx.jpg",
  status: "pending",
  retryCount: 0,
  lastError: "",
  createdAt: 1786349400000,
  updatedAt: 1786349400000
};

// 19. trip_comments - 行程评论表
const tripCommentSchema = {
  _id: "trip_comment_xxx",
  tripId: "trip_xxx",
  tripCreatorId: "openid_creator",
  authorId: "openid_commenter",
  authorName: "旅行者",
  authorAvatar: "https://...",
  content: "这次行程还有位置吗？",
  images: [{ provider: "cos", key: "miniapp/trip-comments/...jpg", url: "https://..." }],
  imageCount: 1,
  imageAuditTraceIds: ["trace_xxx"],
  imageAuditStatus: "pending",    // pending/approved/rejected/not_required
  likeCount: 0,
  replyCount: 1,
  isReply: false,
  status: "active",                // active/deleted
  createdAt: 1785149400000,
  updatedAt: 1785149400000,
  deletedAt: 0
};

// 20. trip_comment_replies - 行程评论回复表
const tripCommentReplySchema = {
  _id: "trip_reply_xxx",
  tripId: "trip_xxx",
  tripCreatorId: "openid_creator",
  rootCommentId: "trip_comment_xxx",
  parentReplyId: "",
  replyToId: "trip_comment_xxx",
  replyToType: "comment",          // comment/reply
  replyToUserId: "openid_a",
  replyToUserName: "A",
  authorId: "openid_b",
  authorName: "B",
  authorAvatar: "https://...",
  content: "还有一个位置。",
  likeCount: 0,
  isReply: true,
  status: "active",
  createdAt: 1785149400000,
  updatedAt: 1785149400000,
  deletedAt: 0
};

// 21. trip_comment_image_audits - 行程评论图片异步审核映射表
const tripCommentImageAuditSchema = {
  _id: "trace_xxx",
  traceId: "trace_xxx",
  commentId: "trip_comment_xxx",
  commentTargetType: "comment",   // comment/reply
  imageKey: "miniapp/trip-comments/...jpg",
  imageUrl: "https://...",
  status: "pending",              // pending/completed
  suggest: "pending",             // pending/pass/review/risky
  label: 0,
  createdAt: 1785149400000,
  updatedAt: 1785149400000,
  expiresAt: 1785754200000
};

// 14. community_comments - 社区评论表
const communityCommentSchema = {
  _id: "comment_xxx",
  postId: "post_xxx",
  postAuthorId: "openid_author",
  authorId: "openid_commenter",
  authorName: "旅行者",             // 评论时的昵称快照
  authorAvatar: "https://...",     // 评论时的头像快照
  content: "这个地方看起来很舒服。",
  likeCount: 0,                    // 预留评论点赞，第一版不开放
  replyCount: 2,                   // 当前有效回复数量
  isReply: false,
  status: "active",                // active/deleted
  createdAt: 1785149400000,
  updatedAt: 1785149400000,
  deletedAt: 0
};

// 15. community_comment_replies - 社区评论回复表
const communityCommentReplySchema = {
  _id: "reply_xxx",
  postId: "post_xxx",
  postAuthorId: "openid_author",
  rootCommentId: "comment_xxx",   // 所属主评论
  parentReplyId: "reply_parent",  // 回复主评论时为空，回复另一条回复时记录其ID
  replyToId: "reply_parent",
  replyToType: "reply",           // comment/reply
  replyToUserId: "openid_a",
  replyToUserName: "A",
  authorId: "openid_c",
  authorName: "C",
  authorAvatar: "https://...",
  content: "我也赞同。",
  likeCount: 0,
  isReply: true,
  status: "active",
  createdAt: 1785149400000,
  updatedAt: 1785149400000,
  deletedAt: 0
};

// 16. user_follows - 用户关注关系表
const userFollowSchema = {
  _id: "sha256_follower_following",
  followerId: "openid_follower",       // 发起关注的人
  followingId: "openid_following",     // 被关注的人
  followerName: "小鹿在路上",          // 关注发生时的昵称快照
  followerAvatar: "https://...",       // 关注发生时的头像快照
  followingName: "山野漫游记",
  followingAvatar: "https://...",
  createdAt: 1785149400000,
  updatedAt: 1785149400000
};

/*
==========================================
索引配置（在云开发控制台创建）
==========================================

users:
  - userId (唯一)
  - openid (唯一)
  - createdAt

places:
  - category
  - location (地理索引)
  - wantCount

trips:
  - dataEnv + reviewStatus + createdAt + _id（复合索引，用于首页公开行程稳定游标分页）
  - dataEnv + reviewStatus + placeId + createdAt + _id（复合索引，用于按地点筛选）
  - dataEnv + reviewStatus + status + createdAt + _id（复合索引，用于按状态筛选）
  - dataEnv + reviewStatus + date + createdAt + _id（复合索引，用于按日期筛选）
  - creatorId + reviewStatus + createdAt（复合索引，用于他人主页公开行程）
  - reviewStatus + createdAt（复合索引，用于后台行程审核）

applies:
  - tripId
  - userId
  - creatorId
  - status

wants:
  - placeId
  - userId (复合唯一索引)

messages:
  - conversationId
  - createdAt
  - toUserId + read

comments:
  - placeId
  - createdAt

notifications:
  - receiverId + status + createdAt + _id（复合索引，用于全部消息稳定分页）
  - receiverId + status + category + createdAt + _id（复合索引，用于分类消息稳定分页）
  - receiverId + status + isRead（复合索引，用于未读数量和全部已读）

community_posts:
  - dataEnv + status + reviewStatus + createdAt + _id（复合索引，用于公共列表按业务环境稳定游标查询）
  - dataEnv + status + reviewStatus + authorId + createdAt + _id（复合索引，用于关注、地区及个人主页筛选）
  - authorId + status + createdAt + _id（复合索引，用于“我的作品”列表，暂不按环境隔离）
  - status + adminReviewStatus + machineSuggest + createdAt（复合索引，用于后台人工审核）
  - draftId（唯一索引，防止重复发布）
  - authorType + createdAt（复合索引，用于后台官方动态分页）

users:
  - accountType + createdAt（复合索引，用于后台官方账号列表）

community_likes:
  - postId + createdAt + _id（复合索引，供点赞列表稳定分页）
  - userId + createdAt + _id（复合索引，供“我的互动-赞过”稳定分页）

community_comments:
  - postId + status + createdAt + _id（复合索引，供评论稳定分页）
  - authorId + status + createdAt + _id（复合索引，供“我的互动-评论”稳定分页）

community_comment_replies:
  - postId + rootCommentId + status + createdAt + _id（复合索引，供回复稳定分页）
  - authorId + status + createdAt + _id（复合索引，供“我的互动-评论”稳定分页）

community_image_audits:
  - postId
  - expiresAt

community_upload_drafts:
  - ownerId + status + createdAt（复合索引）
  - expiresAt（TTL索引或定时清理依据）

official_upload_sessions:
  - ownerId + status + createdAt（复合索引）
  - expiresAt（TTL索引或定时清理依据）

community_cleanup_tasks:
  - status + createdAt（用于清理队列处理）

trip_media_upload_sessions:
  - ownerId + tripId + status（复合索引，供上传会话校验）
  - expiresAt（TTL索引或定时清理依据）

trip_media_cleanup_tasks:
  - status + createdAt（用于行程图片清理队列处理）

trip_comments:
  - tripId + status + createdAt + _id（复合索引，供行程主评论稳定分页）

trip_comment_replies:
  - tripId + rootCommentId + status + createdAt + _id（复合索引，供行程回复稳定分页）

trip_comment_image_audits:
  - expiresAt（TTL索引或定时清理依据）

user_follows:
  - followerId + createdAt + _id（复合索引，供“关注”列表稳定分页）
  - followingId + createdAt + _id（复合索引，供“粉丝”和新关注通知稳定分页）

users:
  - region（单字段索引，供社区作者地区筛选）

*/
