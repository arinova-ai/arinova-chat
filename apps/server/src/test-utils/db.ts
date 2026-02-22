import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5458/arinova_test";

const client = postgres(DATABASE_URL);
export const testDb = drizzle(client, { schema });

const BUSINESS_TABLES = [
  "push_subscriptions",
  "notification_preferences",
  "app_purchases",
  "coin_transactions",
  "coin_balances",
  "app_versions",
  "apps",
  "developer_accounts",
  "channel_messages",
  "community_members",
  "channels",
  "communities",
  "attachments",
  "conversation_reads",
  "messages",
  "conversation_members",
  "conversations",
  "agents",
  "verification",
  "account",
  "session",
  "user",
];

export async function truncateAll() {
  await testDb.execute(
    sql.raw(`TRUNCATE TABLE ${BUSINESS_TABLES.join(", ")} CASCADE`)
  );
}

export async function closeDb() {
  await client.end();
}
