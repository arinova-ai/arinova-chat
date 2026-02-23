FROM node:22-bookworm-slim

RUN npm install -g openclaw@latest

USER node
WORKDIR /home/node

EXPOSE 18789

CMD ["openclaw", "gateway", "--port", "18789", "--bind", "lan", "--allow-unconfigured"]
