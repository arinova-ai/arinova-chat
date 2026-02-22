## 1. Server — Redis streaming content

- [x] 1.1 In `ws/handler.ts` onChunk callback, add `redis.set("stream:{messageId}", chunk, "EX", 600)` (catch errors silently)
- [x] 1.2 In `ws/handler.ts` onComplete callback, add `redis.del("stream:{messageId}")`
- [x] 1.3 In `ws/handler.ts` onError callback, add `redis.del("stream:{messageId}")`

## 2. Server — Sync enrichment

- [x] 2.1 In `handleSync`, when a missed message has `status = "streaming"`, fetch content from `redis.get("stream:{messageId}")` and use as message content in sync_response
- [x] 2.2 In `handleSync`, after sending sync_response, check if user has active streams and re-send `stream_start` + `stream_chunk` with current Redis content for each

## 3. Server — REST endpoint enrichment

- [x] 3.1 In `GET /api/conversations/:id/messages`, after loading from DB, check for `status = "streaming"` messages and supplement content from Redis

## 4. Verification

- [x] 4.1 Build server and verify no type errors
