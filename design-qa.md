# 社区点赞与评论互动区 Design QA

## 对比基准

- Source visual truth:
  `/Users/shan/Downloads/已生成图像 1 (2).png`
- Implementation screenshot:
  `/tmp/community-actions-heart-detached.png`
- Focused side-by-side comparison:
  `/tmp/community-actions-heart-comparison.png`
- Source pixels: `853 × 1844`
- Implementation capture: `390 × 780`
- Simulator: iPhone 12/13 (Pro), 70%
- State: 社区信息流，未点赞，评论逻辑未启用

本次只对比动态卡片底部的点赞与评论区域。参考图中互动区位于左侧且使用拇指，
但用户明确要求最终放在右下角并试用心形，因此这两处属于有意差异。

## Full-view comparison

开发者工具独立模拟器已成功渲染社区页面。点赞与评论位于每条动态内容结束后的
右下角；两组控件没有挤压图片、正文或悬浮发布按钮。调试器显示 0 errors、
0 warnings。

## Focused comparison

聚焦对比图把参考图互动区裁剪为 `300 × 100`、实现互动区裁剪为 `105 × 55`，
分别按等比例放大到相同的 180px 高度后并排比较。

- 图标：点赞使用 Tabler Icons `heart`，评论继续使用 Heroicons
  `chat-bubble-oval-left-ellipsis`；两者保持统一的圆角细线语言。
- 尺寸：图标与数字的视觉高度比例接近参考图。
- 间距：图标和数字保持紧凑，点赞与评论两组之间留出清晰分隔。
- 颜色：默认状态使用灰蓝色 `#8390A6`，接近参考图。
- 数字：零状态显示 `0`，不再显示“点赞”“评论”文字。

## Required fidelity surfaces

- Fonts and typography: 数字使用项目系统字体，26rpx、400 字重，层级与参考图
  的辅助信息一致。
- Spacing and layout rhythm: 互动区右对齐，图标与数字间距 10rpx，两组间距
  34rpx；无可见拥挤或错位。
- Colors and visual tokens: 默认灰蓝与参考图一致；点赞后心形使用红色
  `#FF4D4F`。
- Image quality and asset fidelity: 心形点赞使用 Tabler Icons 3.34.1、评论使用
  Heroicons 2.2.0 的真实 SVG 图标资源，不使用字符、CSS 绘图或占位图标。
- Copy and content: 只显示数值；评论仍为纯 UI，不绑定事件。

## Comparison history

### Iteration 1

- Earlier finding: 点赞使用心形字符，评论使用 CSS 绘制气泡，并显示“点赞/评论”
  文案，与参考图的拇指、三点气泡和数字样式不一致。
- Fix: 替换为 Bootstrap Icons 拇指与三点气泡资源；增加默认 `0`；统一尺寸、
  颜色和右下角对齐。
- Post-fix evidence:
  `/tmp/community-actions-source-vs-implementation.png`

### Iteration 2

- Earlier finding: Bootstrap Icons 拇指轮廓偏硬、气泡偏厚，虽然结构正确，但
  和参考图的圆角细线风格不一致。
- Fix: 更换为 Heroicons 24 Outline 同风格拇指和椭圆三点气泡，线宽调整为
  1.7；点赞状态使用同系列实心拇指。
- Post-fix evidence:
  `/tmp/community-actions-final-comparison.png`

### Iteration 3

- Earlier finding: Heroicons 拇指的手掌细节和折线较多，和参考图中简洁、直观的
  拇指轮廓仍有明显差异；评论气泡已经接近参考图。
- Fix: 仅把点赞图标替换为 Tabler Icons `thumb-up` 的轮廓和实心版本，保留
  Heroicons 评论图标与现有布局。
- Post-fix evidence:
  `/tmp/community-actions-tabler-final-comparison.png`

### Iteration 4

- User direction: 尝试把点赞由拇指改为心形。
- Fix: 未点赞改为灰蓝色空心 `heart`，点赞后改为红色实心 `heart`；评论图标、
  数值、右对齐位置和点赞逻辑保持不变。
- Post-fix evidence:
  `/tmp/community-actions-heart-comparison.png`

## Residual test gap

当前云端点赞接口尚未部署，因此未在模拟器内触发真实“已点赞”状态；已点赞图标
资源和前端状态切换仍由自动化测试覆盖。评论按需求没有交互逻辑。

## Findings

没有剩余 P0、P1 或 P2 视觉问题。

final result: passed
