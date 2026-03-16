import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";
import { resolveArinovaChatAccount } from "./accounts.js";
import { getArinovaChatRuntime } from "./runtime.js";

// ── Helpers ──

type ToolResult = {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown>;
};

function resolveAccount(accountId?: string) {
  const cfg = getArinovaChatRuntime().config.loadConfig() as CoreConfig;
  return resolveArinovaChatAccount({ cfg, accountId });
}

function errResult(msg: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${msg}` }],
    details: { error: msg },
  };
}

async function apiCall(opts: {
  method: string;
  url: string;
  token: string;
  body?: unknown;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
  };
  const init: RequestInit = { method: opts.method, headers };

  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(opts.url, init);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Tool Registration ──

export function registerTools(api: OpenClawPluginApi) {
  // Tool 1: arinova_send_message
  api.registerTool(
    {
      name: "arinova_send_message",
      label: "Send Message",
      description:
        "Send a message to an Arinova Chat conversation. Use for proactive messaging, replies, or notifications.",
      parameters: Type.Object({
        conversationId: Type.String({ description: "Target conversation ID" }),
        content: Type.String({ description: "Message text content" }),
        replyTo: Type.Optional(
          Type.String({ description: "Message ID to reply to" }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { conversationId, content, replyTo } = params as {
          conversationId: string;
          content: string;
          replyTo?: string;
        };
        try {
          const account = resolveAccount();
          const body: Record<string, string> = { conversationId, content };
          if (replyTo) body.replyTo = replyTo;

          const result = await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/send`,
            token: account.botToken,
            body,
          });

          return {
            content: [{ type: "text", text: `Message sent to conversation ${conversationId}.` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_send_message" },
  );

  // Tool 2: arinova_upload_file
  api.registerTool(
    {
      name: "arinova_upload_file",
      label: "Upload File",
      description:
        "Upload a file to an Arinova Chat conversation and get back a URL. Use the URL in markdown image/link syntax in messages.",
      parameters: Type.Object({
        conversationId: Type.String({ description: "Target conversation ID" }),
        filePath: Type.String({ description: "Absolute path to the file to upload" }),
      }),
      async execute(_toolCallId, params) {
        const { conversationId, filePath } = params as {
          conversationId: string;
          filePath: string;
        };
        try {
          const account = resolveAccount();
          const fs = await import("node:fs");
          const path = await import("node:path");

          if (!fs.existsSync(filePath)) {
            return errResult(`File not found: ${filePath}`);
          }

          const fileBuffer = fs.readFileSync(filePath);
          const fileName = path.basename(filePath);

          // Detect MIME type from extension
          const ext = path.extname(filePath).toLowerCase();
          const mimeMap: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".pdf": "application/pdf",
            ".txt": "text/plain",
            ".md": "text/markdown",
            ".json": "application/json",
            ".csv": "text/csv",
          };
          const mimeType = mimeMap[ext] ?? "application/octet-stream";

          const blob = new Blob([fileBuffer], { type: mimeType });
          const formData = new FormData();
          formData.append("conversationId", conversationId);
          formData.append("file", blob, fileName);

          const res = await fetch(`${account.apiUrl}/api/agent/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${account.botToken}` },
            body: formData,
          });

          if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
          }

          const data = (await res.json()) as { url: string; fileName: string; fileType: string; fileSize: number };

          return {
            content: [
              {
                type: "text",
                text: `File uploaded: ${data.fileName} (${data.fileType}, ${data.fileSize} bytes)\nURL: ${data.url}\n\nUse in a message: ![${data.fileName}](${data.url})`,
              },
            ],
            details: data,
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_upload_file" },
  );

  // Tool 3: arinova_list_messages
  api.registerTool(
    {
      name: "arinova_list_messages",
      label: "List Messages",
      description:
        "Fetch conversation history from Arinova Chat. Returns messages with cursor-based pagination (newest first).",
      parameters: Type.Object({
        conversationId: Type.String({ description: "Conversation ID to fetch messages from" }),
        limit: Type.Optional(
          Type.Number({ description: "Number of messages to fetch (default 50, max 100)" }),
        ),
        before: Type.Optional(
          Type.String({ description: "Message ID cursor — fetch messages older than this" }),
        ),
        after: Type.Optional(
          Type.String({ description: "Message ID cursor — fetch messages newer than this" }),
        ),
        around: Type.Optional(
          Type.String({ description: "Message ID cursor — fetch messages around this one" }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { conversationId, limit, before, after, around } = params as {
          conversationId: string;
          limit?: number;
          before?: string;
          after?: string;
          around?: string;
        };
        try {
          const account = resolveAccount();
          const qs = new URLSearchParams();
          if (limit) qs.set("limit", String(limit));
          if (before) qs.set("before", before);
          if (after) qs.set("after", after);
          if (around) qs.set("around", around);
          const qStr = qs.toString();
          const url = `${account.apiUrl}/api/agent/messages/${encodeURIComponent(conversationId)}${qStr ? "?" + qStr : ""}`;

          const data = (await apiCall({
            method: "GET",
            url,
            token: account.botToken,
          })) as { messages: unknown[]; hasMore: boolean; nextCursor?: string };

          const count = data.messages?.length ?? 0;
          const lines = (data.messages as Array<{ role?: string; content?: string; senderUsername?: string; createdAt?: string }>)
            .map((m, i) => {
              const who = m.senderUsername || m.role || "unknown";
              const time = m.createdAt ? ` (${m.createdAt})` : "";
              const body = (m.content ?? "").slice(0, 200);
              return `${i + 1}. [${who}]${time}: ${body}`;
            })
            .join("\n");

          return {
            content: [
              {
                type: "text",
                text: `${count} messages${data.hasMore ? ` (more available, nextCursor: ${data.nextCursor})` : " (no more)"}:\n\n${lines}`,
              },
            ],
            details: data,
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_list_messages" },
  );

  // Tool 4: arinova_list_notes
  api.registerTool(
    {
      name: "arinova_list_notes",
      label: "List Notes",
      description:
        "List shared notes in an Arinova Chat conversation. Notes are visible to all conversation members. By default excludes archived notes.",
      parameters: Type.Object({
        conversationId: Type.String({ description: "Conversation ID" }),
        limit: Type.Optional(
          Type.Number({ description: "Max notes to return (default 20, max 50)" }),
        ),
        before: Type.Optional(
          Type.String({ description: "Note ID cursor for pagination" }),
        ),
        tags: Type.Optional(
          Type.Array(Type.String(), { description: "Filter by tags (AND logic)" }),
        ),
        archived: Type.Optional(
          Type.Boolean({ description: "If true, list archived notes instead of active" }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { conversationId, limit, before, tags, archived } = params as {
          conversationId: string;
          limit?: number;
          before?: string;
          tags?: string[];
          archived?: boolean;
        };
        try {
          const account = resolveAccount();
          const qs = new URLSearchParams();
          if (limit) qs.set("limit", String(limit));
          if (before) qs.set("before", before);
          if (tags?.length) qs.set("tags", tags.join(","));
          if (archived) qs.set("archived", "true");
          const qStr = qs.toString();
          const url = `${account.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/notes${qStr ? "?" + qStr : ""}`;

          const data = (await apiCall({
            method: "GET",
            url,
            token: account.botToken,
          })) as { notes: unknown[]; hasMore: boolean; nextCursor?: string };

          const count = data.notes?.length ?? 0;
          const lines = (data.notes as Array<{ id?: string; title?: string; content?: string; tags?: string[] }>)
            .map((n, i) => {
              const tagStr = n.tags?.length ? ` [${n.tags.join(", ")}]` : "";
              return `${i + 1}. [${n.id}] ${n.title ?? "(untitled)"}${tagStr}: ${(n.content ?? "").slice(0, 100)}`;
            })
            .join("\n");

          return {
            content: [{ type: "text", text: `${count} notes:\n\n${lines}` }],
            details: data,
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_list_notes" },
  );

  // Tool 5: arinova_create_note
  api.registerTool(
    {
      name: "arinova_create_note",
      label: "Create Note",
      description:
        "Create a shared note in an Arinova Chat conversation. Supports markdown content and tags.",
      parameters: Type.Object({
        conversationId: Type.String({ description: "Conversation ID" }),
        title: Type.String({ description: "Note title" }),
        content: Type.String({ description: "Note content (markdown supported)" }),
        tags: Type.Optional(
          Type.Array(Type.String(), { description: "Tags for categorization" }),
        ),
        notebookId: Type.Optional(
          Type.String({ description: "Target notebook ID. If omitted, uses the conversation owner's default notebook." }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { conversationId, title, content, tags, notebookId } = params as {
          conversationId: string;
          title: string;
          content: string;
          tags?: string[];
          notebookId?: string;
        };
        try {
          const account = resolveAccount();
          const result = await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/notes`,
            token: account.botToken,
            body: { title, content, tags: tags ?? [], ...(notebookId ? { notebookId } : {}) },
          });

          return {
            content: [{ type: "text", text: `Note created: "${title}"` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_create_note" },
  );

  // Tool 6: arinova_update_note
  api.registerTool(
    {
      name: "arinova_update_note",
      label: "Update Note",
      description:
        "Update a note you created in an Arinova Chat conversation. Only the note creator can edit.",
      parameters: Type.Object({
        conversationId: Type.String({ description: "Conversation ID" }),
        noteId: Type.String({ description: "Note ID to update" }),
        title: Type.Optional(Type.String({ description: "New title" })),
        content: Type.Optional(Type.String({ description: "New content (markdown)" })),
        tags: Type.Optional(
          Type.Array(Type.String(), { description: "Replace tags" }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { conversationId, noteId, title, content, tags } = params as {
          conversationId: string;
          noteId: string;
          title?: string;
          content?: string;
          tags?: string[];
        };
        try {
          const account = resolveAccount();
          const body: Record<string, unknown> = {};
          if (title !== undefined) body.title = title;
          if (content !== undefined) body.content = content;
          if (tags !== undefined) body.tags = tags;

          const result = await apiCall({
            method: "PATCH",
            url: `${account.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/notes/${encodeURIComponent(noteId)}`,
            token: account.botToken,
            body,
          });

          return {
            content: [{ type: "text", text: `Note ${noteId} updated.` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_update_note" },
  );

  // Tool 7: arinova_delete_note
  api.registerTool(
    {
      name: "arinova_delete_note",
      label: "Delete Note",
      description:
        "Delete a note you created in an Arinova Chat conversation. Only the note creator can delete.",
      parameters: Type.Object({
        conversationId: Type.String({ description: "Conversation ID" }),
        noteId: Type.String({ description: "Note ID to delete" }),
      }),
      async execute(_toolCallId, params) {
        const { conversationId, noteId } = params as {
          conversationId: string;
          noteId: string;
        };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "DELETE",
            url: `${account.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/notes/${encodeURIComponent(noteId)}`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: `Note ${noteId} deleted.` }],
            details: { noteId },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_delete_note" },
  );

  // Tool 8: arinova_kanban_list_boards
  api.registerTool(
    {
      name: "arinova_kanban_list_boards",
      label: "List Kanban Boards",
      description:
        "List available Kanban boards. Returns boards with their columns and cards.",
      parameters: Type.Object({}),
      async execute(_toolCallId, _params) {
        try {
          const account = resolveAccount();
          const data = await apiCall({
            method: "GET",
            url: `${account.apiUrl}/api/agent/kanban/boards`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            details: { result: data },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_list_boards" },
  );

  // Tool 9: arinova_kanban_list_cards
  api.registerTool(
    {
      name: "arinova_kanban_list_cards",
      label: "List Kanban Cards",
      description:
        "List all Kanban cards with their column names, priorities, and descriptions.",
      parameters: Type.Object({}),
      async execute(_toolCallId, _params) {
        try {
          const account = resolveAccount();
          const data = await apiCall({
            method: "GET",
            url: `${account.apiUrl}/api/agent/kanban/cards`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            details: { result: data },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_list_cards" },
  );

  // Tool 10: arinova_kanban_create_card
  api.registerTool(
    {
      name: "arinova_kanban_create_card",
      label: "Create Kanban Card",
      description:
        "Create a new card on a Kanban board. The card is auto-assigned to you as the creating agent.",
      parameters: Type.Object({
        boardId: Type.String({ description: "Board ID" }),
        columnId: Type.String({ description: "Column ID to place the card in" }),
        title: Type.String({ description: "Card title" }),
        description: Type.Optional(
          Type.String({ description: "Card description (markdown)" }),
        ),
        priority: Type.Optional(
          Type.String({ description: 'Priority: "low", "medium", "high", or "urgent"' }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { boardId, columnId, title, description, priority } = params as {
          boardId: string;
          columnId: string;
          title: string;
          description?: string;
          priority?: string;
        };
        try {
          const account = resolveAccount();
          const body: Record<string, string> = { boardId, columnId, title };
          if (description) body.description = description;
          if (priority) body.priority = priority;

          const result = await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/cards`,
            token: account.botToken,
            body,
          });

          return {
            content: [{ type: "text", text: `Kanban card created: "${title}"` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_create_card" },
  );

  // Tool 10: arinova_kanban_update_card
  api.registerTool(
    {
      name: "arinova_kanban_update_card",
      label: "Update Kanban Card",
      description:
        "Update an existing Kanban card — change title, description, move to a different column, or update priority.",
      parameters: Type.Object({
        cardId: Type.String({ description: "Card ID to update" }),
        title: Type.Optional(Type.String({ description: "New title" })),
        description: Type.Optional(Type.String({ description: "New description" })),
        columnId: Type.Optional(
          Type.String({ description: "Move card to this column ID" }),
        ),
        priority: Type.Optional(
          Type.String({ description: 'New priority: "low", "medium", "high", or "urgent"' }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { cardId, title, description, columnId, priority } = params as {
          cardId: string;
          title?: string;
          description?: string;
          columnId?: string;
          priority?: string;
        };
        try {
          const account = resolveAccount();
          const body: Record<string, string> = {};
          if (title !== undefined) body.title = title;
          if (description !== undefined) body.description = description;
          if (columnId !== undefined) body.columnId = columnId;
          if (priority !== undefined) body.priority = priority;

          const result = await apiCall({
            method: "PATCH",
            url: `${account.apiUrl}/api/agent/kanban/cards/${encodeURIComponent(cardId)}`,
            token: account.botToken,
            body,
          });

          return {
            content: [{ type: "text", text: `Kanban card ${cardId} updated.` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_update_card" },
  );

  // Tool 11: arinova_query_memory
  api.registerTool(
    {
      name: "arinova_query_memory",
      label: "Query Memory",
      description:
        "Search memories across all memory capsules granted to this agent. Uses hybrid search (embedding + text) to find relevant memories.",
      parameters: Type.Object({
        query: Type.String({ description: "Search keywords or semantic query" }),
        limit: Type.Optional(
          Type.Number({ description: "Number of results to return (default 10, max 20)" }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { query, limit } = params as {
          query: string;
          limit?: number;
        };
        try {
          const account = resolveAccount();
          const qs = new URLSearchParams();
          qs.set("query", query);
          if (limit) qs.set("limit", String(Math.min(limit, 20)));
          const url = `${account.apiUrl}/api/agent/capsules?${qs.toString()}`;

          const data = (await apiCall({
            method: "GET",
            url,
            token: account.botToken,
          })) as Array<{ content: string; capsule_name: string; capsule_id: string; score: number; importance: number }>;

          if (!data.length) {
            return {
              content: [{ type: "text", text: "No matching memories found." }],
              details: { results: [] },
            };
          }

          const lines = data
            .map(
              (m, i) =>
                `${i + 1}. [${m.capsule_name}] (score: ${m.score.toFixed(3)})\n   ${m.content}`,
            )
            .join("\n\n");

          return {
            content: [
              {
                type: "text",
                text: `Found ${data.length} memories:\n\n${lines}`,
              },
            ],
            details: { results: data },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_query_memory" },
  );

  // Tool 12: arinova_share_note
  api.registerTool(
    {
      name: "arinova_share_note",
      label: "Share Note",
      description:
        "Share a note as a message in the conversation. Creates a preview card that other members can click to open.",
      parameters: Type.Object({
        conversationId: Type.String({ description: "Conversation ID" }),
        noteId: Type.String({ description: "Note ID to share" }),
      }),
      async execute(_toolCallId, params) {
        const { conversationId, noteId } = params as {
          conversationId: string;
          noteId: string;
        };
        try {
          const account = resolveAccount();
          const result = (await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/conversations/${encodeURIComponent(conversationId)}/notes/${encodeURIComponent(noteId)}/share`,
            token: account.botToken,
          })) as { messageId: string; title: string };

          return {
            content: [{ type: "text", text: `Note "${result.title}" shared in conversation.` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_share_note" },
  );

  // Tool 13: arinova_kanban_create_board
  api.registerTool(
    {
      name: "arinova_kanban_create_board",
      label: "Create Kanban Board",
      description:
        "Create a new Kanban board, optionally with initial columns.",
      parameters: Type.Object({
        name: Type.String({ description: "Board name" }),
        columns: Type.Optional(
          Type.Array(Type.Object({ name: Type.String() }), {
            description: "Initial columns (in order). If omitted, board is created empty.",
          }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { name, columns } = params as {
          name: string;
          columns?: { name: string }[];
        };
        try {
          const account = resolveAccount();
          const body: Record<string, unknown> = { name };
          if (columns) body.columns = columns;

          const result = await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/boards`,
            token: account.botToken,
            body,
          });

          return {
            content: [{ type: "text", text: `Board created: "${name}"` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_create_board" },
  );

  // Tool 14: arinova_kanban_update_board
  api.registerTool(
    {
      name: "arinova_kanban_update_board",
      label: "Update Kanban Board",
      description: "Rename an existing Kanban board.",
      parameters: Type.Object({
        boardId: Type.String({ description: "Board ID" }),
        name: Type.String({ description: "New board name" }),
      }),
      async execute(_toolCallId, params) {
        const { boardId, name } = params as { boardId: string; name: string };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "PATCH",
            url: `${account.apiUrl}/api/agent/kanban/boards/${encodeURIComponent(boardId)}`,
            token: account.botToken,
            body: { name },
          });

          return {
            content: [{ type: "text", text: `Board ${boardId} renamed to "${name}".` }],
            details: { boardId, name },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_update_board" },
  );

  // Tool 15: arinova_kanban_archive_board
  api.registerTool(
    {
      name: "arinova_kanban_archive_board",
      label: "Archive/Unarchive Kanban Board",
      description:
        "Toggle the archived state of a Kanban board. Cannot archive the last non-archived board.",
      parameters: Type.Object({
        boardId: Type.String({ description: "Board ID to archive/unarchive" }),
      }),
      async execute(_toolCallId, params) {
        const { boardId } = params as { boardId: string };
        try {
          const account = resolveAccount();
          const res = await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/boards/${encodeURIComponent(boardId)}/archive`,
            token: account.botToken,
          });

          const archived = (res as { archived?: boolean }).archived;
          return {
            content: [{ type: "text", text: `Board ${boardId} ${archived ? "archived" : "unarchived"}.` }],
            details: { boardId, archived },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_archive_board" },
  );

  // Tool 16: arinova_kanban_list_columns
  api.registerTool(
    {
      name: "arinova_kanban_list_columns",
      label: "List Kanban Columns",
      description: "List all columns in a Kanban board.",
      parameters: Type.Object({
        boardId: Type.String({ description: "Board ID" }),
      }),
      async execute(_toolCallId, params) {
        const { boardId } = params as { boardId: string };
        try {
          const account = resolveAccount();
          const data = await apiCall({
            method: "GET",
            url: `${account.apiUrl}/api/agent/kanban/boards/${encodeURIComponent(boardId)}/columns`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            details: { result: data },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_list_columns" },
  );

  // Tool 17: arinova_kanban_create_column
  api.registerTool(
    {
      name: "arinova_kanban_create_column",
      label: "Create Kanban Column",
      description: "Add a new column to a Kanban board.",
      parameters: Type.Object({
        boardId: Type.String({ description: "Board ID" }),
        name: Type.String({ description: "Column name" }),
        sortOrder: Type.Optional(
          Type.Number({ description: "Position (0-based). If omitted, appended at end." }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { boardId, name, sortOrder } = params as {
          boardId: string;
          name: string;
          sortOrder?: number;
        };
        try {
          const account = resolveAccount();
          const body: Record<string, unknown> = { name };
          if (sortOrder !== undefined) body.sortOrder = sortOrder;

          const result = await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/boards/${encodeURIComponent(boardId)}/columns`,
            token: account.botToken,
            body,
          });

          return {
            content: [{ type: "text", text: `Column "${name}" created.` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_create_column" },
  );

  // Tool 18: arinova_kanban_update_column
  api.registerTool(
    {
      name: "arinova_kanban_update_column",
      label: "Update Kanban Column",
      description: "Rename a Kanban column or change its position.",
      parameters: Type.Object({
        columnId: Type.String({ description: "Column ID" }),
        name: Type.Optional(Type.String({ description: "New column name" })),
        sortOrder: Type.Optional(Type.Number({ description: "New sort order" })),
      }),
      async execute(_toolCallId, params) {
        const { columnId, name, sortOrder } = params as {
          columnId: string;
          name?: string;
          sortOrder?: number;
        };
        try {
          const account = resolveAccount();
          const body: Record<string, unknown> = {};
          if (name !== undefined) body.name = name;
          if (sortOrder !== undefined) body.sortOrder = sortOrder;

          await apiCall({
            method: "PATCH",
            url: `${account.apiUrl}/api/agent/kanban/columns/${encodeURIComponent(columnId)}`,
            token: account.botToken,
            body,
          });

          return {
            content: [{ type: "text", text: `Column ${columnId} updated.` }],
            details: { columnId, name, sortOrder },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_update_column" },
  );

  // Tool 19: arinova_kanban_delete_column
  api.registerTool(
    {
      name: "arinova_kanban_delete_column",
      label: "Delete Kanban Column",
      description:
        "Delete a Kanban column. Column must be empty (no non-archived cards).",
      parameters: Type.Object({
        columnId: Type.String({ description: "Column ID to delete" }),
      }),
      async execute(_toolCallId, params) {
        const { columnId } = params as { columnId: string };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "DELETE",
            url: `${account.apiUrl}/api/agent/kanban/columns/${encodeURIComponent(columnId)}`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: `Column ${columnId} deleted.` }],
            details: { columnId },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_delete_column" },
  );

  // Tool 20: arinova_kanban_reorder_columns
  api.registerTool(
    {
      name: "arinova_kanban_reorder_columns",
      label: "Reorder Kanban Columns",
      description:
        "Reorder columns in a Kanban board. Provide column IDs in desired order.",
      parameters: Type.Object({
        boardId: Type.String({ description: "Board ID" }),
        columnIds: Type.Array(Type.String(), {
          description: "Column IDs in desired display order",
        }),
      }),
      async execute(_toolCallId, params) {
        const { boardId, columnIds } = params as {
          boardId: string;
          columnIds: string[];
        };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/boards/${encodeURIComponent(boardId)}/columns/reorder`,
            token: account.botToken,
            body: { columnIds },
          });

          return {
            content: [{ type: "text", text: `Columns reordered (${columnIds.length} columns).` }],
            details: { boardId, columnIds },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_reorder_columns" },
  );

  // Tool 21: arinova_kanban_add_card_commit
  api.registerTool(
    {
      name: "arinova_kanban_add_card_commit",
      label: "Add Commit to Kanban Card",
      description:
        "Link a git commit hash to a Kanban card for traceability.",
      parameters: Type.Object({
        cardId: Type.String({ description: "Card ID" }),
        commitHash: Type.String({ description: "Git commit hash (1-40 chars)" }),
        message: Type.Optional(
          Type.String({ description: "Commit message" }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { cardId, commitHash, message } = params as {
          cardId: string;
          commitHash: string;
          message?: string;
        };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/cards/${encodeURIComponent(cardId)}/commits`,
            token: account.botToken,
            body: { commitHash, message },
          });

          return {
            content: [{ type: "text", text: `Commit ${commitHash} linked to card ${cardId}.` }],
            details: { cardId, commitHash, message },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_add_card_commit" },
  );

  // Tool 22: arinova_kanban_list_card_commits
  api.registerTool(
    {
      name: "arinova_kanban_list_card_commits",
      label: "List Commits on Kanban Card",
      description:
        "List all git commits linked to a Kanban card.",
      parameters: Type.Object({
        cardId: Type.String({ description: "Card ID" }),
      }),
      async execute(_toolCallId, params) {
        const { cardId } = params as { cardId: string };
        try {
          const account = resolveAccount();
          const res = await apiCall({
            method: "GET",
            url: `${account.apiUrl}/api/agent/kanban/cards/${encodeURIComponent(cardId)}/commits`,
            token: account.botToken,
          });

          const commits = Array.isArray(res) ? res : [];
          return {
            content: [{ type: "text", text: JSON.stringify(commits, null, 2) }],
            details: { cardId, count: commits.length },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_list_card_commits" },
  );

  // Tool 23: arinova_kanban_complete_card
  api.registerTool(
    {
      name: "arinova_kanban_complete_card",
      label: "Complete Kanban Card",
      description:
        "Mark a Kanban card as complete by moving it to the Done column.",
      parameters: Type.Object({
        cardId: Type.String({ description: "Card ID to complete" }),
      }),
      async execute(_toolCallId, params) {
        const { cardId } = params as { cardId: string };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/cards/${encodeURIComponent(cardId)}/complete`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: `Card ${cardId} moved to Done.` }],
            details: { cardId },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_complete_card" },
  );

  // Tool 24: arinova_kanban_list_archived_cards
  api.registerTool(
    {
      name: "arinova_kanban_list_archived_cards",
      label: "List Archived Kanban Cards",
      description:
        "List archived cards on a Kanban board with pagination.",
      parameters: Type.Object({
        boardId: Type.String({ description: "Board ID" }),
        page: Type.Optional(Type.Number({ description: "Page number (default 1)" })),
        limit: Type.Optional(Type.Number({ description: "Items per page (default 20, max 100)" })),
      }),
      async execute(_toolCallId, params) {
        const { boardId, page, limit } = params as {
          boardId: string;
          page?: number;
          limit?: number;
        };
        try {
          const account = resolveAccount();
          const qs = new URLSearchParams();
          if (page) qs.set("page", String(page));
          if (limit) qs.set("limit", String(limit));
          const qsStr = qs.toString() ? `?${qs.toString()}` : "";
          const res = await apiCall({
            method: "GET",
            url: `${account.apiUrl}/api/agent/kanban/boards/${encodeURIComponent(boardId)}/archived-cards${qsStr}`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
            details: { boardId },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_list_archived_cards" },
  );

  // Tool 25: arinova_kanban_link_note
  api.registerTool(
    {
      name: "arinova_kanban_link_note",
      label: "Link Note to Kanban Card",
      description:
        "Link an existing note to a Kanban card for reference.",
      parameters: Type.Object({
        cardId: Type.String({ description: "Card ID" }),
        noteId: Type.String({ description: "Note ID to link" }),
      }),
      async execute(_toolCallId, params) {
        const { cardId, noteId } = params as {
          cardId: string;
          noteId: string;
        };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/cards/${encodeURIComponent(cardId)}/notes`,
            token: account.botToken,
            body: { noteId },
          });

          return {
            content: [{ type: "text", text: `Note ${noteId} linked to card ${cardId}.` }],
            details: { cardId, noteId },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_link_note" },
  );

  // Tool 26: arinova_kanban_unlink_note
  api.registerTool(
    {
      name: "arinova_kanban_unlink_note",
      label: "Unlink Note from Kanban Card",
      description:
        "Remove a note link from a Kanban card.",
      parameters: Type.Object({
        cardId: Type.String({ description: "Card ID" }),
        noteId: Type.String({ description: "Note ID to unlink" }),
      }),
      async execute(_toolCallId, params) {
        const { cardId, noteId } = params as {
          cardId: string;
          noteId: string;
        };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "DELETE",
            url: `${account.apiUrl}/api/agent/kanban/cards/${encodeURIComponent(cardId)}/notes/${encodeURIComponent(noteId)}`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: `Note ${noteId} unlinked from card ${cardId}.` }],
            details: { cardId, noteId },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_unlink_note" },
  );

  // Tool 27: arinova_kanban_list_card_notes
  api.registerTool(
    {
      name: "arinova_kanban_list_card_notes",
      label: "List Notes on Kanban Card",
      description:
        "List all notes linked to a Kanban card.",
      parameters: Type.Object({
        cardId: Type.String({ description: "Card ID" }),
      }),
      async execute(_toolCallId, params) {
        const { cardId } = params as { cardId: string };
        try {
          const account = resolveAccount();
          const res = await apiCall({
            method: "GET",
            url: `${account.apiUrl}/api/agent/kanban/cards/${encodeURIComponent(cardId)}/notes`,
            token: account.botToken,
          });

          const notes = Array.isArray(res) ? res : [];
          return {
            content: [{ type: "text", text: JSON.stringify(notes, null, 2) }],
            details: { cardId, count: notes.length },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_list_card_notes" },
  );

  // Tool 28: arinova_kanban_list_labels
  api.registerTool(
    {
      name: "arinova_kanban_list_labels",
      label: "List Kanban Labels",
      description:
        "List all labels for a Kanban board.",
      parameters: Type.Object({
        boardId: Type.String({ description: "Board ID" }),
      }),
      async execute(_toolCallId, params) {
        const { boardId } = params as { boardId: string };
        try {
          const account = resolveAccount();
          const res = await apiCall({
            method: "GET",
            url: `${account.apiUrl}/api/agent/kanban/boards/${encodeURIComponent(boardId)}/labels`,
            token: account.botToken,
          });

          const labels = Array.isArray(res) ? res : [];
          return {
            content: [{ type: "text", text: JSON.stringify(labels, null, 2) }],
            details: { boardId, count: labels.length },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_list_labels" },
  );

  // Tool 29: arinova_kanban_create_label
  api.registerTool(
    {
      name: "arinova_kanban_create_label",
      label: "Create Kanban Label",
      description:
        "Create a new label on a Kanban board.",
      parameters: Type.Object({
        boardId: Type.String({ description: "Board ID" }),
        name: Type.String({ description: "Label name" }),
        color: Type.Optional(
          Type.String({ description: "Label color (hex, e.g. '#ff0000')" }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { boardId, name, color } = params as {
          boardId: string;
          name: string;
          color?: string;
        };
        try {
          const account = resolveAccount();
          const body: Record<string, string> = { name };
          if (color) body.color = color;

          const result = await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/boards/${encodeURIComponent(boardId)}/labels`,
            token: account.botToken,
            body,
          });

          return {
            content: [{ type: "text", text: `Label "${name}" created on board ${boardId}.` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_create_label" },
  );

  // Tool 30: arinova_kanban_update_label
  api.registerTool(
    {
      name: "arinova_kanban_update_label",
      label: "Update Kanban Label",
      description:
        "Update a Kanban label's name or color.",
      parameters: Type.Object({
        labelId: Type.String({ description: "Label ID" }),
        name: Type.Optional(
          Type.String({ description: "New label name" }),
        ),
        color: Type.Optional(
          Type.String({ description: "New label color (hex)" }),
        ),
      }),
      async execute(_toolCallId, params) {
        const { labelId, name, color } = params as {
          labelId: string;
          name?: string;
          color?: string;
        };
        try {
          const account = resolveAccount();
          const body: Record<string, string> = {};
          if (name) body.name = name;
          if (color) body.color = color;

          const result = await apiCall({
            method: "PATCH",
            url: `${account.apiUrl}/api/agent/kanban/labels/${encodeURIComponent(labelId)}`,
            token: account.botToken,
            body,
          });

          return {
            content: [{ type: "text", text: `Label ${labelId} updated.` }],
            details: { result },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_update_label" },
  );

  // Tool 31: arinova_kanban_delete_label
  api.registerTool(
    {
      name: "arinova_kanban_delete_label",
      label: "Delete Kanban Label",
      description:
        "Delete a label from a Kanban board.",
      parameters: Type.Object({
        labelId: Type.String({ description: "Label ID" }),
      }),
      async execute(_toolCallId, params) {
        const { labelId } = params as { labelId: string };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "DELETE",
            url: `${account.apiUrl}/api/agent/kanban/labels/${encodeURIComponent(labelId)}`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: `Label ${labelId} deleted.` }],
            details: { labelId },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_delete_label" },
  );

  // Tool 32: arinova_kanban_add_card_label
  api.registerTool(
    {
      name: "arinova_kanban_add_card_label",
      label: "Add Label to Kanban Card",
      description:
        "Add a label to a Kanban card.",
      parameters: Type.Object({
        cardId: Type.String({ description: "Card ID" }),
        labelId: Type.String({ description: "Label ID to add" }),
      }),
      async execute(_toolCallId, params) {
        const { cardId, labelId } = params as {
          cardId: string;
          labelId: string;
        };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "POST",
            url: `${account.apiUrl}/api/agent/kanban/cards/${encodeURIComponent(cardId)}/labels`,
            token: account.botToken,
            body: { labelId },
          });

          return {
            content: [{ type: "text", text: `Label ${labelId} added to card ${cardId}.` }],
            details: { cardId, labelId },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_add_card_label" },
  );

  // Tool 33: arinova_kanban_remove_card_label
  api.registerTool(
    {
      name: "arinova_kanban_remove_card_label",
      label: "Remove Label from Kanban Card",
      description:
        "Remove a label from a Kanban card.",
      parameters: Type.Object({
        cardId: Type.String({ description: "Card ID" }),
        labelId: Type.String({ description: "Label ID to remove" }),
      }),
      async execute(_toolCallId, params) {
        const { cardId, labelId } = params as {
          cardId: string;
          labelId: string;
        };
        try {
          const account = resolveAccount();
          await apiCall({
            method: "DELETE",
            url: `${account.apiUrl}/api/agent/kanban/cards/${encodeURIComponent(cardId)}/labels/${encodeURIComponent(labelId)}`,
            token: account.botToken,
          });

          return {
            content: [{ type: "text", text: `Label ${labelId} removed from card ${cardId}.` }],
            details: { cardId, labelId },
          };
        } catch (err) {
          return errResult(String(err));
        }
      },
    },
    { name: "arinova_kanban_remove_card_label" },
  );
}
