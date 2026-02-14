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
});

export const env = envSchema.parse(process.env);
