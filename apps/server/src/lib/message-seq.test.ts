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
  messages: { seq: "seq", conversationId: "conversationId" },
}));

import { getNextSeq } from "./message-seq.js";
import { db } from "../db/index.js";

describe("getNextSeq", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 1 for a conversation with no messages", async () => {
    vi.mocked(db.select).mockReturnValue(db as any);
    vi.mocked(db.from).mockReturnValue(db as any);
    vi.mocked(db.where).mockResolvedValue([{ maxSeq: 0 }]);

    const seq = await getNextSeq("conv-1");
    expect(seq).toBe(1);
  });

  it("returns maxSeq + 1 for a conversation with existing messages", async () => {
    vi.mocked(db.select).mockReturnValue(db as any);
    vi.mocked(db.from).mockReturnValue(db as any);
    vi.mocked(db.where).mockResolvedValue([{ maxSeq: 5 }]);

    const seq = await getNextSeq("conv-1");
    expect(seq).toBe(6);
  });

  it("returns 1 when result is undefined", async () => {
    vi.mocked(db.select).mockReturnValue(db as any);
    vi.mocked(db.from).mockReturnValue(db as any);
    vi.mocked(db.where).mockResolvedValue([undefined]);

    const seq = await getNextSeq("conv-1");
    expect(seq).toBe(1);
  });
});
