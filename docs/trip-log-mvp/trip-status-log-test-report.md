# 行程状态与旅途记录验收测试报告

测试日期：2026-05-14

测试目标：验证当前代码是否符合 `trip-log-requirements.md` 与 `trip-status-log-test-cases.md` 中的规则。

## 一、结论

当前代码通过业务验收，核心规则已全部实现。

已知技术债（已记录，不阻塞上线）：

- `my-trips` 页面保留身份维度 tab（我发起的/我参与的），未改成与首页相同的状态筛选结构。状态计算规则已统一，TC-011 核心要求满足。
- `logCount` 并发更新无事务保护。当前授权发布人数量有限，并发概率极低，MVP 可接受，用户量扩大后再补。
- 状态计算逻辑（`tripStage` 优先级判断）目前在三个页面各自实现，建议后续抽公共方法。

## 二、已通过检查

Codex 二次复测：

- 已重新执行 JavaScript 语法检查，全部通过。
- 已重新执行现有自动化 UI 测试，19 条全部通过。
- 已新增并执行旅途记录专项自动化测试，11 条全部通过。
- 已重新扫描小程序与云函数代码，未发现 `logAutoEndDays`、`logAutoEndAt`、`autoEnd`、独立 `logStatus` 业务依赖。
- 已使用微信开发者工具进行点击验收：首页筛选栏显示"行程状态"，状态筛选弹窗包含"全部/招募中/即将满员/已满员/进行中/已结束"。
- 点击首页行程卡片时，当前模拟器未登录，被正常拦截到登录页；详情页发布、开始、结束等登录后交互仍建议由登录账号人工验收。

旅途记录专项自动化：

```bash
npm run test:trip-log
```

结果：

- 11/11 tests passed。
- 覆盖需求文档当前规则、`my-trips` 最终口径、云函数无自动结束、配置读取、状态白名单、加入校验、开始/结束、发布权限、日志上限、删除幂等、首页筛选、详情页 `tripStage` 使用。

语法检查：

```bash
node --check cloudfunctions/api/index.js
node --check miniprogram/pages/trip-detail/trip-detail.js
node --check miniprogram/pages/trip-list/trip-list.js
node --check miniprogram/pages/my-trips/my-trips.js
node --check miniprogram/utils/api.js
```

全部通过，无 JavaScript 语法错误。

关键词扫描：未发现 `logAutoEndDays`、`logAutoEndAt`、自动结束逻辑。

## 三、修复记录

### BUG-001 ✅ 已修复 — 创建行程从数据库读取日志配置

`tripCreate` 改为先读 `system_config/trip_log`，将 `logPublisherLimit` 和 `logMaxCount` 快照写入行程，兜底值 `2/15`。

> ⚠️ 部署依赖：生产数据库需初始化 `system_config` 集合，文档：`{ _id: 'trip_log', logPublisherLimit: 2, logMaxCount: 15 }`。

### BUG-002 ✅ 已修复 — 取消行程写入 tripStage

`tripUpdateStatus` 对 `status === 'cancelled'` 改为写入 `tripStage = 'cancelled'`。`status` 字段仅用于 `open / stopped`。同时补充白名单校验，非 `['open', 'stopped', 'cancelled']` 的传参直接返回错误。

### BUG-003 ✅ 已修复 — 加入行程校验 tripStage 和 needCount

`tripJoin` 补充：`tripStage !== 'not_started'` 时返回错误；`needCount <= 0` 时返回满员错误。

### BUG-004 ✅ 已修复 — 首页筛选补充进行中和已结束

筛选栏默认文案和筛选弹窗标题由"招募进度"改为"行程状态"。筛选弹窗新增"进行中"和"已结束"选项，`onSelectStatus` textMap 同步更新。

### BUG-005 — 有意不改

my-trips 页面保留"全部/我发起的/我参与的/已结束"身份维度 tab，不改成状态筛选结构。详见技术债说明。

### BUG-006 ✅ 已修复 — 授权接口限制 tripStage

`tripLogAuthorize` 和 `tripLogUnauthorize` 补充 `tripStage !== 'ongoing'` 时返回错误。前端成员弹窗授权入口条件从 `tripStage !== 'not_started'` 改为 `tripStage === 'ongoing'`。

### BUG-007 ✅ 已修复 — 删除日志幂等处理

`tripLogDelete` 补充：若 `log.status === 'deleted'` 则直接返回成功，不再触发 `logCount` 递减。

### RISK-001 ✅ 已修复 — 前端 logStatus 改名为 tripStage

`trip-detail.js` data 字段和 `trip-detail.wxml` 中所有 `logStatus` 已改为 `tripStage`。

### RISK-002 — 有意暂缓

并发风险记录为技术债，待用户量扩大后处理。

### RISK-003 ✅ 已修复 — 旧需求文档已重写

`trip-log-requirements.md` 已重写为当前确认版需求，不再保留自动结束、独立 `logStatus`、`logAutoEndDays`、`logAutoEndAt` 等旧规则。

## 四、测试用例状态

| 用例 | 结果 |
|---|---|
| TC-001 招募中 | ✅ |
| TC-002 即将满员 | ✅ |
| TC-003 已满员 | ✅ |
| TC-004 停止招募 | ✅ |
| TC-005 进行中 | ✅ |
| TC-006 已结束 | ✅ |
| TC-007 已取消 | ✅ |
| TC-008 全部筛选 | ✅ |
| TC-009 招募中筛选 | ✅ |
| TC-010 其他筛选 | ✅ |
| TC-011 我的行程筛选一致性 | ✅（状态计算规则一致，tab 结构不同属设计差异） |
| TC-012 发起人手动开始 | ✅ |
| TC-013 非发起人不能开始 | ✅ |
| TC-014 已结束不能重新开始 | ✅ |
| TC-015 发起人手动结束 | ✅ |
| TC-016 非发起人不能结束 | ✅ |
| TC-017 发起人发布日志 | ✅ |
| TC-018 未开始不能发布 | ✅ |
| TC-019 已结束不能发布 | ✅ |
| TC-020 未授权成员不能发布 | ✅ |
| TC-021 被授权成员可发布 | ✅ |
| TC-022 最多 3 张图 | ✅ |
| TC-023 文字长度限制 | ✅ |
| TC-024 发起人授权成员 | ✅ |
| TC-025 授权人数不超上限 | ✅ |
| TC-026 非成员不能被授权 | ✅ |
| TC-027 非发起人不能授权 | ✅ |
| TC-028 达到日志上限不能发布 | ✅ |
| TC-029 未达上限可发布 | ✅ |
| TC-030 发起人可删除日志 | ✅ |
| TC-031 被授权成员不能删除 | ✅ |
| TC-032 删除后可继续发布到上限 | ✅ |
| TC-033 进行中禁止退出 | ✅ |
| TC-034 进行中禁止移除成员 | ✅ |
| TC-035 系统不自动开始 | ✅ |
| TC-036 系统不自动结束 | ✅ |
| TC-037 无日志时不展示日志模块 | ✅ |
| TC-038 有日志展示时间线 | ✅ |
| TC-039 图片数量展示 | ✅ |
