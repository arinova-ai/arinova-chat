import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/index.js", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };
  return { db: mockDb };
});

vi.mock("../db/schema.js", () => ({
  agents: {},
}));

vi.mock("@arinova/shared/schemas", () => ({
  agentWSClientEventSchema: {
    parse: vi.fn((v) => v),
  },
}));

import {
  isAgentConnected,
  sendTaskToAgent,
  getAgentSkills,
} from "./agent-handler.js";

describe("Agent Handler - exported utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isAgentConnected", () => {
    it("returns false for unknown agent", () => {
      expect(isAgentConnected("unknown-agent")).toBe(false);
    });

    it("returns false for agent that was never connected", () => {
      expect(isAgentConnected("agent-123")).toBe(false);
    });
  });

  describe("getAgentSkills", () => {
    it("returns empty array for unknown agent", () => {
      expect(getAgentSkills("unknown-agent")).toEqual([]);
    });

    it("returns empty array for agent without skills", () => {
      expect(getAgentSkills("agent-no-skills")).toEqual([]);
    });
  });

  describe("sendTaskToAgent", () => {
    it("calls onError when agent is not connected", () => {
      const onChunk = vi.fn();
      const onComplete = vi.fn();
      const onError = vi.fn();

      const result = sendTaskToAgent({
        agentId: "not-connected-agent",
        taskId: "task-1",
        conversationId: "conv-1",
        content: "Hello",
        onChunk,
        onComplete,
        onError,
      });

      expect(onError).toHaveBeenCalledWith("Agent not connected");
      expect(onChunk).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
      expect(result.cancel).toBeDefined();
    });

    it("returns a cancel function even when agent is not connected", () => {
      const result = sendTaskToAgent({
        agentId: "not-connected",
        taskId: "task-2",
        conversationId: "conv-2",
        content: "Test",
        onChunk: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // cancel() should not throw
      expect(() => result.cancel()).not.toThrow();
    });
  });
});
