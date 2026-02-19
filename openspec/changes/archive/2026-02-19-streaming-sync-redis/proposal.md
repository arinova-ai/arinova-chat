## Why

During streaming, message content only exists in WebSocket transit — the DB stores `content: "", status: "streaming"`. When a user switches apps and returns (WS reconnects), or refreshes the page mid-stream, they see either stale content with a stuck spinner, or empty content with a spinner. The sync mechanism has no way to recover in-flight streaming content because it only reads from DB.

## What Changes

- Server writes current streaming content to Redis on every chunk (`stream:{messageId}`)
- On stream completion or error, Redis key is deleted
- Sync handler: when a message has `status = "streaming"`, fetch current content from Redis and include in `sync_response`
- REST messages endpoint: same treatment — if `status = "streaming"`, supplement content from Redis
- WS reconnect: if user has an active stream, server re-sends `stream_start` + current content as initial chunk so frontend seamlessly resumes
- Redis keys have TTL (10 min) as safety net for orphaned streams

## Capabilities

### New Capabilities
- `streaming-content-recovery`: Persist in-flight streaming content to Redis for sync/reconnect recovery

### Modified Capabilities
<!-- None -->

## Impact

- **Backend**: `ws/handler.ts` — onChunk writes Redis, onComplete/onError deletes; sync handler reads Redis for streaming messages; reconnect re-attaches to active streams
- **Backend**: `routes/conversations.ts` — messages endpoint checks Redis for streaming content
- **Frontend**: minimal — sync_response already handles message content updates; reconnect flow gets stream_start which frontend already processes
- **Redis**: new key pattern `stream:{messageId}` with 10-min TTL
