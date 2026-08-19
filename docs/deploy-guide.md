# 部署指南

> 基线日期：2026-08-19。本项目三个微信版本共用云环境
> `cloud1-d2gel5jl093988c07`，使用业务字段 `dataEnv` 隔离数据。

## 1. 部署前确认

- 微信开发者工具已登录正确的小程序账号。
- 云开发控制台当前环境为 `cloud1-d2gel5jl093988c07`。
- `miniprogram/utils/env.js`、`cloudbaserc.json` 和部署目标一致。
- 数据库集合和复合索引已按 [数据库集合与索引](database-and-indexes.md) 创建。
- 所有业务集合的小程序端权限设为“所有用户不可读写”。

## 2. 云函数

当前需要部署：

| 云函数 | 用途 | 建议超时 |
| --- | --- | --- |
| `login` | 获取微信身份 | 10 秒 |
| `api` | 全部小程序和后台业务 | 60 秒 |
| `community-media-check-result` | 图片审核回调 | 20 秒 |

微信开发者工具中右键对应目录，选择“上传并部署：云端安装依赖”。修改 handler、依赖、
权限或环境变量后都应重新部署对应函数。

`api/config.json` 必须包含：

```json
{
  "permissions": {
    "openapi": [
      "security.msgSecCheck",
      "security.mediaCheckAsync"
    ]
  }
}
```

## 3. 云函数环境变量

在 `api` 云函数配置：

```text
COS_SECRET_ID=<腾讯云 CAM 子用户 SecretId>
COS_SECRET_KEY=<腾讯云 CAM 子用户 SecretKey>
COMMUNITY_COS_BUCKET=imagica-images-1436573577
COMMUNITY_COS_REGION=ap-beijing
COMMUNITY_COS_BASE_URL=https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com
COMMUNITY_COS_PREFIX=miniapp/community/
COMMUNITY_COMMENT_COS_PREFIX=miniapp/community-comments/
TRIP_COS_PREFIX=miniapp/
TOKEN_SECRET=<生产环境随机高强度字符串>
```

注意：

- 使用最小权限 CAM 子用户，不使用主账号密钥。
- 永久密钥不得出现在 Git、前端、数据库、截图和普通日志中。
- 修改环境变量后重新部署或重启云函数实例并验证。
- `TOKEN_SECRET` 不应使用代码中的默认兜底值。

## 4. COS

当前 Bucket：

```text
imagica-images-1436573577
ap-beijing
https://imagica-images-1436573577.cos.ap-beijing.myqcloud.com
```

当前策略为公有读、私有写。CAM 至少应允许云函数为限定对象签发上传凭证，并允许
服务端执行 `HeadObject` 和删除自己业务目录中的对象。

COS CORS 至少覆盖实际上传所需的 `PUT`、`HEAD`、`GET` 和临时凭证请求头。不要为了
排障长期保留不受限制的跨域写权限。

微信公众平台合法域名至少核对：

- `request` 合法域名
- `uploadFile` 合法域名（若当前 SDK 链路使用）
- `downloadFile` 合法域名

都需包含 COS HTTPS 域名。当前 `project.config.json` 中 `urlCheck=false` 仅适合本地
调试；提交前应打开域名校验并完成真机回归。

## 5. 图片审核消息推送

仅部署回调云函数还不够。需要在云开发消息推送中配置并启用：

```text
消息类型：event
事件类型：wxa_media_check
目标云函数：community-media-check-result
```

发布一张测试图片后检查日志：

```text
[community/image-audit-callback] received
[community/image-audit-callback] audit-saved
[community/image-audit-callback] completed
```

关闭小程序后回调仍应完成。多图会分别回调，云函数通过独立审核记录和事务汇总最终
状态。

## 6. 数据环境

默认映射：

```text
develop -> write dev  / read dev
trial   -> write test / read test
release -> write prod / read prod
```

需要临时让开发版读取生产数据时，只修改 `miniprogram/utils/env.js` 中对应
`readEnvs`，验证后恢复。不要直接改数据库旧记录来模拟环境。

官方动态在后台创建时固定为 `dev`；确认后点击发布，后端改为 `prod` 并更新创建时间。

## 7. 后台管理

后台项目位于同级目录 `../travel-be-gs`。它不直接读取数据库，使用 CloudBase 调用本
仓库的 `api` 云函数。

```bash
cd ../travel-be-gs
npm install
npm run build
```

部署命令以后台项目 `package.json` 为准。首次使用需要创建 `admin_users`，只能在集合
没有管理员时调用首个管理员注册；生产环境应及时限制注册入口。

## 8. 验证顺序

1. 运行本地测试。
2. 部署 `login`、`api`、审核回调。
3. 开发版验证登录、资料头像、社区、行程、评论图片和通知。
4. 后台验证列表、分页、官方动态、审核和举报处理。
5. 体验版验证 `test` 数据隔离、合法域名和真机上传。
6. 正式版发布前验证只读取 `prod`，清理测试内容并执行上线检查清单。

## 9. 常见问题

### 列表返回 0 条

依次检查集合、云环境、`dataEnv`、`reviewStatus/status`、管理员身份和复合索引。后台
前端请求成功不等于集合查询有结果，需查看云函数返回的 `total/items` 和日志。

### COS 尚未配置

检查 `api` 云函数的 SecretId/SecretKey 和 Bucket 环境变量，配置后重新部署。合法
域名只解决客户端网络校验，不能替代云函数密钥。

### 图片一直审核中

检查消息推送规则是否启用、trace 对应审核集合是否存在，以及回调云函数日志。多图
必须每张都有回调记录。

### 数据库权限修改后后台没数据

确认后台是否仍在直接使用 CloudBase database SDK。所有后台列表应改为调用
`admin/data*` 或对应审核接口；云函数不受“小程序客户端不可读写”规则限制。
