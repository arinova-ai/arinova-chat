# @arinova-ai/agent-sdk

TypeScript SDK for connecting AI agents to [Arinova Chat](https://chat.arinova.ai) via WebSocket. Handles authentication, streaming responses, and automatic reconnection.

## Install

```bash
npm install @arinova-ai/agent-sdk
```

## Quick Start

```ts
import { ArinovaAgent } from "@arinova-ai/agent-sdk";

const agent = new ArinovaAgent({
  serverUrl: "wss://chat.arinova.ai",
  botToken: "your-bot-token",
});

agent.onTask(async (task) => {
  // Stream chunks to the user
  task.sendChunk("Hello, ");
  task.sendChunk("I'm processing your request...\n\n");

  // Do your work here (call an LLM, run a tool, etc.)
  const result = await doSomething(task.content);

  // Send the final complete response
  task.sendComplete(result);
});

agent.on("connected", () => {
  console.log("Agent connected to Arinova Chat");
});

agent.on("disconnected", () => {
  console.log("Agent disconnected");
});

agent.on("error", (err) => {
  console.error("Agent error:", err.message);
});

await agent.connect();
```

## API Reference

### `new ArinovaAgent(options)`

Creates a new agent instance.

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `serverUrl` | `string` | Yes | -- | WebSocket server URL (e.g. `wss://chat.arinova.ai` or `ws://localhost:3501`) |
| `botToken` | `string` | Yes | -- | Bot token from the Arinova dashboard |
| `reconnectInterval` | `number` | No | `5000` | Milliseconds to wait before reconnecting after a disconnect |
| `pingInterval` | `number` | No | `30000` | Milliseconds between keep-alive pings |

### `agent.onTask(handler)`

Registers the task handler. Called each time a user sends a message to your agent. The handler receives a `TaskContext` object and may return a `Promise`.

```ts
agent.onTask(async (task: TaskContext) => {
  // handle the task
});
```

### `agent.on(event, listener)`

Subscribes to lifecycle events.

| Event | Listener Signature | Description |
|---|---|---|
| `"connected"` | `() => void` | Fired after successful authentication |
| `"disconnected"` | `() => void` | Fired when the WebSocket connection closes |
| `"error"` | `(error: Error) => void` | Fired on authentication failure, connection errors, or message parse errors |

### `agent.connect()`

Connects to the server and authenticates with the bot token. Returns a `Promise<void>` that resolves on successful authentication or rejects on auth failure.

```ts
try {
  await agent.connect();
} catch (err) {
  console.error("Failed to connect:", err);
}
```

The agent automatically reconnects on unexpected disconnects. It does **not** reconnect on authentication errors.

### `agent.disconnect()`

Closes the WebSocket connection and stops automatic reconnection.

```ts
agent.disconnect();
```

### `TaskContext`

The object passed to your `onTask` handler.

| Property | Type | Description |
|---|---|---|
| `taskId` | `string` | Unique task ID assigned by the server |
| `conversationId` | `string` | ID of the conversation this task belongs to |
| `content` | `string` | The user's message text |
| `sendChunk(chunk)` | `(chunk: string) => void` | Send a streaming text chunk to the user |
| `sendComplete(content)` | `(content: string) => void` | Mark the task as complete with the full response |
| `sendError(error)` | `(error: string) => void` | Mark the task as failed with an error message |

If your `onTask` handler throws, the SDK automatically calls `sendError` with the error message.

## Getting a Bot Token

1. Open the [Arinova Chat](https://chat.arinova.ai) dashboard.
2. Navigate to your bot settings (or create a new bot).
3. Copy the bot token from the settings page.
4. Pass the token as `botToken` when creating your `ArinovaAgent`.

Keep your bot token secret. Do not commit it to version control -- use environment variables instead.

## License

MIT
