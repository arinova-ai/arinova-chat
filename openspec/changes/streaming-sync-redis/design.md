## Context

Currently the streaming data flow is:

```
Agent chunk → Server onChunk → sendToUser(stream_chunk) → Frontend updates in-memory
                                 ↓
                          DB stays: content="", status="streaming"
                                 ↓
Agent complete → Server onComplete → DB: content=full, status="completed"
```

If WS disconnects mid-stream, the client loses all chunks received so far. Sync reads DB and gets empty content. Refresh loads empty content from REST API.

## Goals / Non-Goals

**Goals:**
- User switching apps and returning sees current streaming content, not stale/empty
- Page refresh mid-stream shows current content and resumes receiving chunks
- Minimal latency impact on chunk delivery

**Non-Goals:**
- Persisting chunks to DB (too expensive for high-frequency writes)
- Multi-server streaming handoff (single-server architecture for now)
- Guaranteeing zero chunk loss (best-effort recovery is sufficient)

## Decisions

### 1. Redis key design: `stream:{messageId}`

**Choice**: Simple key-value, SET on every chunk (replacing previous value), DEL on complete/error. TTL of 600s (matching task idle timeout).

**Why not append-only**: Each chunk from the agent SDK is the full accumulated text (not a delta). So a simple SET replaces the previous value — no need for append.

**Why 600s TTL**: Matches `TASK_IDLE_TIMEOUT_MS` in agent-handler. If a stream orphans, Redis auto-cleans.

### 2. Write Redis in onChunk callback

**Choice**: Add `redis.set("stream:{messageId}", chunk, "EX", 600)` inside the existing `onChunk` handler.

**Why**: Minimal code change, directly in the data path. Redis SET is ~0.1ms, negligible vs chunk transit time.

### 3. Sync handler enrichment

**Choice**: In `handleSync`, when a missed message has `status = "streaming"`, do `redis.get("stream:{messageId}")` and use that as the content in `sync_response`.

**Why**: Sync already detects streaming messages (it has the `activeStreams` check). Just need to supplement content.

### 4. REST messages endpoint enrichment

**Choice**: In `GET /api/conversations/:id/messages`, after loading from DB, check if any message has `status = "streaming"` and supplement content from Redis.

**Why**: Handles page refresh scenario. Same pattern as sync.

### 5. Reconnect re-attach

**Choice**: When a user WS connects and sends `sync`, if they have an active stream, server re-sends `stream_start` for that message, then sends current Redis content as an immediate `stream_chunk`. Subsequent chunks flow normally.

**Why**: Frontend already handles `stream_start` → creates streaming message entry. The initial chunk catches it up. Then normal chunk flow resumes.

## Risks / Trade-offs

- **[Redis write on every chunk]** → SET is fast (~0.1ms), but high-frequency. Mitigation: could throttle to every N chunks if needed, but unlikely to be an issue at current scale.
- **[Chunk received between sync and re-attach]** → Small window where a chunk could be missed. Mitigation: acceptable since next chunk is full text replacement, not delta.
- **[Redis down]** → Streaming still works normally (just no recovery). Graceful degradation — catch Redis errors silently.
