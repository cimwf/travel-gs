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
9. ai_image_templates - AI 生图模板表
10. ai_image_template_votes - AI 生图模板用户反馈表
11. ai_image_packages - AI 生图套餐表
12. ai_image_orders - AI 生图模拟订单表
13. ai_image_quotas - AI 生图额度表
14. ai_image_generations - AI 生图任务表
15. ai_image_channels - AI 生图渠道表

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
  avatar: "https://...",            // 头像
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
      avatar: "https://..."
    }
  ],
  
  remark: "早上6点出发，AA制",
  status: "open",                   // open/full/cancelled
  
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
  userId: "user_xxx",               // 接收者
  
  type: "apply_accepted",           // apply_accepted/apply_new/comment/trip_reminder
  title: "申请已通过",
  content: "你申请的东灵山行程已被接受",
  
  data: {
    tripId: "trip_xxx",
    placeName: "东灵山"
  },
  
  read: false,
  createdAt: 1711123200000
};

// 9. ai_image_templates - AI 生图模板表
const aiImageTemplateSchema = {
  _id: "template_xxx",
  templateId: "soft-portrait",     // 默认模板稳定标识，后台新建可为空
  mode: "image",                   // text 文生图 / image 图生图
  scene: "人像",                    // 场景：人像/旅行/穿搭/美食/活动
  title: "清透约拍",
  desc: "保留人物姿态，修成干净通透的写真。",
  badge: "女生最爱",
  ratio: "3:4",                    // 1:1 / 3:4 / 4:3 / 9:16
  style: "韩系写真",                // 为空表示无风格
  prompt: "保留原图人物脸型、姿态和构图，优化成清透干净的韩系写真风...",
  imageUrl: "https://...",          // 后台上传后的预览图 URL 或云存储 fileID
  imageFileID: "cloud://...",       // 可选，云存储 fileID
  sort: 110,                       // 数字越小越靠前
  enabled: true,
  likeCount: 0,
  dislikeCount: 0,
  createdAt: 1711123200000,
  updatedAt: 1711123200000
};

// 10. ai_image_template_votes - AI 生图模板用户反馈表
const aiImageTemplateVoteSchema = {
  _id: "vote_xxx",
  userId: "openid_xxx",
  templateId: "template_xxx",       // ai_image_templates 的 _id
  vote: "like",                     // like / dislike
  createdAt: 1711123200000,
  updatedAt: 1711123200000
};

// 11. ai_image_packages - AI 生图套餐表
const aiImagePackageSchema = {
  _id: "package_xxx",
  packageId: "standard-50",
  title: "AI 生图 50 张",
  desc: "适合集中测试和日常创作，支付后立即到账。",
  badge: "推荐",
  price: 25,                         // 折前价
  discount: 0.8,                     // 折扣系数，0.8 表示 8 折
  discountedPrice: 20,               // 折后价，接口按 price * discount 计算
  imageCount: 50,
  sort: 10,
  enabled: true,
  createdAt: 1711123200000,
  updatedAt: 1711123200000
};

// 12. ai_image_orders - AI 生图模拟订单表
const aiImageOrderSchema = {
  _id: "order_xxx",
  orderNo: "AI1711123200000ABCDEF",
  userId: "openid_xxx",
  appUserId: "BJ143052A7F3",
  nickname: "旅行达人",
  phone: "13800138000",
  phoneMask: "138****8000",
  avatar: "https://...",
  packageId: "package_xxx",
  packageKey: "standard-50",
  title: "AI 生图 50 张",
  price: 20,                         // 折后实付价
  originalPrice: 25,                 // 折前价
  discount: 0.8,
  discountedPrice: 20,
  beforePrice: 25,
  afterPrice: 20,
  imageCount: 50,
  beforeTotal: 3,
  beforeUsed: 3,
  beforeRemaining: 0,
  afterTotal: 50,
  afterUsed: 0,
  afterRemaining: 50,
  status: "paid",
  payType: "mock",
  createdAt: 1711123200000,
  paidAt: 1711123200000
};

// 13. ai_image_quotas - AI 生图额度表
const aiImageQuotaSchema = {
  _id: "quota_xxx",
  userId: "openid_xxx",             // 用户 openid
  appUserId: "BJ143052A7F3",        // users.userId，后台搜索用
  nickname: "旅行达人",              // 用户昵称快照，后台搜索用
  phone: "13800138000",             // 用户手机号快照，后台搜索用
  phoneMask: "138****8000",         // 脱敏手机号
  avatar: "https://...",            // 用户头像快照
  total: 3,                         // 总额度，可在后台管理修改
  used: 0,                          // 当前额度周期已用次数，充值重置为 0
  createdAt: 1711123200000,
  updatedAt: 1711123200000
};

// 14. ai_image_generations - AI 生图任务表
const aiImageGenerationSchema = {
  _id: "generation_xxx",
  userId: "openid_xxx",
  responseId: "resp_xxx",           // 任务 ID / OpenAI responseId / 服务 taskId
  channelId: "channel_xxx",         // 渠道 ID
  channelName: "渠道一",             // 渠道名称
  channelCountedAt: 1711123200000,   // 渠道成功/失败统计时间
  channelCountedStatus: "completed", // completed / failed
  external: true,
  mode: "text",                     // text / image
  prompt: "旅行海报风格的...",      // 提示词
  style: "电影感",
  ratio: "1:1",
  model: "gpt-image-2",
  referenceFileID: "cloud://...",
  images: [
    {
      id: "image_xxx",
      status: "queued",
      key: "cloud://...",
      fileID: "cloud://...",
      cloudPath: "ai-images/resp_xxx.png",
      publicUrl: "https://...",
      width: 1024,
      height: 1024,
      format: "png",
      bytes: 123456
    }
  ],
  usage: null,
  status: "queued",
  error: "",
  createdAt: 1711123200000,
  updatedAt: 1711123200000,
  completedAt: 1711123200000,
  chargedAt: 1711123200000
};

// 15. ai_image_channels - AI 生图渠道表
const aiImageChannelSchema = {
  _id: "channel_xxx",
  channelId: "channel_1",           // 可复制给前端和云托管环境变量使用
  name: "主渠道",
  remark: "默认高稳定渠道",
  enabled: true,
  callCount: 0,
  successCount: 0,
  failCount: 0,
  createdAt: 1711123200000,
  updatedAt: 1711123200000
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
  - placeId
  - creatorId
  - date
  - status

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
  - userId
  - read
  - createdAt

ai_image_templates:
  - enabled + mode + sort
  - enabled + mode + scene + sort
  - templateId

ai_image_template_votes:
  - userId + templateId

ai_image_packages:
  - enabled + sort
  - packageId

ai_image_orders:
  - orderNo
  - userId + createdAt
  - nickname
  - phone
  - phoneMask
  - appUserId
  - packageId

ai_image_quotas:
  - userId
  - nickname
  - phone
  - phoneMask
  - appUserId
  - updatedAt

ai_image_generations:
  - responseId
  - userId + createdAt
  - channelId
  - status

ai_image_channels:
  - channelId (唯一)
  - enabled + createdAt
  - name
*/
