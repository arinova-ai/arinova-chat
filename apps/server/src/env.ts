import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3501),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  CORS_ORIGIN: z.string().default("http://localhost:3500"),
  BETTER_AUTH_SECRET: z.string().default("arinova-dev-secret-change-in-production"),
  BETTER_AUTH_URL: z.string().default("http://localhost:3501"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GITHUB_CLIENT_ID: z.string().default(""),
  GITHUB_CLIENT_SECRET: z.string().default(""),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_FILE_SIZE: z.coerce.number().default(10 * 1024 * 1024), // 10MB
  // Cloudflare R2 (optional — falls back to local disk if not set)
  R2_ENDPOINT: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET: z.string().default("arinova-uploads"),
  R2_PUBLIC_URL: z.string().default(""),
  // Comma-separated list of admin email addresses
  ADMIN_EMAILS: z.string().default(""),
  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@arinova.ai"),
  // Voice / WebRTC (mediasoup)
  MEDIASOUP_LISTEN_IP: z.string().default("0.0.0.0"),
  MEDIASOUP_ANNOUNCED_IP: z.string().default(""),
  MEDIASOUP_RTC_MIN_PORT: z.coerce.number().default(40000),
  MEDIASOUP_RTC_MAX_PORT: z.coerce.number().default(49999),
  STUN_SERVERS: z.string().default("stun:stun.l.google.com:19302"),
  TURN_SERVERS: z.string().default(""),
  TURN_USERNAME: z.string().default(""),
  TURN_CREDENTIAL: z.string().default(""),
  // Sentry error tracking (optional)
  SENTRY_DSN: z.string().default(""),
});

export const env = envSchema.parse(process.env);
