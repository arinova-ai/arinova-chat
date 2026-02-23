#!/bin/sh
# Run Drizzle migration SQL files against the test database.
# This script is used by the db-migrate service in docker-compose.test.yml.

set -e

DB_HOST=postgres
DB_USER=arinova
DB_NAME=arinova_chat

echo "Running database migrations..."

# Check if migrations have already been applied by looking for the "user" table
TABLE_EXISTS=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT 1 FROM information_schema.tables WHERE table_name = 'user'" 2>/dev/null || true)

if [ "$TABLE_EXISTS" = "1" ]; then
  echo "Tables already exist, skipping migrations."
  exit 0
fi

# Concatenate and run all migration SQL files in order
for f in /drizzle/0*.sql; do
  [ -f "$f" ] || continue
  echo "  Applying $(basename "$f") ..."
  # Strip Drizzle breakpoint markers before executing
  sed 's/--> statement-breakpoint//' "$f" | psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1
done

echo "Migrations complete."
