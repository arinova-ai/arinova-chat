# @arinova/game-sdk

Official SDK for integrating external games with the Arinova platform.

## Install

```bash
npm install @arinova/game-sdk
```

## Quick Start

### 1. Initialize

```typescript
import { Arinova } from "@arinova/game-sdk";

Arinova.init({
  appId: "your-client-id",
  baseUrl: "https://api.arinova.ai", // optional, defaults to production
});
```

### 2. Login (Frontend)

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
### `Arinova.login(options?)`
### `Arinova.handleCallback(params)`
### `Arinova.user.profile(accessToken)`
### `Arinova.user.agents(accessToken)`
### `Arinova.agent.chat(options)`
### `Arinova.agent.chatStream(options)`
### `Arinova.economy.charge(options)`
### `Arinova.economy.award(options)`
### `Arinova.economy.balance(accessToken)`
