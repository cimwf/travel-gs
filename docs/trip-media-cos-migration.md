# 行程媒体迁移到 COS

## 范围

- 发布行程日志：新图片写入 `miniapp/trip-logs/`。
- 行程详情更换封面：新图片写入 `miniapp/trip-covers/`。
- 行程列表头像：新图片写入 `miniapp/trip-avatars/`。
- 历史 `cloud://` 文件继续通过微信云存储临时链接展示，不做强制迁移。

## 上传与存储

前端先调用 `tripMedia/createUploadSession`。云函数校验当前用户与行程权限后，为每张图片生成唯一 COS key 和仅允许这些 key 的短期 STS 凭证。前端使用现有 `cos-wx-sdk-v5` 的 `putObject` 上传，业务接口再通过 `headObject` 确认对象存在后写入数据库。

COS 配置复用社区已有环境变量：

- `COS_SECRET_ID`
- `COS_SECRET_KEY`
- `COMMUNITY_COS_BUCKET`
- `COMMUNITY_COS_REGION`
- `COMMUNITY_COS_BASE_URL`

可选环境变量：

- `TRIP_COS_PREFIX`，默认值为 `miniapp/`

## 新增集合

部署前在当前云开发环境创建：

- `trip_media_upload_sessions`
- `trip_media_cleanup_tasks`

两个集合只由云函数读写。建议权限设置为“仅云函数可读写”。索引建议：

- `trip_media_upload_sessions`：`ownerId + tripId + status`
- `trip_media_upload_sessions`：`expiresAt`
- `trip_media_cleanup_tasks`：`status + createdAt`

## 数据兼容

- `trip_logs.images` 新数据保存 `{ provider, key, url, ... }`；旧数据继续支持 `{ fileID, cloudPath }`。
- `trips.coverImages` 继续保存可直接展示的字符串。旧数据可以是 `cloud://`，新数据为 COS URL。
- `trips.coverImageObjects` 保存新 COS 封面的对象元数据，用于安全校验和删除。
- `trips.customCoverImageObject` 保存新 COS 行程头像的对象元数据。

删除日志时会删除对应 COS 图片；更换或移除封面、行程头像时会删除不再使用的 COS 对象。删除失败会写入 `trip_media_cleanup_tasks`，供后续补偿任务重试。

## 上线步骤

1. 创建上述两个数据库集合和索引。
2. 确认 COS 环境变量与社区上传一致。
3. 重新部署 `api` 云函数并安装云端依赖。
4. 上传并体验新版小程序。
5. 分别测试日志图片、行程封面和行程头像，并在 COS 对应目录确认对象存在。
