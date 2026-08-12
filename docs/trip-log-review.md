# 旅行记录审核与上线配置

## 审核规则

- 纯文字、定位旅行记录：文字字段通过 `msgSecCheck` 后直接发布。
- 带图旅行记录：文字先检查，图片并发提交 `mediaCheckAsync`。
- 所有图片 `pass`：自动通过并公开展示。
- 任一图片 `review` 且无 `risky`：公开展示，同时进入后台待复核。
- 任一图片 `risky`：暂不公开展示，进入后台待人工审核。
- 后台人工通过或不通过后，以人工结论为准，后到达的图片回调不得覆盖。
- 审核中、待人工审核和审核不通过的记录仅发布者本人可见，并展示状态。

## 云函数与消息推送

重新部署：

- `api`
- `community-media-check-result`

继续复用现有 `wxa_media_check` 消息推送规则，目标云函数仍为
`community-media-check-result`。该函数现在同时处理社区作品和旅行记录图片回调。

## 数据库集合

新增集合：

```text
trip_log_image_audits
```

已有 `trip_logs` 集合会增加：

```text
reviewStatus
machineSuggest
adminReviewStatus
imageAuditStatus
imageAuditTraceIds
adminReviewRemark
adminReviewedAt
adminReviewerName
```

历史旅行记录没有 `reviewStatus` 时继续按已通过处理。

## 建议复合索引

在 `trip_logs` 创建：

```text
名称：idx_trip_logs_trip_status_created
tripId 升序
status 升序
createdAt 升序
```

```text
名称：idx_trip_logs_admin_review_created
status 升序
adminReviewStatus 升序
machineSuggest 升序
createdAt 降序
```

```text
名称：idx_trip_logs_review_status_created
status 升序
reviewStatus 升序
machineSuggest 升序
createdAt 降序
```

索引均不是唯一索引。若云开发控制台根据实际 OR 查询提示不同字段顺序，以控制台
自动生成的索引建议为准。

## 后台

后台新增“旅行记录审核”：

- 支持待处理、已通过、未通过筛选。
- 支持 Pass、Review、Risky 机器结论筛选。
- 支持分页、图片预览、审核备注、通过和不通过。
