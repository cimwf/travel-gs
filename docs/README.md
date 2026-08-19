# 周末约行文档导航

本文档目录以 2026-08-19 的代码为基线。新增功能应先更新对应的“当前文档”，再提交
代码；HTML 设计稿和带版本号的早期需求文档默认只作历史参考。

## 当前维护文档

| 文档 | 用途 |
| --- | --- |
| [项目 README](../README.md) | 产品概览、目录和本地验证入口 |
| [当前架构与业务规则](current-architecture.md) | 当前模块、状态机、环境隔离和存储审核逻辑 |
| [页面清单](页面清单.md) | 小程序现有页面与主要入口 |
| [数据库集合与索引](database-and-indexes.md) | 集合用途、权限和上线所需索引 |
| [云函数接口](api-reference.md) | `api` 云函数全部 action 及调用边界 |
| [部署指南](deploy-guide.md) | 云环境、COS、云函数、审核回调和后台部署 |
| [隐私与数据说明](privacy-and-data.md) | 实际收集的数据、用途、位置权限和存储位置 |
| [上线检查清单](release-checklist.md) | 每次提交微信审核前的回归清单 |
| [消息中心通知规则](message-center-notification-spec.md) | 通知类型、接收者、跳转和索引 |
| [数据环境隔离](data-environment-isolation.md) | `dev/test/prod` 的详细实现 |
| [行程媒体迁移](trip-media-cos-migration.md) | 行程封面与旅途记录迁移到 COS 的兼容规则 |
| [旅行记录审核](trip-log-review.md) | 旅行记录自动审核和后台审核 |

## 测试资料

- `docs/testing/release-readiness-checklist.md`：早期通用发布检查，可作为补充参考。
- `docs/testing/mvp-test-cases.md`：早期 MVP 用例，不代表当前完整功能。
- `docs/community-v1-test-guide.md`：社区 V1 的专项联调记录。
- `docs/trip-log-mvp/`：旅途记录早期需求、用例和测试报告。

## 历史资料

以下内容不应直接作为部署或业务判断依据：

- `design-qa.md`、`docs/design-*.html`、`docs/*设计*.html`：UI 设计过程稿。
- `docs/community-v1-implementation-task.md`、`docs/community-v1-product-tech-spec.md`：
  社区第一版开发任务和方案，部分状态逻辑已变化。
- `docs/community-v1-release-checklist.md`：社区首次上线记录，当前统一使用
  [上线检查清单](release-checklist.md)。
- `docs/云开发配置指南.md`：早期云开发说明，数据库权限和集合数量已过时。
- `database/schema.js`：早期景点/行程结构示例，不是当前完整数据库定义。

历史文档暂不删除，因为其中仍包含设计决策和排障记录；若与当前文档冲突，以当前代码
和本页“当前维护文档”为准。
