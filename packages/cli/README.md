# Arinova Creator CLI

Command-line tool for managing Arinova Creator resources.

## Installation

```bash
npm install -g @arinova/cli
```

## Authentication

### Browser login (recommended)

```bash
arinova-cli auth login
```

Opens your browser to generate a CLI token. The token is automatically saved.

### Manual token

If browser login doesn't work, visit your Arinova dashboard to generate an API key, then:

```bash
arinova-cli auth set-key <your-token>
```

Tokens must start with `ari_` (e.g., `ari_cli_...`).

### Verify

```bash
arinova-cli auth whoami
```

## Configuration

```bash
# Use staging environment
arinova-cli --staging <command>

# Or set endpoint permanently
arinova-cli config set endpoint https://chat-staging.arinova.ai

# Or use environment variable
export ARINOVA_ENDPOINT=https://chat-staging.arinova.ai

# Show current config
arinova-cli config show
```

## Spaces

### Create a space

```bash
arinova-cli space create --name "My Game" --url "https://example.com/game"
```

The `--url` parameter sets the `iframeUrl` in the space definition. This is **required** for the "Play Now" button to appear on the space page. Without it, users cannot launch the space.

### Other space commands

```bash
arinova-cli space list                          # List your spaces
arinova-cli space show <id>                     # Show space details
arinova-cli space update <id> --url <new-url>   # Update iframe URL
arinova-cli space publish <id>                  # Make space public
arinova-cli space unpublish <id>                # Make space private
arinova-cli space delete <id>                   # Delete a space
```

## OAuth Apps

Register and manage OAuth apps for third-party integrations.

### Create an OAuth app

```bash
arinova-cli app create --name "My Game" --redirect-uri "https://mygame.com/callback"
```

On success, the CLI prints `clientId` and `clientSecret`. **Save the secret immediately** — it cannot be retrieved again.

### App commands

```bash
arinova-cli app list                              # List your apps
arinova-cli app show <id>                         # Show app details
arinova-cli app credentials <id>                  # Show client ID + redirect URIs
arinova-cli app update <id> --redirect-uri <uri>  # Update redirect URI
arinova-cli app regenerate-secret <id>            # Regenerate client secret
arinova-cli app delete <id>                       # Delete an app
```

### Using your OAuth app

In your web app, initialize the Arinova SDK:

```js
Arinova.init({ appId: "<your-client-id>" });
```

### Public vs Confidential Clients

| | Public (SPA) | Confidential (Server) |
|---|---|---|
| Create | `--public` flag | Default |
| Secret | Not needed | Required for token exchange |
| Security | Uses PKCE (code_challenge) | Uses client_secret |
| Use case | Browser apps, mobile apps | Server-side apps |

### OAuth Flow — Confidential Client

1. Redirect to `https://chat.arinova.ai/oauth/authorize?client_id=<id>&redirect_uri=<uri>&scope=profile&state=<random>`
2. User authorizes on Arinova
3. Arinova redirects to your `redirect_uri` with `?code=<auth-code>&state=<state>`
4. Exchange code: `POST /oauth/token` with `{ grant_type: "authorization_code", client_id, client_secret, code, redirect_uri }`
5. Use the access token (Bearer) to call Arinova APIs

### OAuth Flow — Public Client (PKCE)

1. Generate a random `code_verifier` (43-128 chars, URL-safe)
2. Compute `code_challenge = BASE64URL(SHA256(code_verifier))`
3. Redirect to `https://chat.arinova.ai/oauth/authorize?client_id=<id>&redirect_uri=<uri>&scope=profile&state=<random>&code_challenge=<challenge>&code_challenge_method=S256`
4. User authorizes on Arinova
5. Arinova redirects to your `redirect_uri` with `?code=<auth-code>&state=<state>`
6. Exchange code: `POST /oauth/token` with `{ grant_type: "authorization_code", client_id, code, redirect_uri, code_verifier }` (no client_secret)
7. Use the access token (Bearer) to call Arinova APIs

### redirect_uri rules

- Origin match: scheme + host + port must match (path can differ)
- Must use HTTPS in production
- `http://localhost:*` is allowed for development

### Web UI

You can also manage OAuth apps at `/developer` in the Arinova web interface.

## Other Commands

```bash
arinova-cli agent list          # List your agents
arinova-cli sticker list        # List your sticker packs
arinova-cli theme list          # List your themes
arinova-cli community list      # List your communities
arinova-cli stats               # Show creator stats
```

## Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--staging` | Use staging endpoint |
