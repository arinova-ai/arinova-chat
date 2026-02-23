CREATE TYPE "public"."playground_category" AS ENUM('game', 'strategy', 'social', 'puzzle', 'roleplay', 'other');--> statement-breakpoint
CREATE TYPE "public"."playground_control_mode" AS ENUM('agent', 'human', 'copilot');--> statement-breakpoint
CREATE TYPE "public"."playground_currency" AS ENUM('free', 'play', 'arinova');--> statement-breakpoint
CREATE TYPE "public"."playground_message_type" AS ENUM('chat', 'action', 'system', 'phase_transition');--> statement-breakpoint
CREATE TYPE "public"."playground_session_status" AS ENUM('waiting', 'active', 'paused', 'finished');--> statement-breakpoint
CREATE TYPE "public"."playground_transaction_type" AS ENUM('entry_fee', 'bet', 'win', 'refund', 'commission');--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"global_enabled" boolean DEFAULT true NOT NULL,
	"message_enabled" boolean DEFAULT true NOT NULL,
	"playground_invite_enabled" boolean DEFAULT true NOT NULL,
	"playground_turn_enabled" boolean DEFAULT true NOT NULL,
	"playground_result_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_start" varchar(5),
	"quiet_hours_end" varchar(5),
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "play_coin_balances" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"last_granted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "playground_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" uuid,
	"type" "playground_message_type" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playground_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" uuid,
	"role" varchar(100),
	"controlMode" "playground_control_mode" DEFAULT 'human' NOT NULL,
	"is_connected" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playground_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playground_id" uuid NOT NULL,
	"status" "playground_session_status" DEFAULT 'waiting' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_phase" varchar(100),
	"prize_pool" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playground_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"session_id" uuid,
	"type" "playground_transaction_type" NOT NULL,
	"currency" "playground_currency" NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playgrounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"category" "playground_category" NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"definition" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"device_info" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_coin_balances" ADD CONSTRAINT "play_coin_balances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_messages" ADD CONSTRAINT "playground_messages_session_id_playground_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."playground_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_messages" ADD CONSTRAINT "playground_messages_participant_id_playground_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."playground_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_participants" ADD CONSTRAINT "playground_participants_session_id_playground_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."playground_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_participants" ADD CONSTRAINT "playground_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_participants" ADD CONSTRAINT "playground_participants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_sessions" ADD CONSTRAINT "playground_sessions_playground_id_playgrounds_id_fk" FOREIGN KEY ("playground_id") REFERENCES "public"."playgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_transactions" ADD CONSTRAINT "playground_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_transactions" ADD CONSTRAINT "playground_transactions_session_id_playground_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."playground_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playgrounds" ADD CONSTRAINT "playgrounds_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;