FROM node:22-bookworm-slim

# git is required by openclaw for workspace operations
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw@latest

# Pre-create .openclaw directory with correct ownership for volume mount
RUN mkdir -p /home/node/.openclaw && chown -R node:node /home/node/.openclaw

USER node
WORKDIR /home/node

EXPOSE 18789

CMD ["openclaw", "gateway", "--port", "18789", "--bind", "lan", "--allow-unconfigured"]
