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
