## Why

Arinova Chat 目前沒有推播通知功能。用戶不在線時收到 agent 回覆、被邀請加入 playground、或 playground 輪到自己行動時，完全不會被通知。作為即時互動平台，推播通知是留住用戶的基本功能。目前平台只有 PWA，沒有 native app，需要基於 Web Push API 實作。

## What Changes

- 實作 **Web Push API + Service Worker** 推播基礎設施，支持 Chrome、Firefox、Edge、Safari（iOS 需加到 Home Screen）。
- 定義 **通知類型** — 新訊息、agent 回覆、playground 邀請、playground 輪到你行動、playground 結果、系統公告。
- 後端實作 **推播發送服務** — 使用 VAPID keys，管理 push subscriptions，按事件觸發推播。
- 前端實作 **通知權限請求流程** — 引導用戶授權，iOS 用戶引導加到 Home Screen。
- 用戶 **通知偏好設定** — 可選擇開關各類通知、靜音時段。

## Capabilities

### New Capabilities

- `push-infrastructure`: Web Push 基礎設施 — Service Worker 註冊、VAPID key 管理、push subscription 存儲與更新。
- `notification-triggers`: 通知觸發邏輯 — 定義哪些事件觸發推播（新訊息、playground 事件等），包含去重和頻率控制。
- `notification-preferences`: 用戶通知偏好 — per-type 開關、靜音時段、全局開關。
- `notification-ui`: 通知相關 UI — 權限請求流程、iOS Home Screen 引導、通知設定頁面、in-app 通知中心。

### Modified Capabilities

_(none)_

## Impact

- **Database**: 新增 `push_subscriptions` 表（userId, endpoint, keys, deviceInfo）、`notification_preferences` 表
- **Backend**: 新增推播發送服務（web-push library）、notification routes、event-driven 觸發邏輯
- **Frontend**: Service Worker 設定、通知權限流程、設定頁面擴充、in-app 通知列表
- **Shared types**: 新增 PushSubscription、NotificationPreference、NotificationType 等型別
- **Dependencies**: `web-push` npm package (VAPID)
