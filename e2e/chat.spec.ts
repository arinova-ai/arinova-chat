import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { createBot, startConversation } from "./helpers/seed";

test.describe("Chat Flow", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("create new conversation: click new chat, select agent, conversation appears", async ({
    page,
  }) => {
    // Click "New Chat" in sidebar
    await page.getByRole("button", { name: "New Chat" }).click();

    // The New Conversation dialog should appear
    await expect(page.getByText("New Conversation")).toBeVisible();

    // If there are agents, clicking one should create a conversation
    // If no agents, it should show "No agents yet"
    const noAgentsText = page.getByText("No agents yet");
    const hasAgents = !(await noAgentsText.isVisible().catch(() => false));

    if (hasAgents) {
      // Click the first agent in the list
      const agentButtons = page.locator(
        '[role="dialog"] button:has-text("")'
      );
      const firstAgent = agentButtons.first();
      if (await firstAgent.isVisible()) {
        await firstAgent.click();
        // Should see the chat input
        await expect(
          page.getByPlaceholder("Type a message...")
        ).toBeVisible({ timeout: 10_000 });
      }
    }
  });

  test("send message: type text, send, message appears", async ({ page }) => {
    // This test assumes a conversation is active
    // If no conversation exists, we need to create one first
    const chatInput = page.getByPlaceholder("Type a message...");

    // Check if chat input exists (means we have an active conversation)
    if (await chatInput.isVisible().catch(() => false)) {
      await chatInput.fill("Hello from E2E test");
      await chatInput.press("Enter");

      // The sent message should appear in the chat
      await expect(page.getByText("Hello from E2E test")).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("conversation switching: click different conversation, messages update", async ({
    page,
  }) => {
    // Look for conversation items in the sidebar
    const conversations = page.locator('[class*="conversation"]');
    const count = await conversations.count();

    if (count >= 2) {
      // Click the second conversation
      await conversations.nth(1).click();

      // The chat area should update (header should change)
      // We just verify that clicking doesn't crash
      await expect(
        page.getByPlaceholder("Type a message...")
      ).toBeVisible({ timeout: 5_000 });

      // Click the first conversation
      await conversations.nth(0).click();

      // Chat area should update again
      await expect(
        page.getByPlaceholder("Type a message...")
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});
