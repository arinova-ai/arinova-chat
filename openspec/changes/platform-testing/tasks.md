## 1. Test Infrastructure

- [ ] 1.1 Configure Vitest coverage (Istanbul provider) for all packages
- [ ] 1.2 Add `test:coverage` script to root package.json
- [ ] 1.3 Create test utility: mock user factory (`createMockUser()`)
- [ ] 1.4 Create test utility: mock agent factory (`createMockAgent()`)
- [ ] 1.5 Create test utility: mock conversation factory (`createMockConversation()`)
- [ ] 1.6 Create test utility: auth helper (`createAuthContext()`) for server route tests
- [ ] 1.7 Create test database setup script (create `arinova_test` db, run migrations, truncate helper)
- [ ] 1.8 Add Docker Compose test profile for test database

## 2. Shared Package — Missing Tests

- [ ] 2.1 Write manifest validation tests (valid manifest, missing fields, invalid enums, static vs dynamic mode) — marketplace task 1.3
- [ ] 2.2 Write static scanner tests (clean code passes, each forbidden pattern detected) — marketplace task 4.3

## 3. Server — Auth & Middleware Tests

- [ ] 3.1 Test auth middleware: authenticated request passes with user context
- [ ] 3.2 Test auth middleware: unauthenticated request returns 401
- [ ] 3.3 Test auth middleware: expired/invalid session returns 401
- [ ] 3.4 Test rate limiting middleware

## 4. Server — Agent API Tests

- [ ] 4.1 Test `POST /api/agents` — create agent (valid data, invalid data, missing fields)
- [ ] 4.2 Test `GET /api/agents` — list agents (own agents, public agents)
- [ ] 4.3 Test `GET /api/agents/:id` — get agent (exists, not found, not owner)
- [ ] 4.4 Test `PUT /api/agents/:id` — update agent (valid, invalid, not owner)
- [ ] 4.5 Test `DELETE /api/agents/:id` — delete agent (owner, not owner)
- [ ] 4.6 Test `POST /api/agents/pair` — bot token pairing

## 5. Server — Conversation API Tests

- [ ] 5.1 Test `POST /api/conversations` — create direct conversation (valid, invalid agent)
- [ ] 5.2 Test `GET /api/conversations` — list conversations (own only)
- [ ] 5.3 Test `GET /api/conversations/:id` — get conversation (own, not own)
- [ ] 5.4 Test `PUT /api/conversations/:id` — update conversation (rename, pin)
- [ ] 5.5 Test `DELETE /api/conversations/:id` — delete conversation
- [ ] 5.6 Test `DELETE /api/conversations/:id/messages` — clear messages

## 6. Server — Group Conversation Tests

- [ ] 6.1 Test `POST /api/groups` — create group (valid, invalid, too few agents)
- [ ] 6.2 Test `GET /api/groups` — list groups
- [ ] 6.3 Test group member management

## 7. Server — Message API Tests

- [ ] 7.1 Test `GET /api/messages/search` — search across conversations (match, no match, empty query)
- [ ] 7.2 Test message pagination

## 8. Server — WebSocket Tests

- [ ] 8.1 Test user WebSocket: connection with valid auth
- [ ] 8.2 Test user WebSocket: connection without auth rejected
- [ ] 8.3 Test user WebSocket: send_message event
- [ ] 8.4 Test user WebSocket: cancel_stream event
- [ ] 8.5 Test agent WebSocket: agent_auth event
- [ ] 8.6 Test agent WebSocket: agent_chunk and agent_complete events
- [ ] 8.7 Test WebSocket: ping/pong keepalive
- [ ] 8.8 Test WebSocket: disconnection cleanup

## 9. Server — Utility Tests

- [ ] 9.1 Test pairing code generation (uniqueness, format)
- [ ] 9.2 Test static scanner (detect eval, new Function, import, document.cookie, etc.)
- [ ] 9.3 Test permission tier classification (Tier 0/1/2)
- [ ] 9.4 Test agent-app-bridge state-to-tool converter

## 10. Web — Store Tests

- [ ] 10.1 Test chat store: addConversation, removeConversation
- [ ] 10.2 Test chat store: setActiveConversation, getActiveConversation
- [ ] 10.3 Test chat store: addMessage, updateMessage
- [ ] 10.4 Test chat store: search functionality
- [ ] 10.5 Test chat store: agent health tracking
- [ ] 10.6 Test chat store: unread count management

## 11. Web — Component Tests

- [ ] 11.1 Install @testing-library/react, @testing-library/jest-dom, jsdom, msw
- [ ] 11.2 Configure vitest with jsdom environment for component tests
- [ ] 11.3 Test MessageBubble: markdown rendering, code syntax highlighting
- [ ] 11.4 Test Sidebar: conversation list, search, active state
- [ ] 11.5 Test ChatArea: message display, input submission
- [ ] 11.6 Test NewChatDialog: agent selection, creation flow
- [ ] 11.7 Test CreateBotDialog: form validation, submission

## 12. Web — Auth Page Tests

- [ ] 12.1 Test LoginPage: form rendering, validation, submission
- [ ] 12.2 Test RegisterPage: form rendering, validation, submission
- [ ] 12.3 Test OAuth button rendering (Google, GitHub)

## 13. Web — Utility & Hook Tests

- [ ] 13.1 Test API client: request formatting, error handling
- [ ] 13.2 Test WebSocket manager: connect, disconnect, event handling
- [ ] 13.3 Test useAutoScroll hook

## 14. E2E — Setup

- [ ] 14.1 Install Playwright and configure for local dev environment
- [ ] 14.2 Add `test:e2e` script to root package.json
- [ ] 14.3 Create E2E test helpers (login helper, seed data helper)

## 15. E2E — Auth Flow

- [ ] 15.1 Test registration flow (fill form → submit → redirected to chat)
- [ ] 15.2 Test login flow (fill form → submit → redirected to chat)
- [ ] 15.3 Test logout flow (click sign out → redirected to login)

## 16. E2E — Chat Flow

- [ ] 16.1 Test create new conversation (click new chat → select agent → conversation appears)
- [ ] 16.2 Test send message (type → send → message appears → agent responds)
- [ ] 16.3 Test conversation switching (click different conversation → messages update)

## 17. E2E — Agent Management

- [ ] 17.1 Test create bot (fill form → submit → bot appears in list)
- [ ] 17.2 Test delete bot
