# Chat 對話框功能清單（Feature Inventory）

> 目的：降低開發時「改東壞西」的風險。修改任何 chat 相關檔案前，先查此文件確認影響範圍。
>
> 最後更新：2026-03-03

---

## 目錄

1. [元件總覽](#1-元件總覽)
2. [元件依賴關係圖](#2-元件依賴關係圖)
3. [Store State 欄位](#3-store-state-欄位)
4. [Store Actions](#4-store-actions)
5. [WebSocket 事件（雙向）](#5-websocket-事件雙向)
6. [REST API Endpoints](#6-rest-api-endpoints)
7. [串流生命週期](#7-串流生命週期)
8. [同步與重連協議](#8-同步與重連協議)
9. [Thread（討論串）流程](#9-thread討論串流程)
10. [元件 → State 映射表](#10-元件--state-映射表)
11. [高風險修改區域](#11-高風險修改區域)

---

## 1. 元件總覽

### 主要佈局

| 元件 | 檔案 | 功能 |
|------|------|------|
| **ChatLayout** | `chat-layout.tsx` | 最外層容器：icon rail（桌面）、sidebar、chat area、mobile bottom nav。初始化 WS、載入 agents/conversations |
| **Sidebar** | `sidebar.tsx` | 左側面板：搜尋輸入框 + ConversationList |
| **ChatArea** | `chat-area.tsx` | 右側主區域：header + message list + input + thread panel + pinned bar |
| **IconRail** | `icon-rail.tsx` | 桌面左側 icon 導航列 |
| **MobileBottomNav** | `mobile-bottom-nav.tsx` | 手機底部導航（Chat / Office / Logo / Friends / Settings） |

### 對話列表

| 元件 | 檔案 | 功能 |
|------|------|------|
| **ConversationList** | `conversation-list.tsx` | 排序（pinned 優先 → updatedAt）、渲染 ConversationItem |
| **ConversationItem** | `conversation-item.tsx` | 單筆對話：頭像、名稱、預覽、時間、三點選單（rename/pin/delete）、online 狀態、thinking 指示器 |
| **NewChatDialog** | `new-chat-dialog.tsx` | 新建對話：選 agent / 建群組 / 找好友 DM |

### 訊息區域

| 元件 | 檔案 | 功能 |
|------|------|------|
| **ChatHeader** | `chat-header.tsx` | 對話標題、頭像、時鐘 toggle、靜音、語音通話、成員列表 |
| **MessageList** | `message-list.tsx` | IntersectionObserver 無限捲動（上/下）、搜尋高亮跳轉、去重 |
| **MessageBubble** | `message-bubble.tsx` | 訊息氣泡：Markdown 內容、附件、reactions、action menu、streaming 狀態 |
| **MarkdownContent** | `markdown-content.tsx` | React Markdown 渲染：語法高亮、程式碼複製、圖片 lightbox、GFM 表格 |
| **TypingIndicator** | `typing-indicator.tsx` | Thinking agents（含取消按鈕）+ 使用者打字中 |
| **EmptyState** | `empty-state.tsx` | 空對話佔位畫面 |

### 訊息互動

| 元件 | 檔案 | 功能 |
|------|------|------|
| **ChatInput** | `chat-input.tsx` | 文字輸入、檔案/圖片/語音上傳、@mention、platform commands、agent skills、reply 引用 |
| **MentionPopup** | `mention-popup.tsx` | @mention 下拉選單（鍵盤導航） |
| **MessageActionSheet** | `message-action-sheet.tsx` | 長按/右鍵動作面板：emoji 快捷、複製、回覆、置頂、刪除、重試 |
| **ReactionPicker** | `reaction-picker.tsx` | Emoji 選擇器 popover（6 個預設） |
| **ReactionBadges** | `reaction-picker.tsx` | 訊息下方 emoji 計數 badge |
| **SearchResults** | `search-results.tsx` | 搜尋結果列表：高亮片段、對話/agent/使用者標籤 |

### 置頂訊息

| 元件 | 檔案 | 功能 |
|------|------|------|
| **PinnedMessagesBar** | `pinned-messages-bar.tsx` | 置頂訊息列：摺疊/展開、carousel 導航、跳轉至原訊息、取消置頂 |

### 群組管理

| 元件 | 檔案 | 功能 |
|------|------|------|
| **GroupMembersPanel** | `group-members-panel.tsx` | 成員管理面板：Tab 切換（成員/設定）、角色管理（admin/vice-admin）、踢人、agent listen mode |
| **AddMemberSheet** | `add-member-sheet.tsx` | 新增群組成員：搜尋好友/agent、防重複 |
| **UserProfileSheet** | `user-profile-sheet.tsx` | 使用者個人資訊頁：頭像、名稱、角色、加入日期 |
| **AgentProfileSheet** | `agent-profile-sheet.tsx` | Agent 個人資訊頁：描述、擁有者、listen mode 切換、manage 按鈕（owner only） |
| **BotManageDialog** | `bot-manage-dialog.tsx` | Agent 管理對話框：名稱/頭像/描述/系統提示/歡迎訊息/快捷回覆/公開切換 |

### 討論串

| 元件 | 檔案 | 功能 |
|------|------|------|
| **ThreadPanel** | `thread-panel.tsx` | 右側滑出面板：thread header + 訊息列表 + 輸入框、自動捲動 |

### 媒體 & 附件

| 元件 | 檔案 | 功能 |
|------|------|------|
| **AudioPlayer** | `audio-player.tsx` | 語音播放器：播放/暫停、進度條、時間顯示 |
| **VoiceRecorder** | `voice-recorder.tsx` | 錄音 UI：計時、波形、停止/取消 |
| **ImageLightbox** | `image-lightbox.tsx` | 圖片全螢幕 modal（ESC 關閉） |
| **LinkPreviewCard** | `link-preview-card.tsx` | 連結預覽卡片：favicon、圖片、標題、描述（最多 3 個 URL） |
| **CodeExecutor** | `code-executor.tsx` | 程式碼執行按鈕（iframe sandbox） |

### 連線狀態

| 元件 | 檔案 | 功能 |
|------|------|------|
| **ConnectionBanner** | `connection-banner.tsx` | 連線狀態 banner（reconnecting / syncing） |

### 語音通話

| 元件 | 檔案 | 功能 |
|------|------|------|
| **ActiveCall** | `active-call.tsx`（voice/） | 全螢幕語音通話：即時轉錄、音量控制、靜音、掛斷 |
| **CallIndicator** | `call-indicator.tsx`（voice/） | 通話中固定指示器（右下角） |

### 錯誤處理

| 元件 | 檔案 | 功能 |
|------|------|------|
| **ErrorBoundary** | `error-boundary.tsx` | React Error Boundary 包裝器 |

---

## 2. 元件依賴關係圖

```
ChatLayout
├── IconRail (desktop)
├── MobileBottomNav (mobile)
├── Sidebar
│   ├── Search Input
│   └── ConversationList
│       └── ConversationItem (×N)
├── ChatArea
│   ├── ChatHeader
│   ├── ConnectionBanner
│   ├── PinnedMessagesBar
│   ├── SearchResults (when search active)
│   ├── MessageList
│   │   ├── MessageBubble (×N)
│   │   │   ├── MarkdownContent
│   │   │   │   ├── ImageLightbox
│   │   │   │   └── CodeExecutor
│   │   │   ├── AudioPlayer
│   │   │   ├── LinkPreviewCard
│   │   │   ├── ReactionBadges
│   │   │   └── MessageActionSheet / ReactionPicker
│   │   └── TypingIndicator
│   ├── ChatInput
│   │   ├── MentionPopup
│   │   └── VoiceRecorder
│   ├── ThreadPanel
│   │   ├── MessageBubble (×N, reuse)
│   │   └── ChatInput (inline)
│   ├── GroupMembersPanel
│   │   └── AddMemberSheet
│   ├── BotManageDialog
│   ├── UserProfileSheet
│   └── AgentProfileSheet
├── NewChatDialog
├── ActiveCall (overlay)
└── CallIndicator (floating)
```

---

## 3. Store State 欄位

**檔案：** `apps/web/src/store/chat-store.ts`

### 核心資料

| 欄位 | 型別 | 說明 | 影響元件 |
|------|------|------|----------|
| `agents` | `Agent[]` | 所有可用 agent | ConversationList, ChatHeader, NewChatDialog, BotManageDialog |
| `conversations` | `ConversationWithAgent[]` | 使用者的對話列表 | ConversationList, Sidebar |
| `messagesByConversation` | `Record<string, Message[]>` | 按對話 ID 分組的訊息 | MessageList, MessageBubble |
| `activeConversationId` | `string \| null` | 目前開啟的對話 | 幾乎所有元件 |
| `currentUserId` | `string \| null` | 目前登入使用者 | MessageBubble（判斷左/右） |

### 串流 & 即時

| 欄位 | 型別 | 說明 | 影響元件 |
|------|------|------|----------|
| `thinkingAgents` | `Record<string, ThinkingAgent[]>` | 目前串流/排隊中的 agent | ConversationItem, TypingIndicator |
| `typingUsers` | `Record<string, {...}[]>` | 正在打字的使用者（5s 過期） | TypingIndicator |
| `queuedMessageIds` | `Record<string, Set<string>>` | 等待 agent 處理的訊息 | MessageBubble（queued 標記） |

### 搜尋

| 欄位 | 型別 | 說明 | 影響元件 |
|------|------|------|----------|
| `searchQuery` | `string` | 搜尋文字 | Sidebar, SearchResults |
| `searchResults` | `SearchResult[]` | 搜尋結果 | SearchResults |
| `searchTotal` | `number` | 結果總數 | SearchResults |
| `searchLoading` | `boolean` | 搜尋中 | SearchResults |
| `searchActive` | `boolean` | 是否在搜尋模式 | ChatArea（切換顯示） |
| `highlightMessageId` | `string \| null` | 跳轉高亮的訊息 | MessageList |

### 群組

| 欄位 | 型別 | 說明 | 影響元件 |
|------|------|------|----------|
| `conversationMembers` | `Record<string, {...}[]>` | @mention 支援資料 | ChatInput |
| `groupMembersData` | `Record<string, GroupMembers>` | 群組完整成員資料 | GroupMembersPanel, AddMemberSheet |

### 互動

| 欄位 | 型別 | 說明 | 影響元件 |
|------|------|------|----------|
| `reactionsByMessage` | `Record<string, Record<string, ReactionInfo>>` | 每則訊息的 emoji reactions | ReactionBadges |
| `replyingTo` | `Message \| null` | 正在回覆的訊息 | ChatInput |
| `inputDrafts` | `Record<string, string>` | 每個對話的草稿 | ChatInput |

### UI 偏好（localStorage 持久化）

| 欄位 | 型別 | 說明 | 影響元件 |
|------|------|------|----------|
| `showTimestamps` | `boolean` | 是否顯示時間戳 | ChatHeader, MessageBubble |
| `mutedConversations` | `Record<string, boolean>` | 靜音對話列表 | ChatHeader, new_message handler |
| `ttsEnabled` | `boolean` | TTS 開關 | ChatLayout |
| `sidebarOpen` | `boolean` | 手機 sidebar 顯示 | Sidebar |

### 其他

| 欄位 | 型別 | 說明 | 影響元件 |
|------|------|------|----------|
| `unreadCounts` | `Record<string, number>` | 未讀數（⚠️ UI badge 已移除，資料保留） | — |
| `agentHealth` | `Record<string, {status, latencyMs}>` | Agent 在線/離線狀態 | ConversationItem, NewChatDialog |
| `agentSkills` | `Record<string, AgentSkill[]>` | Agent 技能（lazy load） | ChatInput, MessageBubble |
| `blockedUserIds` | `Set<string>` | 封鎖使用者清單 | MessageBubble |
| `jumpPagination` | `{hasMoreUp, hasMoreDown} \| null` | 跳轉後的分頁狀態 | MessageList |
| `activeThreadId` | `string \| null` | 目前開啟的 thread | ThreadPanel |
| `threadMessages` | `Record<string, Message[]>` | Thread 回覆訊息 | ThreadPanel |
| `loading` / `loadingMessages` / `threadLoading` | `boolean` | 載入狀態 | 各列表元件 |

---

## 4. Store Actions

### 初始化
| Action | 說明 | 副作用 |
|--------|------|--------|
| `initWS()` | 建立 WS 連線、註冊 handler | 回傳 cleanup function |
| `setCurrentUserId(id)` | 設定登入使用者 | — |
| `setActiveConversation(id)` | 切換對話 | 清空搜尋、載入訊息 + 成員、mark_read |

### 對話 CRUD
| Action | API | WS |
|--------|-----|-----|
| `loadConversations(query?)` | GET `/api/conversations` | — |
| `createConversation(agentId, title?)` | POST `/api/conversations` | — |
| `createDirectConversation(userId)` | POST `/api/conversations` | — |
| `createGroupConversation(agentIds, title, userIds?)` | POST `/api/conversations/group` | — |
| `deleteConversation(id)` | DELETE `/api/conversations/{id}` | — |
| `updateConversation(id, data)` | PUT `/api/conversations/{id}` | — |
| `clearConversation(id)` | DELETE `/api/conversations/{id}/messages` | — |

### 訊息
| Action | API | WS | 特殊行為 |
|--------|-----|-----|----------|
| `loadMessages(convId)` | GET `.../messages` | `mark_read` | 替換整個 messagesByConversation[id] |
| `sendMessage(content, mentions?)` | — | `send_message` | Optimistic insert（client UUID） |
| `deleteMessage(convId, msgId)` | DELETE `.../messages/{id}` | — | Optimistic remove |
| `cancelStream(msgId?)` | — | `cancel_stream` | — |
| `cancelAgentStream(convId, msgId)` | — | `cancel_stream` / `cancel_queued` | — |
| `jumpToMessage(convId, msgId)` | GET `.../messages?around={id}` | — | 設定 jumpPagination + highlightMessageId |

### 搜尋
| Action | API |
|--------|-----|
| `searchMessages(query)` | GET `/api/messages/search?q=...&limit=30` |
| `searchMore()` | GET `/api/messages/search?q=...&limit=30&offset=...` |
| `clearSearch()` | — |

### 群組管理
| Action | API |
|--------|-----|
| `loadGroupMembersV2(convId)` | GET `.../members` |
| `addGroupMember(convId, agentId)` | POST `.../members` |
| `addGroupUser(convId, userId)` | POST `/api/groups/{id}/add-user` |
| `removeGroupMember(convId, agentId)` | DELETE `.../members/{id}` |
| `kickUser(convId, userId)` | POST `/api/groups/{id}/kick/{userId}` |
| `promoteUser / demoteUser / transferAdmin` | POST `/api/groups/{id}/...` |
| `leaveGroup(convId)` | POST `/api/groups/{id}/leave` |
| `updateGroupSettings(convId, settings)` | PATCH `/api/groups/{id}/settings` |
| `generateInviteLink(convId)` | POST `/api/groups/{id}/invite-link` |
| `joinViaInvite(token)` | POST `/api/groups/join/{token}` |
| `updateAgentListenMode(convId, agentId, mode)` | PATCH `.../agents/{id}/listen-mode` |
| `setAgentAllowedUsers(convId, agentId, userIds)` | PUT `.../agents/{id}/allowed-users` |

### Reactions
| Action | API | 特殊行為 |
|--------|-----|----------|
| `toggleReaction(msgId, emoji)` | POST/DELETE `.../reactions` | Optimistic toggle + revert on error |
| `loadReactions(msgId)` | GET `.../reactions` | — |

### Thread
| Action | API / WS |
|--------|----------|
| `openThread(threadId)` | — |
| `closeThread()` | — |
| `loadThreadMessages(convId, threadId)` | GET `.../threads/{id}/messages` |
| `sendThreadMessage(content)` | WS `send_message`（含 threadId） |

### Agent
| Action | API |
|--------|-----|
| `loadAgents()` | GET `/api/agents` |
| `createAgent(data)` | POST `/api/agents` |
| `updateAgent(id, data)` | PUT `/api/agents/{id}` |
| `deleteAgent(id)` | DELETE `/api/agents/{id}` |
| `loadAgentSkills(agentId)` | GET `/api/agents/{id}/skills` |
| `loadAgentHealth()` | GET `/api/agents/health` |

### 使用者封鎖
| Action | API |
|--------|-----|
| `loadBlockedUsers()` | GET `/api/users/blocked` |
| `blockUser(userId)` | POST `/api/users/{id}/block` |
| `unblockUser(userId)` | DELETE `/api/users/{id}/block` |

---

## 5. WebSocket 事件（雙向）

### Client → Server

| Event | Payload | 觸發時機 |
|-------|---------|----------|
| `send_message` | `{conversationId, content, id?, replyToId?, threadId?, mentions?}` | 使用者送訊息 |
| `cancel_stream` | `{conversationId, messageId}` | 取消串流 |
| `cancel_queued` | `{conversationId, messageId}` | 取消排隊 |
| `mark_read` | `{conversationId, seq}` | 載入/收到訊息後 |
| `sync` | `{conversations: {convId: lastSeq}}` | 重連時 |
| `focus` | `{visible: boolean}` | 頁面可見性變化 |
| `typing` | `{conversationId}` | 使用者輸入中 |
| `ping` | `{}` | 每 30 秒心跳 |

### Server → Client

| Event | 處理位置（chat-store.ts） | 影響 State | 注意事項 |
|-------|--------------------------|------------|----------|
| `new_message` | L1145-1296 | messages, conversations, unreadCounts | ⚠️ 去重邏輯（ID 或 content+role match） |
| `stream_queued` | L1322-1357 | thinkingAgents, queuedMessageIds | — |
| `queued_cancelled` | L1359-1382 | thinkingAgents, queuedMessageIds | — |
| `stream_start` | L1384-1446 | messages（placeholder）, thinkingAgents | ⚠️ 建立 streaming 佔位訊息 |
| `stream_chunk` | L1448-1532 | messages（append content） | ⚠️ 第一個 chunk 可能建立 bubble |
| `stream_end` | L1534-1790 | messages（finalize）, thinkingAgents | ⚠️ shouldReplaceContent 邏輯 |
| `stream_error` | L1792-1882 | messages（error status）, thinkingAgents | — |
| `user_typing` | L1298-1320 | typingUsers | 5 秒過期 |
| `reaction_added` | L1884-1896 | reactionsByMessage | +1 count |
| `reaction_removed` | L1898-1913 | reactionsByMessage | -1 / remove |
| `kicked_from_group` | L1915-1930 | conversations, messages, thinkingAgents | 清除該對話所有資料 |
| `sync_response` | L1932-2079 | messages, unreadCounts, thinkingAgents | ⚠️ HTTP fallback for active conv |
| `pong` | L1133 | — | 心跳確認 |

---

## 6. REST API Endpoints

完整清單見 [Section 4 Store Actions](#4-store-actions) 的 API 欄位。

關鍵 Base URL：

| 環境 | URL |
|------|-----|
| Production | `https://api.chat.arinova.ai` |
| Staging | `https://api.chat-staging.arinova.ai` |
| Local | `http://localhost:21001` |

---

## 7. 串流生命週期

```
使用者送訊息
    │
    ▼
[send_message] ──WS──▶ Server
    │
    │ (optimistic insert: client UUID, status: "sent")
    │
    ▼
Server → Agent
    │
    ├─ [stream_queued] ──▶ thinkingAgents += {agentId, queued: true}
    │                       queuedMessageIds += messageId
    │
    ├─ [stream_start]  ──▶ thinkingAgents: queued → thinking
    │                       建立 placeholder message (status: "streaming")
    │
    ├─ [stream_chunk] ×N ──▶ append content to message
    │                         （第一個 chunk 如果沒有 placeholder，會建立一個）
    │
    └─ [stream_end]     ──▶ message status → "completed"
       or                    thinkingAgents -= agentId
       [stream_error]   ──▶ message status → "error"
                             thinkingAgents -= agentId
```

### ⚠️ stream_end 的 shouldReplaceContent 邏輯

```typescript
// 當 server 送來的 finalContent 與前端累積的 content 不同時替換
const shouldReplaceContent = !!finalContent && finalContent !== completedMsg.content;
```

**風險**：如果 plugin 的 `sendComplete` 送出的文字與前端累積的 chunk 不一致，會導致文字被替換（歷史 bug：streaming 文字消失，已修 439386c）。

---

## 8. 同步與重連協議

### 連線流程

```
WebSocket open
    │
    ├─ send: {type: "focus", visible: true/false}
    ├─ send: {type: "sync", conversations: {convId: lastSeq, ...}}
    └─ startPing (30s interval)
         │
         ▼
    receive: sync_response
         │
         ├─ merge missedMessages into messagesByConversation
         ├─ clear stale thinkingAgents
         ├─ update unreadCounts & muted state
         └─ HTTP fallback: 若 active conversation 有 gap → fetch newer messages
```

### 重連策略

| 參數 | 值 |
|------|-----|
| 初始延遲 | 1 秒 |
| 最大延遲 | 30 秒 |
| 策略 | Exponential backoff（delay × 2） |
| 重置 | 連線成功後回 1 秒 |

### 觸發重連的事件

| 事件 | 行為 |
|------|------|
| `visibilitychange`（頁面重新可見） | send focus + reconnect |
| `pageshow`（bfcache） | reconnect |
| `online`（網路恢復） | reconnect |
| WS `onclose` / `onerror` | 自動 backoff reconnect |

### Seq 追蹤

- `wsManager.lastSeqs[conversationId]` 記錄每個對話最後收到的 seq
- 收到 `stream_start/chunk/end/error`、`new_message`、`sync_response` 時更新
- 重連時用 `lastSeqs` 做 sync，server 回傳 gap 內的訊息

---

## 9. Thread（討論串）流程

```
使用者點 "Reply in Thread"
    │
    ▼
openThread(threadId = parentMessageId)
    │
    ├─ activeThreadId = threadId
    ├─ loadThreadMessages(convId, threadId)
    │     └─ GET /api/conversations/{id}/threads/{id}/messages?limit=50
    │
    ▼
ThreadPanel 顯示
    │
    ├─ 顯示 parent message + 所有 replies
    ├─ ChatInput（inline, 含 threadId）
    │     └─ sendThreadMessage(content) → WS send_message with threadId
    │
    └─ 新訊息到達（new_message with threadId）
          ├─ 加入 threadMessages[threadId]
          └─ 更新 parent message 的 threadSummary（replyCount, lastReplyAt, lastReplyPreview）
```

---

## 10. 元件 → State 映射表

修改某個 state 欄位時，查此表確認哪些元件會受影響。

| State 欄位 | 讀取的元件 |
|------------|-----------|
| `conversations` | ConversationList, NewChatDialog, AgentProfileSheet |
| `messagesByConversation` | MessageList, ThreadPanel, ChatArea |
| `activeConversationId` | ChatArea, ChatHeader, ChatInput, MessageList, PinnedMessagesBar, TypingIndicator, ConnectionBanner, ThreadPanel, CallIndicator |
| `agents` | ConversationList, ChatInput, NewChatDialog, BotManageDialog, AddMemberSheet, AgentProfileSheet |
| `thinkingAgents` | ConversationList, ConversationItem, TypingIndicator, MessageList, ThreadPanel |
| `typingUsers` | TypingIndicator |
| `searchQuery / searchResults / searchActive` | Sidebar, SearchResults, ChatArea |
| `highlightMessageId` | MessageList |
| `reactionsByMessage` | MessageBubble (ReactionBadges) |
| `replyingTo` | ChatInput |
| `groupMembersData` | GroupMembersPanel, AddMemberSheet, UserProfileSheet, AgentProfileSheet |
| `conversationMembers` | ChatInput (MentionPopup) |
| `showTimestamps` | ChatHeader, MessageBubble |
| `mutedConversations` | ChatHeader |
| `agentHealth` | ConversationList, NewChatDialog |
| `agentSkills` | ChatInput, MessageBubble |
| `blockedUserIds` | MessageBubble |
| `inputDrafts` | ChatInput |
| `activeThreadId / threadMessages` | ThreadPanel |
| `jumpPagination` | MessageList |
| `sidebarOpen` | Sidebar |
| `currentUserId` | MessageBubble |

---

## 11. 高風險修改區域

### 🔴 極高風險（碰之前三思）

| 區域 | 為什麼危險 | 影響範圍 |
|------|-----------|----------|
| **stream_end handler**（chat-store L1534-1790） | shouldReplaceContent 邏輯容易造成文字消失 | 所有串流訊息 |
| **stream_chunk handler**（chat-store L1448-1532） | 第一個 chunk 建立 bubble 的邏輯 | 所有串流訊息 |
| **wsManager sync protocol**（ws.ts） | seq 追蹤 + sync_response 處理 | 離線後訊息同步 |
| **loadMessages → 替換 messagesByConversation** | 整個陣列替換，不是 merge | 切換對話時的訊息載入 |
| **Optimistic send + dedup**（new_message handler） | ID 比對 + content+role 比對 | 訊息重複或遺漏 |
| **Plugin inbound.ts（streaming）** | onPartialReply 只有當前 block 的文字 | 串流文字內容正確性 |

### 🟡 中風險

| 區域 | 為什麼 | 影響範圍 |
|------|--------|----------|
| **MessageBubble** | 渲染邏輯複雜，props 多 | 所有訊息顯示 |
| **ChatInput** | 整合 file/voice/mention/commands/skills/reply | 所有訊息發送 |
| **ConversationList sorting** | pinned + updatedAt 排序 | 對話列表順序 |
| **GroupMembersPanel role logic** | admin/vice-admin 權限判斷 | 群組管理功能 |
| **jumpToMessage + jumpPagination** | around query + 上下分頁 | 搜尋跳轉、置頂跳轉 |

### 🟢 低風險（相對安全）

| 區域 | 為什麼 |
|------|--------|
| EmptyState、ErrorBoundary | 純展示，無邏輯 |
| AudioPlayer、ImageLightbox | 獨立元件，無 store 依賴 |
| ReactionPicker UI | 純 UI，邏輯在 store |
| IconRail、MobileBottomNav | 導航 only |
| BotManageDialog | 獨立 CRUD，不影響對話流程 |

---

## 附錄：相關 Store

| Store | 檔案 | 與 Chat 的關係 |
|-------|------|---------------|
| **voice-call-store** | `store/voice-call-store.ts` | 通話結束時送訊息到對話 |
| **toast-store** | `store/toast-store.ts` | 錯誤提示（純 UI） |
| **spaces-store** | `store/spaces-store.ts` | 獨立，不影響 chat |
