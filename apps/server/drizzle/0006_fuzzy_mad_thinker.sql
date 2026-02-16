ALTER TABLE "agents" ADD COLUMN "pairing_code" varchar(6);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_pairing_code_unique" UNIQUE("pairing_code");