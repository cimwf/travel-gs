# 关注与粉丝空状态 Design QA

## 对比目标

- 没有关注 Source visual truth:
  `/Users/shan/.codex/generated_images/019f6506-a4d4-7db1-9774-24137bcc1805/call_1aVvUyeK2pmBNSUwEYIH7Hfa.png`
- 没有粉丝 Source visual truth:
  `/Users/shan/.codex/generated_images/019f6506-a4d4-7db1-9774-24137bcc1805/call_j2X1uAzWT9WfKit3odJJpCsq.png`
- Source pixels: `853 × 1844`
- Target simulator: iPhone 12/13 (Pro), `390 × 844` CSS px, 70% display scale
- States: 当前用户关注数为 0；当前用户粉丝数为 0

## 实现范围

- 保留系统头部和蓝白胶囊标签，系统导航栏与页面主体统一为纯白背景。
- “没有关注”使用 Heroicons `user-plus` 线性图标，文案为“还没有关注的人”。
- “去社区看看”为蓝色实心白字按钮，点击切换到社区 Tab。
- “没有粉丝”使用 Heroicons `user-group` 线性图标。
- “去发布内容”为蓝色描边按钮，点击进入社区发布页。
- 查看其他用户的空列表时不展示代表本人操作的按钮。
- 已删除未采用的复杂人物插画资源。

## Rendered implementation evidence

- 微信开发者工具成功编译并将页面路径切换为：
  `pages/followers/followers`
- 可访问性树显示系统标题“关注与粉丝”。
- Developer Tools screenshot:
  `/tmp/follow-empty-devtools-stale.jpeg`
- 模拟器截图层仍显示切换前的行程空状态，刷新模拟器后仍未更新，不能作为
  关注空状态的可信渲染证据。
- 所有视觉验收专用的临时页面顺序和预览数据均已撤回。

## Full-view comparison

无法完成可信的同状态并排比较。源设计已打开检查，但开发者工具没有返回目标页面
的实际渲染画面。

## Focused region comparison

无法对空状态图标、标题、说明文案、按钮样式及纵向间距进行最终像素级比较。

## Required fidelity surfaces

- Fonts and typography: WXML 使用系统字体并按设计设置字号、字重和层级；缺少渲染证据。
- Spacing and layout rhythm: 胶囊标签和空状态间距已按选定图设置；缺少渲染证据。
- Colors and visual tokens: 使用现有 `#1677ed` 主色、纯白页面背景、浅蓝图标底和灰蓝辅助文字。
- Image quality and asset fidelity: 使用 Heroicons 2.2.0 官方线性图标，本地 SVG，无绿底图片。
- Copy and content: 两个状态的标题、说明和按钮文案与选定设计一致。

## 功能验证

- `npm test`: `30/30` 通过。
- `npm run test:community`: `35/35` 测试组通过。
- `npm run test:trip-log`: `12/12` 通过。
- `node --check`: 通过。
- `git diff --check`: 通过。
- 静态测试覆盖两个空状态、图标、按钮样式和按钮跳转。

## Findings

- [P1] 缺少最终渲染对比证据
  - Location: 微信开发者工具 iPhone 12/13 (Pro) 模拟器。
  - Evidence: 页面路径和系统标题已切换到“关注与粉丝”，模拟器截图层仍显示旧行程页。
  - Impact: 功能和代码检查已通过，但无法确认最终视觉像素级一致性。
  - Fix: 在开发者工具中手动重新打开项目或重启模拟器，分别查看关注和粉丝空状态。

## Follow-up Polish

- 补做两个空状态的真机视觉复核与按钮点击检查。

final result: blocked
