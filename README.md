# 周末约行

面向北京用户的本地生活与周末出行微信小程序。当前首页为社区，用户可以发布动态、
浏览关注用户及指定地区的内容；同时支持发布行程、申请加入、旅途记录、评论互动和
站内通知。项目已经上线，当前仓库是小程序与共享云函数后端。

> 文档基线：2026-08-19。业务和部署信息以当前代码及 [docs/README.md](docs/README.md)
> 为准，早期设计稿只作历史参考。

## 当前产品结构

系统 Tab 顺序如下：

1. **社区**：动态列表、关注/地区筛选、发布图文、点赞、评论/回复、个人主页、举报。
2. **行程**：10 条分页列表、发布与分享、加入申请、成员管理、旅途记录、行程评论。
3. **我的**：个人资料、关注/粉丝、作品与互动、我的行程、消息中心、反馈和协议。

主要能力：

- 微信登录与资料完善；头像、昵称、性别、年龄、北京地区和个人简介。
- 社区图文发布；正文支持文字审核，图片发布后异步审核，风险内容进入后台复核。
- 社区及行程评论支持文字和最多 3 张图片，并支持多级回复的平铺展示。
- 行程发布、申请留言、同意/拒绝、退出/移除成员、状态变更和微信分享。
- 旅途记录发布、定位、图片审核、删除和后台人工审核。
- 点赞、关注、评论、回复、行程和审核结果等站内通知；全局未读提醒横幅。
- 举报社区作品、旅行记录等内容；后台查看举报后进入对应审核流程。
- 官方账号与官方动态运营；内容先写入开发环境，确认后发布到生产环境。

## 技术架构

- **小程序前端**：原生微信小程序，代码位于 `miniprogram/`。
- **后端**：微信云函数，统一入口为 `cloudfunctions/api`。
- **审核回调**：`cloudfunctions/community-media-check-result` 处理社区、评论、行程评论
  和旅途记录的异步图片审核结果。
- **数据**：微信云数据库；客户端集合权限统一设为不可读写，所有业务访问经云函数。
- **图片**：社区图片、评论图片、头像、行程封面和旅途记录新图片写入腾讯云 COS；
  历史 `cloud://` 数据继续兼容展示。
- **后台管理**：同级项目 `../travel-be-gs`，通过本仓库 `api` 云函数访问数据。

三个小程序版本共用云环境 `cloud1-d2gel5jl093988c07`，业务数据通过 `dataEnv`
隔离：开发版写/读 `dev`，体验版写/读 `test`，正式版写/读 `prod`。没有 `dataEnv`
的历史数据仅归入 `dev`。

## 目录

```text
cloudfunctions/
  api/                          统一业务与后台管理接口
  community-media-check-result 图片审核异步回调
  login/                        获取微信身份信息
  init-data/                    早期景点初始化工具
database/                       早期景点种子数据与结构参考
docs/                           当前文档、测试说明和历史设计稿
miniprogram/                    微信小程序
tests/                          云函数与页面状态测试
```

## 本地验证

```bash
npm test
npm run test:community
npm run test:trip-comment
npm run test:trip-log
npm run test:trip-log-review
npm run test:trip-media
npm run test:trip-review
npm run test:data-env
npm run test:notification
npm run test:admin-data
```

这些测试以本地 mock 为主，不能替代开发版、体验版和正式版的真机验证。

## 部署入口

- [文档导航](docs/README.md)
- [当前架构与业务规则](docs/current-architecture.md)
- [数据库集合与索引](docs/database-and-indexes.md)
- [云函数接口](docs/api-reference.md)
- [部署指南](docs/deploy-guide.md)
- [隐私与数据说明](docs/privacy-and-data.md)
- [上线检查清单](docs/release-checklist.md)

密钥不得写入仓库。正式部署前必须在云函数环境变量中配置 COS 凭证，并核对数据库
权限、复合索引、图片审核消息推送和微信合法域名。
