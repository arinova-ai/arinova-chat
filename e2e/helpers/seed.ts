import type { Page } from "@playwright/test";

/**
 * Create a bot agent via the UI.
 * Assumes the user is already logged in and on the main page.
 */
export async function createBot(
  page: Page,
  name: string,
  description?: string
) {
  // Click "Create Bot" in the sidebar
  await page.getByRole("button", { name: "Create Bot" }).click();

  // Fill in the form
  await page.getByPlaceholder("e.g. CodeBot").fill(name);
  if (description) {
    await page.getByPlaceholder("What does this agent do?").fill(description);
  }

  // Submit
  await page.getByRole("button", { name: "Create Bot" }).click();

  // Wait for success state
  await page.getByText("Bot Created").waitFor({ timeout: 10_000 });
}

/**
 * Start a new conversation with a bot.
 * Assumes the user is logged in and there is at least one agent.
 */
export async function startConversation(page: Page, agentName: string) {
  // Click "New Chat" in the sidebar
  await page.getByRole("button", { name: "New Chat" }).click();

  // Select the agent
  await page.getByText(agentName).click();

  // Wait for the chat area to appear
  await page.getByPlaceholder("Type a message...").waitFor({ timeout: 10_000 });
}
