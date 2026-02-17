ALTER TABLE "agents" ADD COLUMN "secret_token" varchar(64);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_secret_token_unique" UNIQUE("secret_token");