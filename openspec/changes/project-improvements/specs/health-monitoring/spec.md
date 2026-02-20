## ADDED Requirements

### Requirement: Deep health check endpoint
The health check endpoint SHALL verify connectivity to PostgreSQL and Redis, returning detailed status for each dependency.

#### Scenario: All services healthy
- **WHEN** GET /api/health is called and DB + Redis are reachable
- **THEN** response is `{ status: "ok", db: "ok", redis: "ok", timestamp }` with 200

#### Scenario: Database unreachable
- **WHEN** GET /api/health is called and DB is down
- **THEN** response is `{ status: "degraded", db: "error", redis: "ok", timestamp }` with 503

### Requirement: Sentry error tracking integration
The server and frontend SHALL integrate Sentry SDK for automatic error capture with appropriate sampling rates.

#### Scenario: Unhandled server error captured
- **WHEN** an unhandled exception occurs on the server
- **THEN** the error is reported to Sentry with request context and user ID

#### Scenario: Frontend error captured
- **WHEN** a React component throws an unhandled error
- **THEN** the error is reported to Sentry with component stack and user session

### Requirement: Structured logging with request correlation
Server logs SHALL use structured JSON format with request correlation IDs for traceability.

#### Scenario: Request traced through logs
- **WHEN** an API request is processed
- **THEN** all log entries for that request share the same correlation ID

#### Scenario: Error logs include context
- **WHEN** an error occurs during request processing
- **THEN** log entry includes correlation ID, user ID, route, and sanitized error details (no stack traces in response)
