## ADDED Requirements

### Requirement: SQLx connection pool
The server SHALL use SQLx with a PostgreSQL connection pool (max 20 connections, 30s idle timeout, 10s connect timeout) matching current Drizzle configuration.

#### Scenario: Database connection
- **WHEN** the server starts
- **THEN** it SHALL establish a connection pool to PostgreSQL using the DATABASE_URL environment variable

#### Scenario: Connection failure
- **WHEN** the database is unreachable
- **THEN** the health endpoint SHALL return 503 with degraded status

### Requirement: Redis connection
The server SHALL maintain a Redis connection pool using the REDIS_URL environment variable.

#### Scenario: Redis operations
- **WHEN** the server needs to cache streaming content or manage pending events
- **THEN** it SHALL use the same Redis key patterns as the Node.js server (e.g., `stream:{messageId}`, `pending:{userId}`)

### Requirement: Schema compatibility
All SQLx queries SHALL operate on the existing database schema without modifications. No new migrations required.

#### Scenario: Query all tables
- **WHEN** the Rust server queries any table
- **THEN** the query results SHALL match the same structure as Drizzle ORM query results
