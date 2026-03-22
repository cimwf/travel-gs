# 北京去哪玩 (Beijing Travel)

一个微信小程序，帮助用户发现北京周边的旅游地点，寻找旅行伙伴。

## 功能特性

- 🏔️ **地点广场** - 发现北京周边热门地点
- 📝 **发布行程** - 发布你的旅行计划，寻找同行伙伴
- 💬 **消息中心** - 接收行程申请和邀请
- 👤 **个人中心** - 管理你的行程和想去的地方

## 技术栈

- 微信小程序原生开发
- 微信云开发

## 项目结构

```
beijing-travel/
├── miniprogram/           # 小程序代码
│   ├── pages/            # 页面
│   │   ├── index/        # 首页
│   │   ├── place-detail/ # 地点详情
│   │   ├── trip-publish/ # 发布行程
│   │   ├── messages/     # 消息中心
│   │   └── profile/      # 个人中心
│   ├── images/           # 图片资源
│   ├── app.js
│   ├── app.json
│   └── app.wxss
├── cloudfunctions/        # 云函数
│   └── login/            # 登录云函数
└── project.config.json   # 项目配置
```

## 开发

1. 克隆项目
```bash
git clone https://github.com/你的用户名/beijing-travel.git
```

2. 导入微信开发者工具

3. 开通云开发环境

4. 上传云函数

## License

MIT
