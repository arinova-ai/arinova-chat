import { randomInt, randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { eq } from "drizzle-orm";

// 32 chars — no 0/O/1/I to avoid visual confusion
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generatePairingCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[randomInt(CHARSET.length)];
  }
  return code;
}

export function normalizePairingCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function generateUniquePairingCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generatePairingCode();
    const [existing] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.pairingCode, code));
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique pairing code after 10 attempts");
}

/** Generate a permanent bot secret token: ari_ + 48 hex chars = 52 chars total */
export function generateSecretToken(): string {
  return `ari_${randomBytes(24).toString("hex")}`;
}
