# 行程与社区数据环境隔离

## 目标

开发版、体验版和正式版共用现有数据库，通过 `dataEnv` 区分行程和社区作品。

三种版本的 `cloudEnv` 均为 `cloud1-d2gel5jl093988c07`，不要为数据隔离另建云环境。

| 微信运行版本 | 写入值 | 默认读取值 |
| --- | --- | --- |
| `develop` | `dev` | `dev` 和未标记数据 |
| `trial` | `test` | `test` |
| `release` | `prod` | `prod` |

只有明确包含 `dataEnv: "prod"` 的数据才会在正式版首页列表展示。现有未标记数据按开发数据处理，不迁移。

## 全局配置

配置位于 `miniprogram/utils/env.js` 的 `dataEnvironmentConfigs`。

如果需要让体验版同时查看测试和生产数据，将配置改为：

```js
trial: {
  writeEnv: 'test',
  readEnvs: ['test', 'prod']
}
```

`writeEnv` 控制新发布数据的标记，`readEnvs` 控制列表允许展示哪些环境。二者可以分别配置。

## 当前覆盖范围

- 发布行程：写入 `trips.dataEnv`。
- 行程首页：按 `readEnvs` 查询。
- 发布社区作品：文字和图片作品均写入 `community_posts.dataEnv`。
- 社区首页：全部、关注、地区和个人主页复用的社区列表查询均按 `readEnvs` 过滤。

点赞、评论、通知、我的作品和其他关联数据暂不做环境隔离。

## 云数据库索引

根据当前首页筛选组合创建以下非唯一复合索引，字段方向如下：

### `trips`

- `dataEnv` 升序、`reviewStatus` 升序、`createdAt` 降序、`_id` 降序
- `dataEnv` 升序、`reviewStatus` 升序、`placeId` 升序、`createdAt` 降序、`_id` 降序
- `dataEnv` 升序、`reviewStatus` 升序、`status` 升序、`createdAt` 降序、`_id` 降序
- `dataEnv` 升序、`reviewStatus` 升序、`date` 升序、`createdAt` 降序、`_id` 降序

### `community_posts`

- `dataEnv` 升序、`status` 升序、`reviewStatus` 升序、`createdAt` 降序、`_id` 降序
- `dataEnv` 升序、`status` 升序、`reviewStatus` 升序、`authorId` 升序、`createdAt` 降序、`_id` 降序

开发版为了兼容缺少 `dataEnv` 的现有开发数据使用了 OR 查询。若控制台根据真实查询提示补充索引，以控制台生成的索引字段顺序为准。
