## ADDED Requirements

### Requirement: Standardized API error response format
All API endpoints SHALL return errors in a consistent format: `{ error: string, code?: string, details?: unknown }` with appropriate HTTP status codes.

#### Scenario: Validation error
- **WHEN** client sends invalid input to any API endpoint
- **THEN** response is 400 with `{ error: "Validation failed", code: "VALIDATION_ERROR", details: [...] }`

#### Scenario: Not found
- **WHEN** client requests a resource that doesn't exist
- **THEN** response is 404 with `{ error: "Resource not found", code: "NOT_FOUND" }`

#### Scenario: Server error
- **WHEN** an internal error occurs
- **THEN** response is 500 with `{ error: "Internal server error", code: "INTERNAL_ERROR" }` (no stack trace)

### Requirement: Redis batch queries for streaming enrichment
The `enrichStreaming()` function SHALL use Redis `mget()` for batch lookups instead of individual `get()` calls.

#### Scenario: Batch enrichment
- **WHEN** 20 messages are loaded and need streaming enrichment
- **THEN** server makes 1 Redis `mget()` call instead of 20 individual `get()` calls
