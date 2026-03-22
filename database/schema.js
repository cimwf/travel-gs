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

==========================================
集合结构说明
==========================================
*/

// 1. users - 用户表
const userSchema = {
  _id: "user_xxx",
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

/*
==========================================
索引配置（在云开发控制台创建）
==========================================

users:
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
*/
