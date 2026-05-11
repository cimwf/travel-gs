# 项目部署指南

## 一、云开发环境配置

### 1. 开通云开发
在微信开发者工具中：
1. 点击工具栏的「云开发」按钮
2. 按提示开通云开发服务
3. 选择按量付费或基础版（免费）

### 2. 配置环境ID
确认 `miniprogram/app.js` 中的 `cloudEnv` 与你的云开发环境ID一致：
```javascript
globalData: {
  cloudEnv: 'cloud1-xxxxx' // 替换为你的环境ID
}
```

## 二、创建数据库集合

在云开发控制台 → 数据库中创建以下集合：

| 集合名 | 说明 |
|--------|------|
| users | 用户表 |
| places | 地点表 |
| trips | 行程表 |
| applies | 申请表 |
| wants | 想去表 |
| messages | 消息表 |
| comments | 评论表 |

### 创建方式
1. 打开云开发控制台 → 数据库
2. 点击「添加集合」
3. 输入集合名称，点击确定
4. 重复以上步骤创建所有集合

## 三、部署云函数

### 1. 安装依赖
在微信开发者工具中：
1. 右键点击 `cloudfunctions/api` 文件夹
2. 选择「在终端中打开」
3. 运行 `npm install`
4. 对 `cloudfunctions/login` 和 `cloudfunctions/init-data` 重复以上步骤

### 2. 上传并部署
1. 右键点击 `cloudfunctions/api` 文件夹
2. 选择「上传并部署：云端安装依赖」
3. 等待部署完成
4. 对 `cloudfunctions/login` 和 `cloudfunctions/init-data` 重复以上步骤

## 四、部署 AI 生图服务

AI 生图服务位于 `services/ai-image-service`，Node.js 需使用 14.17.0 或更高版本；使用仓库内 Dockerfile 部署时默认是 Node 20。

关键环境变量：

```text
OPENAI_API_KEY=你的 OpenAI Key
OPENAI_BASE_URL=https://api.openai.com
OPENAI_API_MODE=images
AI_IMAGE_SERVICE_SECRET=一段随机密钥
TENCENT_SECRET_ID=腾讯云 API SecretId
TENCENT_SECRET_KEY=腾讯云 API SecretKey
COS_BUCKET=example-1250000000
COS_REGION=ap-shanghai
COS_PUBLIC_BASE_URL=https://example-1250000000.cos.ap-shanghai.myqcloud.com
```

`COS_BUCKET` 必须是完整 Bucket 名称，包含 appid 后缀，例如 `example-1250000000`；`COS_PUBLIC_BASE_URL` 需要与 Bucket 和地域匹配。

云函数侧需要配置：

```text
AI_IMAGE_SERVICE_URL=https://你的 AI 生图服务域名
AI_IMAGE_SERVICE_SECRET=与 AI 生图服务一致的密钥
```

## 五、导入初始数据

### 方式一：调用云函数（推荐）
1. 在云开发控制台 → 云函数
2. 找到 `init-data` 云函数
3. 点击「测试」按钮
4. 运行后会自动导入13个地点数据

### 方式二：手动导入
1. 打开云开发控制台 → 数据库 → places 集合
2. 点击「导入」→ 选择JSON文件
3. 使用 `database/places.json` 文件导入

## 六、数据权限配置

在云开发控制台 → 数据库，对每个集合设置权限规则：

### 推荐配置
```
users: 仅创建者可读写
places: 所有用户可读，仅创建者可写
trips: 所有用户可读，仅创建者可写
applies: 仅创建者可读写
wants: 仅创建者可读写
messages: 仅创建者可读写
comments: 所有用户可读，仅创建者可写
```

### 快捷配置
1. 点击集合右侧的「权限设置」
2. 选择「简易权限配置」
3. 根据上表选择对应权限

## 七、验证部署

### 1. 检查云函数
在云开发控制台 → 云函数，确认3个云函数状态为「正常」

### 2. 检查数据
在云开发控制台 → 数据库 → places，确认有13条地点数据

### 3. 测试运行
在模拟器中刷新小程序，首页应显示地点列表

## 八、常见问题

### Q: 首页显示空白或报错
A: 检查以下几点：
1. 云开发是否已开通并初始化
2. 云函数是否已部署
3. places 集合是否有数据
4. 控制台是否有错误信息

### Q: 云函数调用失败
A: 检查以下几点：
1. 云函数是否已部署
2. app.js 中的环境ID是否正确
3. 云函数是否已安装依赖

### Q: 登录失败
A: 检查以下几点：
1. login 云函数是否已部署
2. 是否在正式环境中测试（体验版可能有限制）

## 九、数据结构参考

详细的数据库结构请参考 `database/schema.js`

初始地点数据请参考 `database/init-places.js`
