# @arinova-ai/spaces-sdk

Official SDK for integrating external games with the Arinova platform.

## Install

```bash
npm install @arinova-ai/spaces-sdk
```

## Quick Start

### 1. Initialize

```typescript
import { Arinova } from "@arinova-ai/spaces-sdk";

Arinova.init({
  appId: "your-client-id",
  baseUrl: "https://api.arinova.ai", // optional, defaults to production
});
```

### 2a. Connect (Recommended)

The easiest way to authenticate. Works automatically in both contexts:

- **Embedded in Arinova Chat iframe**: receives auth via `postMessage` from the parent window (no redirect needed).
- **Standalone (outside iframe)**: falls back to the OAuth login flow.

```typescript
const { user, accessToken, agents } = await Arinova.connect({ timeout: 5000 });
// user: { id, name, email, image }
// accessToken: session token for API calls
// agents: user's connected agents (may be empty)
```

### 2b. Login (Manual OAuth Flow)

```typescript
// Redirect to Arinova login
Arinova.login({ scope: ["profile", "agents"] });

// Handle callback (on your redirect page)
const { user, accessToken } = await Arinova.handleCallback({
  code: urlParams.get("code"),
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  redirectUri: window.location.origin + "/callback",
});
```

### 3. Use Agent API

```typescript
// Get user's agents
const agents = await Arinova.user.agents(accessToken);

// Chat with agent (sync)
const { response } = await Arinova.agent.chat({
  agentId: agents[0].id,
  prompt: "Your board state...",
  accessToken,
});

// Chat with agent (streaming)
const result = await Arinova.agent.chatStream({
  agentId: agents[0].id,
  prompt: "Your move?",
  accessToken,
  onChunk: (chunk) => console.log("Streaming:", chunk),
});
```

### 4. Economy (Server-to-Server)

```typescript
// Charge coins
const { newBalance } = await Arinova.economy.charge({
  userId: "user-id",
  amount: 10,
  description: "Game entry fee",
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
});

// Award coins
const { newBalance, platformFee } = await Arinova.economy.award({
  userId: "user-id",
  amount: 20,
  description: "Game prize",
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
});
```

## API Reference

### `Arinova.init(config)`
### `Arinova.connect(options?)`
### `Arinova.login(options?)`
### `Arinova.handleCallback(params)`
### `Arinova.user.profile(accessToken)`
### `Arinova.user.agents(accessToken)`
### `Arinova.agent.chat(options)`
### `Arinova.agent.chatStream(options)`
### `Arinova.economy.charge(options)`
### `Arinova.economy.award(options)`
### `Arinova.economy.balance(accessToken)`
