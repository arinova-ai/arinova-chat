import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

const KEY = process.env.ENCRYPTION_KEY;
if (!KEY || !/^[0-9a-f]{64}$/i.test(KEY)) {
  throw new Error(
    "ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}
const keyBuffer = Buffer.from(KEY, "hex");

export function encryptApiKey(plainText: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

export function decryptApiKey(encrypted: string): string {
  const [ivHex, authTagHex, data] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
