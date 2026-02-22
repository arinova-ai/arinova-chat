import { test, expect, type Page } from "@playwright/test";
import { uniqueUser, registerUser } from "../helpers/auth";

async function createBot(page: Page, botName: string) {
  const createBotBtn = page.getByRole("button", { name: /create bot/i });
  await createBotBtn.click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

  await page.fill('input[placeholder="e.g. CodeBot"]', botName);
  await page.getByRole("button", { name: /create bot/i }).last().click();
  await expect(page.getByRole("heading", { name: /bot created/i })).toBeVisible({ timeout: 10000 });

  // Start chat to get back to main view
  await page.getByRole("button", { name: /start chat/i }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
}

test.describe("Bot Management", () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await registerUser(page, user);
    await page.waitForURL("/", { timeout: 10000 });
  });

  test("create and edit a bot", async ({ page }) => {
    const botName = `EditBot-${Date.now()}`;
    await createBot(page, botName);

    // The bot should appear in the sidebar conversation list
    await expect(page.getByText(botName).first()).toBeVisible({ timeout: 5000 });

    // Hover the conversation item to reveal the three-dot menu
    const conversationItem = page.locator('[class*="group"]').filter({ hasText: new RegExp(botName) }).first();
    await conversationItem.hover();

    // Click the three-dot menu button
    const moreBtn = conversationItem.getByRole("button").filter({ has: page.locator("svg") }).last();
    await moreBtn.click();

    // Click "Rename" to edit the conversation name
    await page.getByRole("menuitem", { name: /rename/i }).click();

    const newName = `Renamed-${Date.now()}`;
    const renameInput = page.locator("input.h-6").first();
    await renameInput.clear();
    await renameInput.fill(newName);
    await renameInput.press("Enter");

    // Verify the name updated
    await expect(page.getByText(newName).first()).toBeVisible({ timeout: 5000 });
  });

  test("create and delete a bot", async ({ page }) => {
    const botName = `DeleteBot-${Date.now()}`;
    await createBot(page, botName);

    // The bot should appear in the sidebar
    await expect(page.getByText(botName).first()).toBeVisible({ timeout: 5000 });

    // Hover the conversation item to reveal the three-dot menu
    const conversationItem = page.locator('[class*="group"]').filter({ hasText: new RegExp(botName) }).first();
    await conversationItem.hover();

    // Click the three-dot menu button
    const moreBtn = conversationItem.getByRole("button").filter({ has: page.locator("svg") }).last();
    await moreBtn.click();

    // Click "Delete" in the dropdown
    await page.getByRole("menuitem", { name: /delete/i }).click();

    // Confirm in the delete dialog
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^delete$/i }).click();

    // The conversation should be removed
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(new RegExp(botName))).not.toBeVisible({ timeout: 5000 });
  });
});
