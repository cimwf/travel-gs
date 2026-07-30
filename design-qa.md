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
- 主评论与键盘发送已接入 `community_comments`，回复使用
  `community_comment_replies`；回复平铺在主评论下，服务端通过
  `msgSecCheck` 后才写入，并同步更新动态评论总数。
- 模拟器已验证输入框可聚焦且配置 `confirm-type="send"`；桌面模拟器不会像真机
  一样完整显示系统软键盘。

## Findings

没有剩余 P0、P1 或 P2 视觉问题。

final result: passed

---

# 行程大图卡片 Design QA（2026-07-29）

## 对比基准

- Source visual truth:
  `/var/folders/c3/7dkyt48n3vq6_v4x4nq82cv40000gp/T/codex-clipboard-1841c166-9e0a-4d60-806d-e5658a1b2e70.png`
- 首页实现截图: `/tmp/trip-list-card-implementation.png`
- 我的行程实现截图: `/tmp/my-trips-card-implementation.png`
- 同尺寸并排对比: `/tmp/my-trips-card-comparison.png`
- Source pixels: `853 × 1844`
- Implementation capture: `1200 × 768`（含开发者工具），其中模拟器内容裁切并归一为
  `263 × 568`；source 同比例缩放为 `263 × 568`。
- State: 微信开发者工具真实云数据；首页一条招募中行程，“我的行程”同时包含招募中
  与已结束状态。

## Full-view comparison

- 两个页面原有系统导航、首页筛选栏、“我的行程”身份标签和系统 Tab 均未改动。
- 行程卡片改为与 source 一致的上方横向大图、下方标题/状态、日期、集合地、
  参与者和右侧操作区。
- 卡片宽度、圆角、图片比例、卡片间距和蓝白色层级与 source 接近；开发者工具
  70% 模拟缩放仅影响截图文字锐度，不影响真机矢量渲染。

## Focused card comparison

- `/tmp/my-trips-card-comparison.png` 左侧为 source，右侧为实现。
- 实现沿用真实景区图和真实行程文案，因此图片内容、日期和人数与 source 示例不同；
  卡片结构、信息顺序、状态位置与操作区位置一致。
- 当前云数据中的所有可见行程都有景区图，因此头像兜底没有出现在本次截图中；
  WXML 同时保留 `trip-card-avatar-cover` 状态，结构测试验证无封面时会展示发起人头像
  与“发起”文案。

## Required fidelity surfaces

- Fonts and typography: 使用小程序系统中文字体；标题 33rpx/650，辅助信息 25rpx，
  状态 23rpx，层级和 source 一致且没有换行挤压。
- Spacing and layout rhythm: 图片高度 250rpx，正文内边距 22/24rpx，操作区保持单行；
  iPhone 12/13 模拟器中未出现横向溢出或按钮遮挡。
- Colors and visual tokens: 沿用项目 `#F4F9FF`、白色、`#2783EE` 和语义状态色，
  不修改页面头部颜色。
- Image quality and asset fidelity: 自定义封面优先，其次景区图；两者都没有时使用
  `#EAF4FF` 头像区，头像保持圆形比例而非拉伸为横图。日期、定位和箭头复用项目
  已有图片资源。
- Copy and content: 首页保留“查看详情”；“我的行程”保留“管理”“退出”“查看详情”，
  原有全部/我发起的/我参与的/已结束逻辑不变。

## Functional verification

- 微信开发者工具实际打开 `pages/trip-list/trip-list` 和
  `pages/my-trips/my-trips`，两页卡片均正常渲染。
- 调试器显示 `0` 个代码问题；现有基础库和 SharedArrayBuffer 警告与本次改动无关。
- `npm test`: `27/27` 通过。
- `node tests/trip-log-rules.test.js`: `11/11` 通过。
- `git diff --check` 通过。

## Findings

没有剩余 P0、P1 或 P2 视觉问题。

## Follow-up Polish

- [P3] 当前首页真实数据只有一张卡片，头像兜底建议在真机测试数据中再覆盖一次，
  确认不同长度昵称的单行截断效果。

final result: passed

# 个人主页与编辑资料 Design QA（2026-07-29）

## 对比基准

- Source visual truth:
  `/Users/shan/.codex/generated_images/019f6506-a4d4-7db1-9774-24137bcc1805/call_d3rblvnvDJs5KjRQ9ExjcnDm.png`
- Personal profile implementation:
  `/tmp/user-profile-implementation.png`
- Edit profile implementation:
  `/tmp/edit-profile-implementation.png`
- Region selector implementation:
  `/tmp/edit-profile-region-implementation.png`
- Full comparison evidence:
  `/tmp/profile-flow-comparison.png`
- Focused region comparison:
  `/tmp/edit-region-comparison.png`
- Source pixels: `1702 × 924`，为 ImageGen 输出的双页面设计板。
- DevTools captures: `390 × 780`，裁掉开发者工具栏后页面内容为
  `390 × 694`；微信开发者工具使用 iPhone 12/13 (Pro) 70%。
- State: 当前真实登录用户、公开作品列表、编辑资料默认态、北京地区弹窗展开态。

## Full-view comparison

- 个人主页保持浅蓝白色资料区、三项社交统计和“作品/行程”双标签层级。
- 作品区使用真实社区数据验证，实际画面包含文字和多张图片；单图、双图和多图
  由同一布局规则处理，不再使用只适合照片的瀑布流。
- 编辑资料使用头像、基础资料、自我介绍和底部主按钮的单列结构；保存按钮已调整为
  与表单同宽并居中。
- 两个页面都使用页面 JSON 配置的微信系统导航栏；开发者工具分离模拟器截图只保留
  页面内容，系统标题由运行时单独渲染。

## Focused region comparison

- 北京地区弹窗与确认稿并排检查：标题、副标题、关闭按钮、四列布局、16 个区名称、
  选中蓝色状态和底部圆角均一致。
- 实际测试通过点击“地区”行右侧箭头打开，不依赖原生省市区选择器。

## Required fidelity surfaces

- Fonts and typography: 使用微信小程序系统中文字体，昵称、统计、标签、表单标签和
  辅助文字层级清晰；模拟器 70% 缩放造成的轻微锐度下降属于运行时显示差异。
- Spacing and layout rhythm: 个人资料区、统计区和标签区与设计稿比例接近；作品动态
  使用分隔线形成连续信息流；编辑表单采用两个连续白色分组。
- Colors and visual tokens: 页面统一使用 `#F4F9FF`、`#FFFFFF`、`#2783EE`、
  `#17202B`、`#7F8997` 和 `#E8EDF3`。
- Image quality and asset fidelity: 头像和作品使用真实用户数据；位置、点赞、评论、
  相机和箭头均复用项目现有图标资源，没有 Emoji 或临时字符图标。
- Copy and content: 个人主页包含地区、关注、粉丝、获赞、作品和行程；编辑资料新增
  地区，并明确限制为北京 16 区。

## Interaction verification

- 从“我的”头像进入 `pages/user-profile/user-profile` 成功。
- 个人主页真实作品数据加载成功，作品数量和获赞数量随数据展示。
- 点击“编辑资料”进入 `pages/edit-profile/edit-profile` 成功。
- 点击地区行打开北京 16 区弹窗成功。
- `npm test` 的个人主页、编辑资料、头像上传和地区结构测试通过。
- `npm run test:community` 的 34 组社区测试通过。
- 微信开发者工具调试器显示 `0` 个错误；已有警告与本次改动无关。

## Findings

没有剩余 P0、P1 或 P2 视觉问题。

## Follow-up Polish

- [P3] 当前获赞数优先读取用户聚合字段，字段为空时使用本次加载的公开作品点赞和；
  后续关注/粉丝模块完成时，可统一由服务端统计接口返回全部计数。
- [P3] ImageGen 双页面设计板的单屏宽高比不是标准手机比例；实现保持真实微信小程序
  纵向滚动比例，因此同屏展示的作品数量与设计板不同，但信息层级和布局规则一致。

final result: passed

---

# 我的页面 Design QA（2026-07-29）

## 对比基准

- Source visual truth:
  `/Users/shan/.codex/generated_images/019f6506-a4d4-7db1-9774-24137bcc1805/call_jVrRA8eFOoLqnnUXklZHlJaQ.png`
- Implementation screenshot:
  `/tmp/profile-implementation.jpg`
- Full side-by-side comparison:
  `/tmp/profile-ui-comparison.jpg`
- Source pixels: `853 × 1844`
- Implementation capture: `390 × 844`
- Normalization: source downsampled to `390 × 844`; simulator at iPhone 12/13
  (Pro) 70% and cropped/resampled to the same content ratio.
- State: 已登录、真实头像与昵称、关注/粉丝/获赞为当前本地用户数据、行程数为
  当前真实数据。

## Full-view comparison

- 顶部标题、头像资料区、三项社交数据、两组紧密功能列表和系统 Tab 的信息
  层级与选定设计一致。
- 微信原生胶囊位于右上角，页面标题和个人资料均未进入胶囊安全区域。
- “其他”标题已删除；上传景点、提交建议和关于我们保留为紧接核心功能的第二组。
- 消息提醒只出现在“消息中心”行，不修改系统 Tab。
- 实现截图带有开发者工具模拟器提供的刘海和底部 Home Indicator；这些属于运行时
  设备外壳，不属于页面实现内容。

## Required fidelity surfaces

- Fonts and typography: 使用项目现有系统中文字体；标题、昵称、统计数字、菜单
  标题和辅助文案保持清晰的五级层次。模拟器截图缩放会降低文字锐度，真机渲染
  使用矢量文字。
- Spacing and layout rhythm: 头像区与统计区留白接近设计稿；两组列表同宽，间距
  为 `14rpx`，没有多余分区标题；小屏设备允许页面自然纵向滚动。
- Colors and visual tokens: 页面使用 `#F4F9FF`、`#EAF4FF`、白色和
  `#2783EE`，保持选定方案的冷色蓝白体系；红色仅用于未读数量。
- Image quality and asset fidelity: 头像使用用户真实图片；菜单使用 Tabler Icons
  的 MIT 授权 SVG 资源，没有 Emoji、字符图标或临时占位图。
- Copy and content: 保留我的行程、我的作品、互动记录、消息中心、上传景点、
  提交建议和关于我们；为避免在统一消息中心上线前丢失现有能力，消息副标题暂为
  “行程通知、赞、评论与回复”，点击继续进入现有行程通知页面。

## Comparison history

### Iteration 1

- Finding: 原设计把消息入口放在微信右上角胶囊区域，会被原生关闭与更多按钮遮挡。
- Fix: 移除顶部消息按钮，通过 `wx.getMenuButtonBoundingClientRect()` 动态计算
  自定义导航高度和右侧安全距离；消息未读状态移动到列表中的消息中心入口。
- Post-fix evidence:
  `/tmp/profile-implementation.jpg`

### Iteration 2

- Finding: 独立“其他”标题使页面被人为切成两块，和用户选定的紧凑方向不一致。
- Fix: 删除标题，将辅助功能改为与核心列表同宽、仅间隔 `14rpx` 的第二个列表组。
- Post-fix evidence:
  `/tmp/profile-ui-comparison.jpg`

## Functional verification

- 微信开发者工具中从系统 Tab 切换到“我的”成功，当前路由为
  `pages/profile/profile`。
- `tests/mvp-ui-flow.test.js` 中“我的”页面入口与未登录跳转测试通过。
- 社区完整测试 `34/34` 通过。
- 微信开发者工具调试器显示 `0` 个错误；现有警告不来自本次页面改动。
- 关注、粉丝、获赞和互动记录的完整列表尚未开发，当前点击会给出“开发中”反馈，
  不会跳转到不存在的页面。

## Findings

没有剩余 P0、P1 或 P2 视觉问题。

## Follow-up Polish

- [P3] 关注、粉丝和获赞目前读取用户资料中的已有统计字段；获赞聚合接口完成后，
  应以服务端社区作品点赞汇总替换本地字段。
- [P3] 统一消息中心上线后，将当前行程通知路由切换为消息中心，并在内部保留
  行程通知分类。

final result: passed
