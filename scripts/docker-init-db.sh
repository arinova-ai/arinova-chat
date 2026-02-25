#!/bin/sh
# Run Drizzle migration SQL files against the test database.
# This script is used by the db-migrate service in docker-compose.test.yml.

set -e

DB_HOST=postgres
DB_USER=arinova
DB_NAME=arinova_chat

echo "Running database migrations..."

# Create migration tracking table if not exists
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
  "CREATE TABLE IF NOT EXISTS drizzle_migrations (tag TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT NOW());" \
  2>/dev/null

# Run each migration file if not already applied
for f in /drizzle/0*.sql; do
  [ -f "$f" ] || continue
  TAG=$(basename "$f" .sql)

  # Check if already applied
  APPLIED=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT 1 FROM drizzle_migrations WHERE tag = '$TAG'" 2>/dev/null || true)

  if [ "$APPLIED" = "1" ]; then
    continue
  fi

  echo "  Applying $TAG ..."
  sed 's/--> statement-breakpoint//' "$f" | psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1

  # Record migration
  psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
    "INSERT INTO drizzle_migrations (tag) VALUES ('$TAG');" 2>/dev/null
done

echo "Migrations complete."
