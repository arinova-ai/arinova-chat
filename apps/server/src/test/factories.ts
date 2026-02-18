// Test factories for creating mock data

import { randomUUID } from "node:crypto";
import { vi } from "vitest";

export function createMockUser(overrides?: Partial<{ id: string; email: string; name: string }>) {
  return {
    id: overrides?.id ?? randomUUID(),
    email: overrides?.email ?? `user-${Date.now()}@test.com`,
    name: overrides?.name ?? "Test User",
  };
}

export function createMockAgent(
  overrides?: Partial<{
    id: string;
    ownerId: string;
    name: string;
    description: string | null;
    a2aEndpoint: string | null;
    secretToken: string;
    avatarUrl: string | null;
    isPublic: boolean;
    category: string | null;
    systemPrompt: string | null;
    welcomeMessage: string | null;
    quickReplies: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>
) {
  const now = new Date();
  return {
    id: overrides?.id ?? randomUUID(),
    ownerId: overrides?.ownerId ?? randomUUID(),
    name: overrides?.name ?? "Test Agent",
    description: overrides?.description ?? null,
    a2aEndpoint: overrides?.a2aEndpoint ?? null,
    secretToken: overrides?.secretToken ?? `ari_${"a".repeat(48)}`,
    avatarUrl: overrides?.avatarUrl ?? null,
    isPublic: overrides?.isPublic ?? false,
    category: overrides?.category ?? null,
    systemPrompt: overrides?.systemPrompt ?? null,
    welcomeMessage: overrides?.welcomeMessage ?? null,
    quickReplies: overrides?.quickReplies ?? null,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  };
}

export function createMockConversation(
  overrides?: Partial<{
    id: string;
    userId: string;
    agentId: string | null;
    title: string | null;
    type: "direct" | "group";
    pinnedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>
) {
  const now = new Date();
  return {
    id: overrides?.id ?? randomUUID(),
    userId: overrides?.userId ?? randomUUID(),
    agentId: overrides?.agentId ?? randomUUID(),
    title: overrides?.title ?? null,
    type: overrides?.type ?? "direct",
    pinnedAt: overrides?.pinnedAt ?? null,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  };
}

export function createMockMessage(
  overrides?: Partial<{
    id: string;
    conversationId: string;
    role: "user" | "agent";
    content: string;
    status: "completed" | "streaming" | "error" | "cancelled";
    createdAt: Date;
    updatedAt: Date;
  }>
) {
  const now = new Date();
  return {
    id: overrides?.id ?? randomUUID(),
    conversationId: overrides?.conversationId ?? randomUUID(),
    role: overrides?.role ?? "user",
    content: overrides?.content ?? "Test message",
    status: overrides?.status ?? "completed",
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  };
}

/**
 * Creates a mock `requireAuth` implementation that resolves to the given user.
 * Usage: `vi.mocked(requireAuth).mockImplementation(createAuthContext(user))`
 */
export function createAuthContext(user?: { id: string; email: string; name: string }) {
  const mockUser = user ?? createMockUser();
  return async () => mockUser;
}
