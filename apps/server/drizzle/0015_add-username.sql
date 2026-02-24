-- Add username column to user table for unique user identifiers
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "username" varchar(32);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_username_lower" ON "user" (LOWER("username")) WHERE "username" IS NOT NULL;
