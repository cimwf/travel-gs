# 社区动态详情页 Design QA

## 对比基准

- Source visual truth:
  `/Users/shan/.codex/generated_images/019f6506-a4d4-7db1-9774-24137bcc1805/call_mzJCV4eWwmvuzawXal95Iu9P.png`
- Implementation screenshot:
  `/tmp/community-detail-unliked-final-v2.png`
- Full side-by-side comparison:
  `/tmp/community-detail-ui-comparison.png`
- Focused bottom-bar comparison:
  `/tmp/community-detail-bottom-bar-comparison.png`
- Source pixels: `853 × 1844`
- Implementation capture: `390 × 780`
- Simulator: 微信开发者工具独立模拟器，iPhone 12/13 (Pro)
- State: 未点赞、点赞数 0、评论数 0

实现使用模拟器中的真实动态数据，因此正文、图片和计数与设计稿不同；本次重点核对
详情页结构、互动区布局、图标资源和状态样式。

## Full-view comparison

- 页面使用系统导航栏，标题为“动态详情”。
- 原动态的头像、昵称、时间、文字、定位和图片完整展示。
- 点赞列表和评论列表位于原动态下方；没有数据时展示安全空状态。
- 页面主体独立滚动，底部互动栏始终保持在可视区域内。
- 信息区没有再次出现信息流页面的点赞/评论按钮。

## Focused bottom-bar comparison

- 左侧为圆角纯文本输入框，提示语为“说点什么…”。
- 右侧依次为点赞图标与数量、评论图标与数量。
- 未点赞使用社区信息流共用的灰色空心心形；点赞后使用共用的红色实心心形。
- 评论继续复用社区信息流的灰色三点气泡图标。
- 不展示独立“发送”按钮，输入框通过键盘的发送动作提交。

## Required fidelity surfaces

- Fonts and typography: 使用项目系统字体；正文、辅助信息和计数层级与现有社区
  页面一致。
- Spacing and layout rhythm: 底部输入框占据主要宽度，两个互动操作紧凑排列，
  不挤压安全区。
- Colors and visual tokens: 默认互动色为 `#8390A6`，点赞态为
  `#FF4D4F`，边框与背景沿用社区页面现有色值。
- Image quality and asset fidelity: 复用项目已有
  `icon-like-heart-gray.svg`、`icon-like-heart-active.svg` 和
  `icon-comment-gray.svg`，没有使用字符图标或临时占位图。
- Copy and content: 点赞数、评论数均为动态数据；评论输入仅支持纯文本。

## Comparison history

### Iteration 1

- Finding: 短内容动态下，固定定位的互动栏会被原生导航栏与视口高度计算挤出
  屏幕。
- Fix: 将详情页改为完整高度的纵向 flex 容器，内容区独立滚动，互动栏使用
  `flex-shrink: 0` 锚定在滚动区下方。
- Post-fix evidence:
  `/tmp/community-detail-unliked-final-v2.png`

### Iteration 2

- Finding: 需要确认默认心形不能为红色，并且详情页仍需同时展示点赞数和评论数。
- Fix: 默认使用灰色空心心形，点赞后切换红色实心心形；补齐评论图标及两个实时
  计数。
- Post-fix evidence:
  `/tmp/community-detail-bottom-bar-comparison.png`

## Functional boundary

- 点赞继续复用现有 `communityToggleLike` 接口，详情页的点赞状态会同步回社区
  信息流。
- 评论列表与键盘发送已接入 `community_comments`；仅支持纯文本一级评论，
  服务端通过 `msgSecCheck` 后才写入，并同步更新动态评论数。
- 模拟器已验证输入框可聚焦且配置 `confirm-type="send"`；桌面模拟器不会像真机
  一样完整显示系统软键盘。

## Findings

没有剩余 P0、P1 或 P2 视觉问题。

final result: passed
