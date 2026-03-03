# PRD: Conversation Notebook

## Overview
每個對話（私聊/群組）擁有自己的筆記本（Note List），人類用戶和 Agent 都能讀寫，作為對話的共享記憶與工作區。用戶不再需要猜測 Agent 的 memory 內容，可透過筆記本直接查看工作清單、備忘等資訊。

## Core Concepts

### Note
- 歸屬：Per-conversation（每個對話各自獨立的 note list）
- 結構：標題（title） + 內容（content, Markdown）
- 排序：時間排序（created_at DESC，最新在前）

### Ownership & Permissions

| 角色 | 讀取 | 建立 | 編輯 | 刪除 |
|------|------|------|------|------|
| 對話內所有成員 | ✅ | ✅ | ❌ | ❌ |
| Note creator（本人） | ✅ | ✅ | ✅ | ✅ |
| Creator 的 Agents（若權限開啟） | ✅ | ✅ | ✅ | ✅ |
| Moderator | ✅ | ✅ | ❌ | ✅ |

- **以 owner 為單位**：User A 建立的 note，A 本人 + A 擁有的 agents 共享編輯權
- **Agent 建立的 note**：Agent X 的 owner + Agent X 可編輯
- **權限開關**：用戶可在對話設定中 toggle「允許我的 Agent 存取筆記本」（預設開啟）

---

## Database Schema

### `conversation_note` Table
```sql
CREATE TABLE conversation_note (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  creator_id    UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  creator_type  TEXT NOT NULL DEFAULT 'user' CHECK (creator_type IN ('user', 'agent')),
  agent_id      UUID REFERENCES agent(id) ON DELETE SET NULL,  -- if created by agent
  title         VARCHAR(200) NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_note_conversation ON conversation_note(conversation_id, created_at DESC);
CREATE INDEX idx_conv_note_creator ON conversation_note(creator_id);
```

### `conversation_member` Table — 新增欄位
```sql
ALTER TABLE conversation_member
  ADD COLUMN agent_notes_enabled BOOLEAN NOT NULL DEFAULT true;
```

---

## API Endpoints (Rust Server)

### REST

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/conversations/:id/notes` | List notes（分頁, 時間排序） | member |
| POST | `/api/conversations/:id/notes` | Create note | member |
| PATCH | `/api/conversations/:id/notes/:noteId` | Update note（title/content） | creator/owner |
| DELETE | `/api/conversations/:id/notes/:noteId` | Delete note | creator/owner/mod |

### Request/Response

**GET /api/conversations/:id/notes**
```json
// Query: ?limit=20&before=<noteId>
{
  "notes": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "creatorId": "uuid",
      "creatorType": "user" | "agent",
      "agentId": "uuid | null",
      "creatorName": "Perry",
      "title": "工作清單",
      "content": "- [ ] Task 1\n- [x] Task 2",
      "createdAt": "2026-03-03T12:00:00Z",
      "updatedAt": "2026-03-03T12:30:00Z"
    }
  ],
  "hasMore": true
}
```

**POST /api/conversations/:id/notes**
```json
// Request
{ "title": "工作清單", "content": "- [ ] Task 1" }
// Response: note object
```

**PATCH /api/conversations/:id/notes/:noteId**
```json
// Request (partial update)
{ "title": "更新標題", "content": "更新內容" }
// Response: note object
```

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `note:created` | server → client | `{ conversationId, note }` |
| `note:updated` | server → client | `{ conversationId, note }` |
| `note:deleted` | server → client | `{ conversationId, noteId }` |

---

## Agent SDK & OpenClaw Plugin

### SDK Methods (conversation context)

```typescript
// List all notes in the current conversation
await sdk.notes.list(conversationId: string): Promise<Note[]>

// Create a new note
await sdk.notes.create(conversationId: string, { title: string, content: string }): Promise<Note>

// Update an existing note (only own notes)
await sdk.notes.update(conversationId: string, noteId: string, { title?: string, content?: string }): Promise<Note>

// Delete a note (only own notes)
await sdk.notes.delete(conversationId: string, noteId: string): Promise<void>
```

### OpenClaw Plugin API Mapping

Plugin 需要新增 4 個 API endpoints 對應 SDK methods：

| Plugin Route | Maps to | Auth |
|-------------|---------|------|
| `GET /notes?conversationId=` | sdk.notes.list | agent token |
| `POST /notes` | sdk.notes.create | agent token |
| `PATCH /notes/:noteId` | sdk.notes.update | agent token + ownership |
| `DELETE /notes/:noteId` | sdk.notes.delete | agent token + ownership |

Agent 請求時帶 `conversationId`，Plugin 驗證：
1. Agent 屬於該 conversation
2. Owner 的 `agent_notes_enabled = true`
3. 編輯/刪除時驗證 ownership（同 owner）

---

## UI (Mobile-First)

### Entry Point
- 聊天頂部 header 新增「筆記本」圖標按鈕（📝 或 notebook icon）
- 位置：在 timestamps / mute / members 按鈕旁邊

### Note List Page
- 從聊天頁面 push 進入（有 back button）
- Header: "Notes" + conversation name
- 右上角 "+" 按鈕 → 新增 note
- List: 卡片式排列，每張卡片顯示：
  - 標題（粗體）
  - 內容預覽（前 2 行，truncate）
  - Creator 名稱 + avatar + badge（user/agent）
  - 時間（相對時間）
- 點擊卡片 → 進入 note detail

### Note Detail Page
- 上方：標題（可編輯，若有權限）
- 下方：Markdown 內容
  - 閱讀模式：rendered markdown
  - 編輯模式：textarea with markdown editing
- 底部工具列：Edit / Delete（若有權限）
- 無權限時：只顯示 rendered markdown，無編輯按鈕

### Desktop
- 筆記本按鈕同樣在 chat header
- 點擊後以 side panel 形式打開（類似 thread panel），不離開聊天頁面

### Permission Toggle
- 對話設定中（⚙️ 或 More options）新增：
  - 「允許 Agent 存取筆記本」toggle（預設 ON）

---

## Implementation Phases

### Phase 1 — Backend + DB
1. DB migration: `conversation_note` table + `agent_notes_enabled` column
2. REST API: CRUD endpoints with permission checks
3. WS events: note:created / note:updated / note:deleted

### Phase 2 — Frontend (Mobile-First)
1. Note list page (read-only first)
2. Create / Edit / Delete UI
3. Markdown rendering (read) + editing (write)
4. WS real-time updates
5. Permission toggle in conversation settings

### Phase 3 — Agent SDK + Plugin
1. OpenClaw plugin: 4 new API routes
2. Agent SDK: notes.list / create / update / delete
3. Permission check (agent_notes_enabled)

### Phase 4 — Desktop
1. Side panel UI (reuse mobile components)

---

## Out of Scope (for now)
- Pin notes
- Search within notes
- Note history / versioning
- Collaborative real-time editing (同時編輯同一則 note)
- Image/file attachments in notes
- Note templates
