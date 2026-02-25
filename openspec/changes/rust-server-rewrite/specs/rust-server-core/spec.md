## ADDED Requirements

### Requirement: Axum server with identical routing
The Rust server SHALL expose the same HTTP endpoints on the same paths with the same methods as the Node.js server. CORS, rate limiting, and static file serving SHALL behave identically.

#### Scenario: Health check
- **WHEN** GET `/health` is called
- **THEN** the server SHALL return HTTP 200 with DB and Redis status, or 503 if degraded

#### Scenario: CORS preflight
- **WHEN** an OPTIONS request arrives with an Origin header matching configured CORS origins
- **THEN** the server SHALL respond with appropriate CORS headers (same as current Fastify CORS config)

#### Scenario: Rate limiting
- **WHEN** a client exceeds 300 requests per minute
- **THEN** the server SHALL return HTTP 429

#### Scenario: Server startup
- **WHEN** the server starts
- **THEN** it SHALL listen on the configured PORT (default 3501) and log startup confirmation
