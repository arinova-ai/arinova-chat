import { randomBytes } from "node:crypto";

/** Generate a permanent bot secret token: ari_ + 48 hex chars = 52 chars total */
export function generateSecretToken(): string {
  return `ari_${randomBytes(24).toString("hex")}`;
}
