CREATE TYPE "public"."app_status" AS ENUM('draft', 'submitted', 'scanning', 'in_review', 'published', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."app_version_status" AS ENUM('submitted', 'scanning', 'in_review', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."coin_transaction_type" AS ENUM('topup', 'purchase', 'refund', 'payout', 'earning');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('completed', 'refunded');--> statement-breakpoint
CREATE TABLE "app_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"app_version_id" uuid NOT NULL,
	"product_id" varchar(100) NOT NULL,
	"amount" integer NOT NULL,
	"status" "purchase_status" DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"version" varchar(50) NOT NULL,
	"manifest_json" jsonb NOT NULL,
	"package_path" text NOT NULL,
	"status" "app_version_status" DEFAULT 'submitted' NOT NULL,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"app_id" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"icon" text NOT NULL,
	"status" "app_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "apps_app_id_unique" UNIQUE("app_id")
);
--> statement-breakpoint
CREATE TABLE "coin_balances" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "coin_transaction_type" NOT NULL,
	"amount" integer NOT NULL,
	"related_app_id" uuid,
	"related_product_id" varchar(100),
	"receipt_id" varchar(255),
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"contact_email" varchar(255) NOT NULL,
	"payout_info" text,
	"terms_accepted_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "developer_accounts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "app_purchases" ADD CONSTRAINT "app_purchases_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_purchases" ADD CONSTRAINT "app_purchases_app_version_id_app_versions_id_fk" FOREIGN KEY ("app_version_id") REFERENCES "public"."app_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_versions" ADD CONSTRAINT "app_versions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_developer_id_developer_accounts_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developer_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_balances" ADD CONSTRAINT "coin_balances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_related_app_id_apps_id_fk" FOREIGN KEY ("related_app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD CONSTRAINT "developer_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;