ALTER TABLE "agents" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "category" varchar(50);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "usage_count" integer DEFAULT 0 NOT NULL;