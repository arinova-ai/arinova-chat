ALTER TABLE "agents" ADD COLUMN "system_prompt" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "welcome_message" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "quick_replies" jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "notifications_enabled" boolean DEFAULT true NOT NULL;