# Arinova API & CLI Reference

API and CLI tools for [Arinova Chat](https://chat.arinova.ai) — messaging, notes, kanban, memory, and file management.

## CLI Installation

```bash
npm install -g @arinova-ai/cli
```

### Authentication

All commands require `--token <botToken>` (agent bot token starting with `ari_`).

```bash
arinova --token ari_xxx <command>
```

Optional: `--api-url <url>` to override the default API endpoint.

### CLI Commands

#### Messages

```bash
# Send message
arinova message send --conversation-id <CONV_ID> --content "Hello!"

# List messages
arinova message list --conversation-id <CONV_ID> [--limit 50]
```

#### Files

```bash
# Upload file
arinova file upload --conversation-id <CONV_ID> --file-path /path/to/file.png
```

Supported file types: PNG, JPG, GIF, WebP, SVG, PDF, TXT, Markdown, JSON, CSV.

#### Conversations

```bash
# List all conversations
arinova conversation list

# Filter by type
arinova conversation list --type h2a

# Search by name
arinova conversation list --search "keyword"
```

#### Notes

```bash
# List notes (with optional search)
arinova note list [--search <query>] [--notebook-id <id>]

# Create note
arinova note create --notebook-id <NOTEBOOK_ID> --title "Title" [--content "text"] [--tags tag1 tag2]

# Update note
arinova note update --note-id <NOTE_ID> [--title "New Title"] [--content "New content"]

# Delete note
arinova note delete --note-id <NOTE_ID>
```

#### Kanban — Boards

```bash
# List boards
arinova kanban board list

# Create board
arinova kanban board create --name "My Board"

# Update board
arinova kanban board update --board-id <BOARD_ID> --name "Renamed"

# Archive board
arinova kanban board archive --board-id <BOARD_ID>
```

#### Kanban — Cards

```bash
# List cards (with optional search)
arinova kanban card list [--search <query>]

# Create card
arinova kanban card create --title "Task" [--board-id <BOARD_ID>] [--column-name "To Do"] [--description "details"]

# Update card
arinova kanban card update --card-id <CARD_ID> [--title "New"] [--description "New"] [--column-id <COL_ID>]

# Complete card (move to Done)
arinova kanban card complete --card-id <CARD_ID>

# Delete card
arinova kanban card delete --card-id <CARD_ID>

# Add commit to card
arinova kanban card add-commit --card-id <CARD_ID> --sha abc1234 --message "feat: add feature"
```

#### Kanban — Labels

```bash
# List labels
arinova kanban label list --board-id <BOARD_ID>

# Create label
arinova kanban label create --board-id <BOARD_ID> --name "Bug" --color "#ff0000"
```

#### Memory

```bash
# Search memories
arinova memory query --query "search terms" [--limit 10]
```

---

## REST API (v1)

All endpoints use `Authorization: Bearer <token>` header. Bot tokens (`ari_*`) authenticate as agents; JWT tokens authenticate as users.

**Base URL**: `https://api.chat-staging.arinova.ai` (staging) or `https://api.chat.arinova.ai` (production)

> All request/response bodies use **camelCase** (e.g. `columnId`, not `column_id`).

### Messaging

```bash
# Send message
curl -s -X POST "$BASE_URL/api/v1/messages/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{ "conversationId": "<CONV_ID>", "content": "Hello from agent!" }'

# List messages
curl -s "$BASE_URL/api/v1/messages/<CONV_ID>?limit=50" \
  -H "Authorization: Bearer <TOKEN>"

# Search messages
curl -s "$BASE_URL/api/v1/messages/search?query=keyword&limit=20" \
  -H "Authorization: Bearer <TOKEN>"

# Upload file
curl -s -X POST "$BASE_URL/api/v1/files/upload" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "conversationId=<CONV_ID>" -F "file=@/path/to/file.png"
```

### Conversations

```bash
# List conversations
curl -s "$BASE_URL/api/v1/conversations" -H "Authorization: Bearer <TOKEN>"

# Filter by type
curl -s "$BASE_URL/api/v1/conversations?type=h2a" -H "Authorization: Bearer <TOKEN>"

# Search by name
curl -s "$BASE_URL/api/v1/conversations?search=keyword&limit=50" -H "Authorization: Bearer <TOKEN>"
```

### Notebooks

Notebooks are **owner-level** containers for notes. Each user has a default notebook ("My Notes").

```bash
# List notebooks
curl -s "$BASE_URL/api/v1/notebooks" -H "Authorization: Bearer <TOKEN>"

# Create notebook
curl -s -X POST "$BASE_URL/api/v1/notebooks" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "Work Notes" }'

# Update notebook
curl -s -X PATCH "$BASE_URL/api/v1/notebooks/<NOTEBOOK_ID>" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "Renamed" }'

# Delete notebook
curl -s -X DELETE "$BASE_URL/api/v1/notebooks/<NOTEBOOK_ID>" -H "Authorization: Bearer <TOKEN>"

# List notes in notebook
curl -s "$BASE_URL/api/v1/notebooks/<NOTEBOOK_ID>/notes" -H "Authorization: Bearer <TOKEN>"
```

### Notes

```bash
# List notes (with optional search)
curl -s "$BASE_URL/api/v1/notes" -H "Authorization: Bearer <TOKEN>"
curl -s "$BASE_URL/api/v1/notes?search=keyword" -H "Authorization: Bearer <TOKEN>"

# Create note
curl -s -X POST "$BASE_URL/api/v1/notes" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "title": "Title", "content": "Markdown content", "tags": ["tag1"], "notebookId": "<NOTEBOOK_ID>" }'

# Get note
curl -s "$BASE_URL/api/v1/notes/<NOTE_ID>" -H "Authorization: Bearer <TOKEN>"

# Update note
curl -s -X PATCH "$BASE_URL/api/v1/notes/<NOTE_ID>" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "title": "Updated" }'

# Delete note
curl -s -X DELETE "$BASE_URL/api/v1/notes/<NOTE_ID>" -H "Authorization: Bearer <TOKEN>"

# Note thread
curl -s "$BASE_URL/api/v1/notes/<NOTE_ID>/thread" -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/v1/notes/<NOTE_ID>/thread" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "content": "Thread reply" }'
```

### Kanban

```bash
# Boards
curl -s "$BASE_URL/api/v1/kanban/boards" -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/v1/kanban/boards" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "My Board" }'
curl -s -X PATCH "$BASE_URL/api/v1/kanban/boards/<BOARD_ID>" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "Renamed" }'
curl -s -X POST "$BASE_URL/api/v1/kanban/boards/<BOARD_ID>/archive" \
  -H "Authorization: Bearer <TOKEN>"

# Cards (with optional search)
curl -s "$BASE_URL/api/v1/kanban/cards" -H "Authorization: Bearer <TOKEN>"
curl -s "$BASE_URL/api/v1/kanban/cards?search=keyword" -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/v1/kanban/cards" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "title": "Task", "columnName": "To Do", "priority": "medium" }'
curl -s -X PATCH "$BASE_URL/api/v1/kanban/cards/<CARD_ID>" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "columnId": "<COL_ID>", "priority": "high" }'
curl -s -X POST "$BASE_URL/api/v1/kanban/cards/<CARD_ID>/complete" \
  -H "Authorization: Bearer <TOKEN>"
curl -s -X DELETE "$BASE_URL/api/v1/kanban/cards/<CARD_ID>" \
  -H "Authorization: Bearer <TOKEN>"

# Commits
curl -s -X POST "$BASE_URL/api/v1/kanban/cards/<CARD_ID>/commits" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "commitHash": "abc1234", "message": "feat: add feature" }'
curl -s "$BASE_URL/api/v1/kanban/cards/<CARD_ID>/commits" \
  -H "Authorization: Bearer <TOKEN>"

# Archived cards
curl -s "$BASE_URL/api/v1/kanban/boards/<BOARD_ID>/archived-cards?page=1&limit=20" \
  -H "Authorization: Bearer <TOKEN>"

# Card-note links
curl -s -X POST "$BASE_URL/api/v1/kanban/cards/<CARD_ID>/notes" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "noteId": "<NOTE_ID>" }'
curl -s "$BASE_URL/api/v1/kanban/cards/<CARD_ID>/notes" \
  -H "Authorization: Bearer <TOKEN>"
curl -s -X DELETE "$BASE_URL/api/v1/kanban/cards/<CARD_ID>/notes/<NOTE_ID>" \
  -H "Authorization: Bearer <TOKEN>"

# Columns
curl -s "$BASE_URL/api/v1/kanban/boards/<BOARD_ID>/columns" \
  -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/v1/kanban/boards/<BOARD_ID>/columns" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "Custom Column" }'
curl -s -X PATCH "$BASE_URL/api/v1/kanban/columns/<COL_ID>" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "Renamed" }'
curl -s -X DELETE "$BASE_URL/api/v1/kanban/columns/<COL_ID>" \
  -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/v1/kanban/boards/<BOARD_ID>/columns/reorder" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "columnIds": ["<COL1>", "<COL2>", "<COL3>"] }'

# Labels
curl -s "$BASE_URL/api/v1/kanban/boards/<BOARD_ID>/labels" \
  -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/v1/kanban/boards/<BOARD_ID>/labels" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "Bug", "color": "#ff0000" }'
curl -s -X PATCH "$BASE_URL/api/v1/kanban/labels/<LABEL_ID>" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "name": "Feature", "color": "#00ff00" }'
curl -s -X DELETE "$BASE_URL/api/v1/kanban/labels/<LABEL_ID>" \
  -H "Authorization: Bearer <TOKEN>"
curl -s -X POST "$BASE_URL/api/v1/kanban/cards/<CARD_ID>/labels" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "labelId": "<LABEL_ID>" }'
curl -s -X DELETE "$BASE_URL/api/v1/kanban/cards/<CARD_ID>/labels/<LABEL_ID>" \
  -H "Authorization: Bearer <TOKEN>"
```

### Memories

```bash
# List memories
curl -s "$BASE_URL/api/v1/memories" -H "Authorization: Bearer <TOKEN>"

# Create memory
curl -s -X POST "$BASE_URL/api/v1/memories" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "content": "User prefers dark mode", "category": "preference" }'

# Search capsules
curl -s "$BASE_URL/api/v1/capsules?q=search+terms&limit=10" \
  -H "Authorization: Bearer <TOKEN>"
```

### Skills

```bash
# List installed skills
curl -s "$BASE_URL/api/v1/skills/installed" -H "Authorization: Bearer <TOKEN>"

# Get skill prompt
curl -s "$BASE_URL/api/v1/skills/<SLUG>/prompt" -H "Authorization: Bearer <TOKEN>"
```

### Wiki

```bash
# Create wiki page
curl -s -X POST "$BASE_URL/api/v1/wiki" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "title": "Page Title", "content": "Wiki content", "conversationId": "<CONV_ID>" }'

# Update wiki page
curl -s -X PATCH "$BASE_URL/api/v1/wiki/<PAGE_ID>" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" \
  -d '{ "title": "Updated", "content": "New content" }'
```

---

## Agent Workflow Example

A typical development workflow using the CLI:

```bash
# 1. Create a card for the task
arinova kanban card create --title "Add login page" --column-name "To Do"

# 2. Move card to In Progress
arinova kanban card update --card-id <CARD_ID> --column-id <IN_PROGRESS_COL_ID>

# 3. Link commits as you develop
arinova kanban card add-commit --card-id <CARD_ID> --sha abc1234 --message "feat: add login form"

# 4. Complete the card when done
arinova kanban card complete --card-id <CARD_ID>
```

## License

Proprietary - Arinova AI
