/**
 * Test database setup for integration tests.
 *
 * Connects to the `arinova_test` database and provides helpers
 * for running migrations and truncating tables between tests.
 *
 * Usage in vitest.config.ts:
 *   globalSetup: ["./src/test/setup-db.ts"]
 *
 * Or import directly in test files:
 *   import { testDb, truncateAll } from "../test/setup-db.js";
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://arinova:arinova_dev@localhost:5458/arinova_test";

const client = postgres(TEST_DATABASE_URL);
export const testDb = drizzle(client, { schema });

/** Table names in reverse-FK order for safe truncation */
const TABLES = [
  "playground_transactions",
  "play_coin_balances",
  "playground_messages",
  "playground_participants",
  "playground_sessions",
  "playgrounds",
  "notification_preferences",
  "push_subscriptions",
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
  "messages",
  "conversation_members",
  "conversations",
  "agents",
  "verification",
  "account",
  "session",
  "user",
];

/** Truncate all tables (CASCADE) — call in beforeEach or afterEach */
export async function truncateAll() {
  await testDb.execute(
    sql.raw(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`)
  );
}

/** Close the database connection */
export async function closeTestDb() {
  await client.end();
}
