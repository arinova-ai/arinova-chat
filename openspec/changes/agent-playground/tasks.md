## 1. Playground Schema & Types

- [x] 1.1 Define `PlaygroundDefinition` TypeScript types in `packages/shared/src/types/` (metadata, roles, phases, actions, win conditions, economy)
- [x] 1.2 Define `Playground`, `PlaygroundSession`, `PlaygroundParticipant`, `PlaygroundState` types
- [x] 1.3 Create Zod validation schemas for PlaygroundDefinition in `packages/shared/src/schemas/`
- [x] 1.4 Write unit tests for playground schema validation

## 2. Database Schema

- [x] 2.1 Create `playgrounds` table (id, ownerId, name, description, category, tags, definition, isPublic, createdAt, updatedAt)
- [x] 2.2 Create `playground_sessions` table (id, playgroundId, status, state, currentPhase, startedAt, finishedAt)
- [x] 2.3 Create `playground_participants` table (id, sessionId, userId, agentId, role, controlMode, joinedAt)
- [x] 2.4 Create `playground_messages` table (id, sessionId, participantId, type, content, createdAt)
- [x] 2.5 Create `play_coin_balances` table (userId, balance, lastGrantedAt) and `playground_transactions` table (id, userId, sessionId, type, currency, amount, createdAt)
- [x] 2.6 Run Drizzle migrations for all new tables

## 3. Playground CRUD API

- [x] 3.1 Create `POST /api/playgrounds` endpoint — validate definition, store playground
- [x] 3.2 Create `GET /api/playgrounds` endpoint — list with pagination, search, category filter
- [x] 3.3 Create `GET /api/playgrounds/:id` endpoint — detail with session status and participant count
- [x] 3.4 Create `DELETE /api/playgrounds/:id` endpoint — owner-only deletion
- [x] 3.5 Add auth middleware to all playground routes

## 4. Playground Session API

- [x] 4.1 Create `POST /api/playgrounds/:id/join` endpoint — join with selected agent, deduct entry fee if applicable, create participant
- [x] 4.2 Create `POST /api/playgrounds/:id/leave` endpoint — remove participant, handle active session
- [x] 4.3 Create `POST /api/playgrounds/:id/start` endpoint — host-only, validate player count, assign roles, start first phase
- [x] 4.4 Create `GET /api/playgrounds/:id/session` endpoint — get current session state (filtered by role)

## 5. Playground Runtime Engine

- [x] 5.1 Implement playground state machine (waiting → active → paused → finished)
- [x] 5.2 Implement role assignment logic (random distribution based on definition)
- [x] 5.3 Implement phase management (transition on timer expiry or condition met)
- [x] 5.4 Implement action validation (check phase, role, target, parameters)
- [x] 5.5 Implement action execution and state mutation
- [x] 5.6 Implement per-role state filtering for broadcast
- [x] 5.7 Implement win condition evaluation
- [x] 5.8 Implement state size limit enforcement

## 6. Playground WebSocket

- [x] 6.1 Create `/ws/playground` WebSocket endpoint with auth
- [x] 6.2 Implement session join/leave events
- [x] 6.3 Implement action submission via WebSocket
- [x] 6.4 Implement state broadcast with per-role filtering
- [x] 6.5 Implement phase transition notifications
- [x] 6.6 Implement reconnection handling (send current state on reconnect)
- [x] 6.7 Implement Redis pub/sub for cross-instance broadcast

## 7. Agent Integration

- [x] 7.1 Implement agent WebSocket connection to playground session
- [x] 7.2 Convert playground state + available actions into agent-consumable format (system prompt + tool definitions)
- [x] 7.3 Implement agent action routing (agent tool call → validate → execute)
- [x] 7.4 Implement control mode switching (agent/human) per participant
- [x] 7.5 Deliver phase transitions and events as agent system messages

## 8. Playground Creation Flow

- [x] 8.1 Write playground creation specification document (md) — define format, guidelines, examples for agents
- [x] 8.2 Implement system agent endpoint for playground generation (accepts user description, returns PlaygroundDefinition)
- [x] 8.3 Implement playground definition validation pipeline (schema check → store)
- [x] 8.4 Create built-in Werewolf (狼人殺) playground template

## 9. Frontend — Sidebar & Navigation

- [x] 9.1 Add "Playground" entry to sidebar navigation
- [x] 9.2 Create playground Zustand store (playgrounds list, active session, participants, state)
- [x] 9.3 Set up playground routing (`/playground`, `/playground/:id`)

## 10. Frontend — Playground List Page

- [x] 10.1 Build playground list page with card grid layout
- [x] 10.2 Implement search and category filter UI
- [x] 10.3 Build playground card component (name, description, category tag, player count, status, join button)

## 11. Frontend — Playground Creation UI

- [x] 11.1 Build "Create Playground" dialog with chat-style interface
- [x] 11.2 Integrate system agent for definition generation
- [x] 11.3 Build playground definition preview component (roles, phases, rules display)
- [x] 11.4 Implement publish and revise flow

## 12. Frontend — Playground Session UI

- [x] 12.1 Build waiting room UI (participant list, count, start button for host)
- [x] 12.2 Build agent selection dialog for joining
- [x] 12.3 Build active session layout (phase display, timer, state view, action panel, participant list)
- [x] 12.4 Build action buttons and parameter inputs (e.g., target player selector)
- [x] 12.5 Build phase transition animation/notification
- [x] 12.6 Build game result screen (winner, role reveal, summary)
- [x] 12.7 Integrate playground WebSocket for real-time updates

## 13. Werewolf Demo Playground

- [x] 13.1 Design werewolf PlaygroundDefinition (roles: villager, werewolf, seer, witch, hunter; phases: night, day-discuss, day-vote)
- [x] 13.2 Implement werewolf-specific win conditions (all werewolves dead OR werewolves >= villagers)
- [x] 13.3 Write werewolf agent system prompts per role
- [x] 13.4 Test full game loop with multiple users and agents
- [x] 13.5 Seed werewolf template in database on first run

## 14. Playground Economy — Play Coins

- [x] 14.1 Implement Play Coins daily grant API (`POST /api/playground/coins/claim`) — check lastGrantedAt, credit balance
- [x] 14.2 Implement Play Coins balance API (`GET /api/playground/coins/balance`) — return play coins and arinova coins balances
- [x] 14.3 Implement Play Coins balance display in frontend (wallet section or playground header)

## 15. Playground Economy — Prize Pool & Settlement

- [x] 15.1 Implement entry fee collection on session join (deduct from balance, add to prize pool)
- [x] 15.2 Implement entry fee refund on session cancellation
- [x] 15.3 Implement prize distribution engine (winner-takes-all, ranked percentage split)
- [x] 15.4 Implement platform commission deduction for Arinova Coins sessions
- [x] 15.5 Implement automatic settlement on session finish (distribute prize pool to winners)

## 16. Playground Economy — Betting

- [x] 16.1 Implement per-round betting action (validate min/max, deduct from balance, add to round pot)
- [x] 16.2 Implement round pot settlement (distribute to round winners)
- [x] 16.3 Add betting UI components (bet input, pot display, bet history)

## 17. Playground Economy — Transaction Ledger

- [x] 17.1 Implement transaction ledger recording for all economy events (entry, bet, win, refund, commission)
- [x] 17.2 Implement transaction history API (`GET /api/playground/transactions`) with pagination
- [x] 17.3 Build transaction history UI in frontend
