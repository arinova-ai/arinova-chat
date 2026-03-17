# @arinova/spaces-sdk

OAuth PKCE SDK for Arinova Spaces — authenticate users without exposing secrets.

## Installation

```bash
npm install @arinova/spaces-sdk
```

## Quick Start

```js
import { Arinova } from "@arinova/spaces-sdk";

const arinova = new Arinova({ appId: "your-client-id" });

// Trigger login (opens popup)
const token = await arinova.login();
console.log(token.user.name);       // "Alice"
console.log(token.access_token);    // Bearer token for API calls
```

## Setup

1. Register your app: `arinova-cli app create --name "My App" --redirect-uri "https://myapp.com"`
2. Copy the `Client ID` from the output
3. No `client_secret` needed — all apps use PKCE

## API

### `new Arinova(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appId` | `string` | *required* | Your OAuth app client_id |
| `endpoint` | `string` | `https://chat.arinova.ai` | Arinova server URL |
| `redirectUri` | `string` | `{origin}/callback` | OAuth callback URL |
| `scope` | `string` | `"profile"` | OAuth scope |

### `arinova.login(): Promise<TokenResponse>`

Opens a popup for user authorization (PKCE flow). Returns:

```ts
{
  access_token: string;
  token_type: "Bearer";
  expires_in: 604800;  // 7 days
  scope: "profile";
  user: { id, name, email, image };
}
```

### `arinova.handleCallback(): Promise<TokenResponse>`

Call on your redirect_uri page to complete the flow (for redirect mode instead of popup).

## PKCE Flow

1. SDK generates `code_verifier` (random) and `code_challenge = BASE64URL(SHA256(code_verifier))`
2. User is redirected to Arinova with `code_challenge`
3. After authorization, Arinova redirects back with `code`
4. SDK exchanges `code` + `code_verifier` for `access_token` (no secret needed)

## redirect_uri Rules

- Origin match: scheme + host + port must match your registered URI
- Path can differ (SDK uses `window.location.origin + /callback` by default)
- Must use HTTPS in production
- `http://localhost` is allowed for development

## Example: Redirect Mode

If popups are blocked, use redirect mode:

```js
// On login page:
const arinova = new Arinova({
  appId: "your-client-id",
  redirectUri: "https://myapp.com/auth/callback",
});
arinova.login(); // Will redirect if popup is blocked

// On callback page (/auth/callback):
const arinova = new Arinova({
  appId: "your-client-id",
  redirectUri: "https://myapp.com/auth/callback",
});
const token = await arinova.handleCallback();
```
