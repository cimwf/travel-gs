# 虚拟支付上线准备清单

本文档记录 AI 生图次数包接入微信小程序虚拟支付时，沙箱测试、正式上线和回滚排查需要确认的配置。

## 代码范围

- 小程序项目：`travel-gs`
- 后台管理项目：`travel-be-gs`
- 支付云函数：`travel-gs/cloudfunctions/api`
- 套餐数据库：`ai_image_packages`
- 订单数据库：`ai_image_orders`

## 必填环境变量

`api` 云函数必须配置以下环境变量：

```text
WXVPAY_APPID=小程序 AppID
WXVPAY_OFFER_ID=微信虚拟支付 OfferID
WX_APP_SECRET=小程序 AppSecret
WXPAY_ENV=sandbox 或 live
WXPAY_SANDBOX_KEY=虚拟支付沙箱 AppKey
WXPAY_LIVE_KEY=虚拟支付现网 AppKey
```

说明：

- `WXVPAY_APPID` 用于 `jscode2session` 和 `access_token`。
- `WXVPAY_OFFER_ID` 会写入 `wx.requestVirtualPayment` 的 `signData.offerId`。
- `WX_APP_SECRET` 用于获取 `session_key` 和 `access_token`，只允许放在云函数环境变量。
- `WXPAY_ENV=live` 时创建正式订单，传 `env=0`，并使用 `WXPAY_LIVE_KEY` 签名。
- `WXPAY_ENV` 不填或不是 `live` 时创建沙箱订单，传 `env=1`，并使用 `WXPAY_SANDBOX_KEY` 签名。
- `WXPAY_SANDBOX_KEY` 上线后也建议保留，方便处理环境切换前创建的沙箱订单。

## 沙箱测试配置

```text
WXVPAY_APPID=小程序 AppID
WXVPAY_OFFER_ID=微信虚拟支付 OfferID
WX_APP_SECRET=小程序 AppSecret
WXPAY_ENV=sandbox
WXPAY_SANDBOX_KEY=虚拟支付沙箱 AppKey
WXPAY_LIVE_KEY=可先不填，准备上线时再填
```

测试重点：

- 重新部署或重启 `api` 云函数，确认环境变量生效。
- 用最低价套餐测试，当前沙箱已验证可能发生真实扣款，不要用大额套餐测试。
- 完成一次完整链路：拉起支付、支付成功、服务端查询订单、入账额度、通知微信发货。
- 测试结束后在微信虚拟支付后台确认订单环境是沙箱。

## 正式上线配置

```text
WXVPAY_APPID=小程序 AppID
WXVPAY_OFFER_ID=微信虚拟支付 OfferID
WX_APP_SECRET=小程序 AppSecret
WXPAY_ENV=live
WXPAY_LIVE_KEY=虚拟支付现网 AppKey
WXPAY_SANDBOX_KEY=虚拟支付沙箱 AppKey
```

上线步骤：

1. 微信虚拟支付后台发布正式道具。
2. 后台管理 `AI 套餐管理` 中给每个启用套餐配置 `微信虚拟支付道具 ID`。
3. 确认套餐价格、图片数量、道具 ID 与微信后台一致。
4. 云函数环境变量改为 `WXPAY_ENV=live`，并填入 `WXPAY_LIVE_KEY`。
5. 重新部署或重启 `api` 云函数。
6. 使用最低价套餐做一次正式真单测试。
7. 确认用户额度到账，订单状态变为 `paid`，微信侧订单完成发货闭环。

## 套餐配置要求

每个启用的套餐都必须有 `productId`：

```js
{
  packageId: "standard-20",
  productId: "image_credits_20",
  title: "AI 生图 20 张",
  price: 9.9,
  discount: 10,
  imageCount: 20,
  enabled: true
}
```

要求：

- `productId` 必须与微信小程序虚拟支付后台的道具 ID 完全一致。
- `productId` 不允许为空，代码不会 fallback 默认道具 ID。
- `goodsPrice` 由套餐折后价计算，单位为分，例如 `9.9` 元会变成 `990`。
- 微信后台道具价格必须与套餐折后价一致，否则确认支付时会因为金额不匹配拒绝入账。
- 后台项目 `travel-be-gs` 的 `AI 套餐管理` 已支持编辑 `微信虚拟支付道具 ID`。

## WXPAY_ENV 切换规则

```text
sandbox 或不填 -> 沙箱环境 env=1
live          -> 正式环境 env=0
```

注意：

- 切换 `WXPAY_ENV` 后必须重新部署或重启 `api` 云函数。
- 正式版不要继续使用 `WXPAY_ENV=sandbox`。
- 已创建订单会保存自己的 `payEnv`，确认支付时会按订单创建时的环境选择 AppKey。

## 支付校验规则

服务端确认支付时会校验：

- 微信订单必须存在。
- 微信订单状态必须是 `2/3/4`，状态 `1` 未支付不能入账。
- 微信订单金额 `order_fee` 必须等于本地订单 `goodsPrice`。
- 当前允许普通虚拟支付订单 `order_type=0` 和 iOS IAP 订单 `order_type=7`。
- 微信订单环境 `env_type` 必须与本地订单 `payEnv` 匹配。

## iOS 注意事项

### Android 普通虚拟支付（order_type=0）

- Android 普通虚拟支付订单通常返回 `order_type=0`。
- 微信后台订单列表中可正常查询，账单走微信虚拟支付结算。
- 后台订单管理页按 `payType` 标注"虚拟支付现网"或"虚拟支付沙箱"。

### iOS IAP（order_type=7）说明

- 开启苹果 IAP 后，iOS 用户支付会走 Apple 内购渠道，微信侧 `order_type=7`，账单结算走 Apple，不进微信支付账单。
- 当前 `confirmPayment` 已允许 `order_type=7`，支付确认成功后会把 `orderType` 写入本地订单。
- iOS IAP 有独立的审核要求（必须提交 App Store 审核），价格必须与 Apple 定价档位一致，与微信虚拟支付道具价格可能不同。
- 后台订单管理页已支持展示 `order_type=7`，标注"iOS IAP / 结算走 Apple"，方便查账区分。
- **开启 iOS IAP 前请先做端到端测试，不要直接在生产环境放开 `order_type=7`。**

### 当前代码状态

`confirmPayment` 已允许 `order_type` 为 `0`（Android 普通虚拟支付）和 `7`（iOS IAP）：

```js
// cloudfunctions/api/handlers/aiImage.js — aiImageConfirmPayment（当前）
if (![0, 7].includes(wxOrder.order_type)) {
  return { success: false, error: `订单类型异常: ${wxOrder.order_type}` };
}
```

开启 iOS IAP 不需要再修改此处逻辑，但仍需要：Apple 内购商品配置、App Store 审核通过、价格档位与微信道具价格对齐，以及端到端测试。

## 安全注意事项

- `WX_APP_SECRET`、`WXPAY_LIVE_KEY`、`WXPAY_SANDBOX_KEY` 只允许放在云函数环境变量。
- 前端代码、文档截图、日志里不要暴露 AppKey、AppSecret、sessionKey、paySig、signature。
- 联调时如果临时打印签名原始字符串，问题定位后必须删除。
- 若 AppKey 或 AppSecret 曾经出现在截图、聊天记录或日志中，应在微信后台重置。

## 上线前最终检查

- `WXVPAY_APPID` 已配置。
- `WXVPAY_OFFER_ID` 已配置。
- `WX_APP_SECRET` 已配置。
- `WXPAY_ENV=live` 已配置。
- `WXPAY_LIVE_KEY` 已配置。
- `WXPAY_SANDBOX_KEY` 已保留。
- 每个启用套餐都有 `productId`。
- 每个启用套餐的价格与微信后台道具价格一致。
- 最低价正式真单已完成。
- 支付成功后额度到账。
- 微信侧订单已收到发货通知。
- 日志没有长期输出敏感签名信息。

## 常见问题

### 支付提示签名错误

优先检查：

- `WXPAY_ENV` 与 AppKey 是否匹配。
- `WXVPAY_OFFER_ID` 是否正确。
- `productId` 是否与微信后台一致。
- `goodsPrice` 是否与微信后台道具价格一致。
- 是否重新部署或重启过云函数。

### 提示套餐道具 ID 未配置

说明该套餐缺少 `ai_image_packages.productId`。到后台 `AI 套餐管理` 编辑套餐，填写微信虚拟支付后台的道具 ID 后再测试。

### 支付成功但额度没有到账

优先检查云函数日志：

- `/xpay/query_order` 是否返回成功。
- `order_fee` 是否和本地 `goodsPrice` 一致。
- `order_type` 是否为 `0`。
- `env_type` 是否与订单 `payEnv` 匹配。
- 本地订单是否仍是 `pending_payment` 状态。
