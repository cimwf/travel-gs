# 转化率统计口径

## 事件来源

数据写入集合：`user_stats`

核心事件：

- `tripListVisit`：用户请求行程列表时记录。按天去重 `openid`，用于表示“访问行程的人数”。
- `loginSuccess`：用户登录成功时记录。按天去重 `openid`，用于表示“登录成功的人数”。

## 计算方式

后台 dashboard 使用 openId 集合计算：

- 今日访问人数 = `tripListVisit.openids.size`
- 今日登录人数 = `loginSuccess.openids.size`
- 访问后登录人数 = `tripListVisit.openids ∩ loginSuccess.openids`
- 未登录访问人数 = `tripListVisit.openids - loginSuccess.openids`
- 访问登录转化率 = `访问后登录人数 / 今日访问人数`

## 注意事项

- 小程序云函数会从微信上下文拿 `openid`，比前端传参更可信。
- 前端行程列表请求也会带 `openid`，方便排查接口日志和以后扩展。
- `user_stats` 集合需要存在，并允许云函数写入、后台读取。
- 旧的 `loginPageVisit`、`registerPageVisit`、`registerSuccess`、`activeUser`、`newUser` 事件不再写入，也不再参与后台统计。
