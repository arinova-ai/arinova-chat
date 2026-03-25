import { vi, describe, it, expect, beforeEach } from "vitest";
import { Command } from "commander";

vi.mock("../client.js", () => ({
  get: vi.fn().mockResolvedValue({}),
  post: vi.fn().mockResolvedValue({}),
  patch: vi.fn().mockResolvedValue({}),
  put: vi.fn().mockResolvedValue({}),
  del: vi.fn().mockResolvedValue({}),
  upload: vi.fn().mockResolvedValue({}),
}));

vi.mock("../output.js", () => ({
  printResult: vi.fn(),
  printError: vi.fn(),
  printSuccess: vi.fn(),
  table: vi.fn(),
}));

import { get, post, patch, put, del } from "../client.js";
import { printResult, printSuccess, table } from "../output.js";
import { registerKanban } from "./kanban.js";
import { registerMemory } from "./memory.js";
import { registerConversation } from "./conversation.js";
import { registerMessage } from "./message.js";

function makeProgram(register: (p: Command) => void): Command {
  const program = new Command();
  program.exitOverride(); // prevent process.exit on parse errors
  register(program);
  return program;
}

async function run(program: Command, args: string[]): Promise<void> {
  await program.parseAsync(["node", "test", ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Kanban: column commands ──────────────────────────────────────────

describe("kanban column list", () => {
  it("calls GET /api/kanban/boards/:id", async () => {
    const program = makeProgram(registerKanban);
    await run(program, ["kanban", "column", "list", "--board-id", "b1"]);
    expect(get).toHaveBeenCalledWith("/api/kanban/boards/b1");
  });
});

describe("kanban column create", () => {
  it("calls POST /api/kanban/boards/:id/columns", async () => {
    const program = makeProgram(registerKanban);
    await run(program, [
      "kanban", "column", "create", "--board-id", "b1", "--name", "Todo",
    ]);
    expect(post).toHaveBeenCalledWith("/api/kanban/boards/b1/columns", {
      name: "Todo",
    });
  });
});

describe("kanban column update", () => {
  it("calls PATCH /api/kanban/columns/:id", async () => {
    const program = makeProgram(registerKanban);
    await run(program, [
      "kanban", "column", "update", "--column-id", "c1", "--name", "Done",
    ]);
    expect(patch).toHaveBeenCalledWith("/api/kanban/columns/c1", {
      name: "Done",
    });
  });
});

describe("kanban column delete", () => {
  it("calls DEL /api/kanban/columns/:id", async () => {
    const program = makeProgram(registerKanban);
    await run(program, ["kanban", "column", "delete", "--column-id", "c1"]);
    expect(del).toHaveBeenCalledWith("/api/kanban/columns/c1");
    expect(printSuccess).toHaveBeenCalledWith("Column c1 deleted.");
  });
});

describe("kanban column reorder", () => {
  it("calls PUT /api/kanban/boards/:id/columns/reorder", async () => {
    const program = makeProgram(registerKanban);
    await run(program, [
      "kanban", "column", "reorder", "--board-id", "b1",
      "--column-ids", "c1", "c2", "c3",
    ]);
    expect(put).toHaveBeenCalledWith(
      "/api/kanban/boards/b1/columns/reorder",
      { columnIds: ["c1", "c2", "c3"] },
    );
  });
});

// ─── Kanban: card commands ────────────────────────────────────────────

describe("kanban card link-note", () => {
  it("calls POST /api/kanban/cards/:id/notes", async () => {
    const program = makeProgram(registerKanban);
    await run(program, [
      "kanban", "card", "link-note", "--card-id", "k1", "--note-id", "n1",
    ]);
    expect(post).toHaveBeenCalledWith("/api/kanban/cards/k1/notes", {
      noteId: "n1",
    });
  });
});

describe("kanban card unlink-note", () => {
  it("calls DEL /api/kanban/cards/:id/notes/:noteId", async () => {
    const program = makeProgram(registerKanban);
    await run(program, [
      "kanban", "card", "unlink-note", "--card-id", "k1", "--note-id", "n1",
    ]);
    expect(del).toHaveBeenCalledWith("/api/kanban/cards/k1/notes/n1");
    expect(printSuccess).toHaveBeenCalledWith(
      "Note n1 unlinked from card k1.",
    );
  });
});

describe("kanban card notes", () => {
  it("calls GET /api/kanban/cards/:id/notes", async () => {
    const program = makeProgram(registerKanban);
    await run(program, ["kanban", "card", "notes", "--card-id", "k1"]);
    expect(get).toHaveBeenCalledWith("/api/kanban/cards/k1/notes");
  });
});

describe("kanban card commits", () => {
  it("calls GET /api/kanban/cards/:id/commits", async () => {
    const program = makeProgram(registerKanban);
    await run(program, ["kanban", "card", "commits", "--card-id", "k1"]);
    expect(get).toHaveBeenCalledWith("/api/kanban/cards/k1/commits");
  });
});

describe("kanban card add-label", () => {
  it("calls POST /api/kanban/cards/:id/labels", async () => {
    const program = makeProgram(registerKanban);
    await run(program, [
      "kanban", "card", "add-label", "--card-id", "k1", "--label-id", "l1",
    ]);
    expect(post).toHaveBeenCalledWith("/api/kanban/cards/k1/labels", {
      labelId: "l1",
    });
  });
});

describe("kanban card remove-label", () => {
  it("calls DEL /api/kanban/cards/:id/labels/:labelId", async () => {
    const program = makeProgram(registerKanban);
    await run(program, [
      "kanban", "card", "remove-label", "--card-id", "k1", "--label-id", "l1",
    ]);
    expect(del).toHaveBeenCalledWith("/api/kanban/cards/k1/labels/l1");
    expect(printSuccess).toHaveBeenCalledWith(
      "Label l1 removed from card k1.",
    );
  });
});

// ─── Kanban: label commands ───────────────────────────────────────────

describe("kanban label update", () => {
  it("calls PATCH /api/kanban/labels/:id with name and color", async () => {
    const program = makeProgram(registerKanban);
    await run(program, [
      "kanban", "label", "update", "--label-id", "l1",
      "--name", "Bug", "--color", "red",
    ]);
    expect(patch).toHaveBeenCalledWith("/api/kanban/labels/l1", {
      name: "Bug",
      color: "red",
    });
  });
});

describe("kanban label delete", () => {
  it("calls DEL /api/kanban/labels/:id", async () => {
    const program = makeProgram(registerKanban);
    await run(program, ["kanban", "label", "delete", "--label-id", "l1"]);
    expect(del).toHaveBeenCalledWith("/api/kanban/labels/l1");
    expect(printSuccess).toHaveBeenCalledWith("Label l1 deleted.");
  });
});

// ─── Memory commands ──────────────────────────────────────────────────

describe("memory list", () => {
  it("calls GET /api/v1/memories?agent_id=...", async () => {
    const program = makeProgram(registerMemory);
    await run(program, ["memory", "list", "--agent-id", "a1"]);
    expect(get).toHaveBeenCalledWith("/api/v1/memories?agent_id=a1");
  });
});

describe("memory create", () => {
  it("calls POST /api/v1/memories", async () => {
    const program = makeProgram(registerMemory);
    await run(program, [
      "memory", "create",
      "--agent-id", "a1",
      "--category", "tech",
      "--summary", "Uses React",
    ]);
    expect(post).toHaveBeenCalledWith("/api/v1/memories", {
      agent_id: "a1",
      category: "tech",
      summary: "Uses React",
    });
  });
});

describe("memory delete", () => {
  it("calls DEL /api/v1/memories/:id", async () => {
    const program = makeProgram(registerMemory);
    await run(program, ["memory", "delete", "--memory-id", "m1"]);
    expect(del).toHaveBeenCalledWith("/api/v1/memories/m1");
    expect(printSuccess).toHaveBeenCalledWith("Memory m1 deleted.");
  });
});

// ─── Conversation commands ────────────────────────────────────────────

describe("conversation list", () => {
  it("calls GET /api/conversations", async () => {
    const program = makeProgram(registerConversation);
    await run(program, ["conversation", "list"]);
    expect(get).toHaveBeenCalledWith("/api/conversations");
  });
});

describe("conversation create", () => {
  it("calls POST /api/conversations", async () => {
    const program = makeProgram(registerConversation);
    await run(program, [
      "conversation", "create", "--title", "My Chat",
    ]);
    expect(post).toHaveBeenCalledWith("/api/conversations", {
      title: "My Chat",
    });
  });
});

describe("conversation delete", () => {
  it("calls DEL /api/conversations/:id", async () => {
    const program = makeProgram(registerConversation);
    await run(program, [
      "conversation", "delete", "--conversation-id", "conv1",
    ]);
    expect(del).toHaveBeenCalledWith("/api/conversations/conv1");
    expect(printSuccess).toHaveBeenCalledWith("Conversation conv1 deleted.");
  });
});

describe("conversation update", () => {
  it("calls PATCH /api/conversations/:id", async () => {
    const program = makeProgram(registerConversation);
    await run(program, [
      "conversation", "update",
      "--conversation-id", "conv1",
      "--title", "Renamed",
    ]);
    expect(patch).toHaveBeenCalledWith("/api/conversations/conv1", {
      title: "Renamed",
    });
  });
});

// ─── Message commands ─────────────────────────────────────────────────

describe("message list", () => {
  it("calls GET /api/conversations/:id/messages", async () => {
    const program = makeProgram(registerMessage);
    await run(program, [
      "message", "list", "--conversation-id", "conv1",
    ]);
    expect(get).toHaveBeenCalledWith(
      "/api/conversations/conv1/messages",
    );
  });
});

describe("message delete", () => {
  it("calls DEL /api/conversations/:id/messages/:msgId", async () => {
    const program = makeProgram(registerMessage);
    await run(program, [
      "message", "delete",
      "--conversation-id", "conv1",
      "--message-id", "msg1",
    ]);
    expect(del).toHaveBeenCalledWith(
      "/api/conversations/conv1/messages/msg1",
    );
    expect(printSuccess).toHaveBeenCalledWith("Message msg1 deleted.");
  });
});

describe("message search", () => {
  it("calls GET /api/agent/search?q=... without conversation filter", async () => {
    const program = makeProgram(registerMessage);
    await run(program, ["message", "search", "--query", "hello world"]);
    expect(get).toHaveBeenCalledWith(
      "/api/agent/search?q=hello%20world",
    );
  });

  it("calls GET /api/agent/search?q=...&conversationId=... with filter", async () => {
    const program = makeProgram(registerMessage);
    await run(program, [
      "message", "search",
      "--query", "hello",
      "--conversation-id", "conv1",
    ]);
    expect(get).toHaveBeenCalledWith(
      "/api/agent/search?q=hello&conversationId=conv1",
    );
  });
});
