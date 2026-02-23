ALTER TABLE "agents" DROP CONSTRAINT "agents_pairing_code_unique";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "pairing_code";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "pairing_code_expires_at";