## Context

Arinova Chat 是 PWA，沒有 native app。推播通知需要透過 Web Push API 實現。

平台支持狀況：
- **Android + Desktop (Chrome/Edge/Firefox)**: 完全支持 Web Push，不需要安裝到桌面
- **iOS Safari (16.4+)**: 支持 Web Push，但 **必須加到 Home Screen**，不支持 rich push 和 silent push
- **舊版 iOS (<16.4)**: 不支持

現有基礎：
- Fastify 後端，已有 WebSocket 即時通訊
- Next.js 前端（PWA ready）
- Redis 可用於 push queue

## Goals / Non-Goals

**Goals:**
- 所有主流平台用戶都能收到推播通知（Android、Desktop、iOS 16.4+）
- 低延遲 — 事件發生後秒級推播
- 用戶可精細控制通知偏好（per-type 開關、靜音時段）
- 優雅處理 iOS 限制（引導加到 Home Screen）
- 支持 playground 相關通知（輪到你了、遊戲結束等）

**Non-Goals:**
- Rich push notifications（圖片、按鈕）— iOS 不支持，先統一用文字
- Silent push / background sync — iOS 不支持
- Email notifications（Phase 2）
- SMS notifications
- 推播分析 dashboard（Phase 2）

## Decisions

### 1. Web Push API + VAPID

**Decision**: 使用標準 Web Push API + VAPID（Voluntary Application Server Identification），不依賴 Firebase Cloud Messaging。

**Alternatives considered**:
- Firebase Cloud Messaging (FCM)：多一層依賴，Android 端 FCM 是 Web Push 的底層，直接用 Web Push 更統一
- 第三方推播服務（OneSignal、Pusher）：增加外部依賴和成本

**Rationale**: Web Push + VAPID 是 W3C 標準，所有支持 push 的瀏覽器都兼容。`web-push` npm package 處理 VAPID 簽名和 payload 加密，夠用。

### 2. Service Worker 管理

**Decision**: 在 Next.js 中註冊 Service Worker，處理 push event 和 notification click。Service Worker 同時處理 PWA cache 和 push。

**Rationale**: 一個 Service Worker 同時處理 cache + push 是標準做法，避免多個 SW 衝突。

### 3. Push subscription 存儲在 PostgreSQL

**Decision**: Push subscription（endpoint + keys）存在 `push_subscriptions` 表，一個用戶可有多個 subscription（多裝置）。

**Alternatives considered**:
- Redis only：重啟會丟失
- 存在 client local storage only：server 無法主動推播

**Rationale**: 需要 server-side 持久存儲才能在事件發生時查找用戶的 subscriptions 發送推播。

### 4. 事件驅動觸發：嵌入現有 event flow

**Decision**: 在現有的 WebSocket message handler、playground event handler 等地方，加入推播觸發邏輯。只在用戶 **不在線**（無 active WebSocket connection）時才推播。

**Alternatives considered**:
- 獨立 notification service + message queue：太重，Phase 1 不需要
- 所有事件都推播：用戶在線時推播是多餘的

**Rationale**: 在線用戶已經透過 WebSocket 收到即時更新，推播只需要補位離線用戶。簡單判斷 WebSocket connection 存在性即可。

### 5. iOS 引導流程

**Decision**: 偵測 iOS Safari 用戶，在首次進入時顯示引導 banner「加到主畫面以接收通知」，附帶步驟說明。

**Rationale**: iOS 的限制是 Apple 強制的，我們能做的就是友善引導。

## Risks / Trade-offs

- **[iOS 市占高但限制多]** → Mitigation: 友善引導加到 Home Screen。in-app notification center 作為 fallback（下次開 app 時看到未讀通知）。
- **[Push subscription 過期/失效]** → Mitigation: 發送失敗時自動清除失效 subscription。定期清理。
- **[推播濫用/轟炸]** → Mitigation: 頻率控制（同類型通知 X 秒內不重複）、靜音時段、用戶可隨時關閉。
- **[VAPID key 洩漏]** → Mitigation: VAPID keys 存在環境變數，不 commit 到 repo。

## Open Questions

- 通知是否需要顯示在 in-app notification center（未讀紅點 + 通知列表）？
- Playground 通知的頻率控制策略？（例如每回合都推播 vs 只推播第一次）
- 是否需要 notification grouping（多條合併為一條摘要）？
