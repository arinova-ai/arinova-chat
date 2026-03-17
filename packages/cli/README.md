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

**OAuth flow:**

1. Your app redirects users to `https://chat.arinova.ai/oauth/authorize?client_id=<id>&redirect_uri=<uri>&scope=profile&state=<random>`
2. User authorizes on Arinova
3. Arinova redirects back to your `redirect_uri` with `?code=<auth-code>&state=<state>`
4. Your server exchanges the code for an access token: `POST /oauth/token` with `{ client_id, client_secret, code, redirect_uri }`
5. Use the access token to call Arinova APIs on behalf of the user

**redirect_uri rules:**
- Must match exactly what was registered (strict comparison)
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
