import { randomUUID } from "crypto";

let counter = 0;
function nextId() {
  return ++counter;
}

export function createTestUser(overrides: Record<string, unknown> = {}) {
  const n = nextId();
  return {
    id: randomUUID(),
    name: `Test User ${n}`,
    email: `test${n}@example.com`,
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestAgent(overrides: Record<string, unknown> = {}) {
  const n = nextId();
  return {
    id: randomUUID(),
    name: `Test Agent ${n}`,
    description: `A test agent ${n}`,
    avatarUrl: null,
    a2aEndpoint: null,
    secretToken: `test-token-${n}-${randomUUID().slice(0, 8)}`,
    ownerId: randomUUID(),
    isPublic: false,
    category: null,
    usageCount: 0,
    systemPrompt: null,
    welcomeMessage: null,
    quickReplies: null,
    notificationsEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestConversation(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: randomUUID(),
    title: "Test Conversation",
    type: "direct" as const,
    userId: randomUUID(),
    agentId: randomUUID(),
    pinnedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    conversationId: randomUUID(),
    seq: 1,
    role: "user" as const,
    content: "Hello, test message",
    status: "completed" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
