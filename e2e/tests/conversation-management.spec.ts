import { test, expect, type Page } from "@playwright/test";
import { uniqueUser, registerUser } from "../helpers/auth";

async function setupBotAndConversation(page: Page) {
  const botName = `ManageBot-${Date.now()}`;

  // Open Create Bot dialog from the sidebar
  const createBotBtn = page.getByRole("button", { name: /create bot/i });
  await createBotBtn.click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

  await page.fill('input[placeholder="e.g. CodeBot"]', botName);
  await page.getByRole("button", { name: /create bot/i }).last().click();
  await expect(page.getByRole("heading", { name: /bot created/i })).toBeVisible({ timeout: 10000 });

  // Start Chat to create a conversation
  await page.getByRole("button", { name: /start chat/i }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });

  return botName;
}

test.describe("Conversation Management", () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await registerUser(page, user);
    await page.waitForURL("/", { timeout: 10000 });
  });

  test("rename conversation: open dropdown, click Rename, type new name, press Enter — title updates", async ({ page }) => {
    await setupBotAndConversation(page);

    const newTitle = `Renamed-${Date.now()}`;

    // Hover over the conversation item to reveal the three-dot menu
    // The MoreVertical button becomes visible on hover
    const conversationItem = page.locator('[class*="group"]').filter({ hasText: /ManageBot/ }).first();
    await conversationItem.hover();

    // Click the three-dot (MoreVertical) menu button
    const moreBtn = conversationItem.getByRole("button").filter({ has: page.locator('svg') }).last();
    await moreBtn.click();

    // Click "Rename" in the dropdown
    await page.getByRole("menuitem", { name: /rename/i }).click();

    // A rename input should appear inline in the conversation item
    // It is an Input element inside the conversation item
    const renameInput = page.locator('input.h-6').first();
    await renameInput.clear();
    await renameInput.fill(newTitle);
    await renameInput.press("Enter");

    // The conversation title should update to the new name
    await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: 5000 });
  });

  test("pin conversation: open dropdown, click Pin — pin icon becomes visible", async ({ page }) => {
    await setupBotAndConversation(page);

    // Hover over the conversation item to reveal the three-dot menu
    const conversationItem = page.locator('[class*="group"]').filter({ hasText: /ManageBot/ }).first();
    await conversationItem.hover();

    // Click the three-dot menu button
    const moreBtn = conversationItem.getByRole("button").filter({ has: page.locator('svg') }).last();
    await moreBtn.click();

    // Click "Pin" in the dropdown
    await page.getByRole("menuitem", { name: /^pin$/i }).click();

    // After pinning, the conversation item should show a pin icon (lucide Pin svg)
    // The pin icon appears as a sibling to the title text when pinnedAt is set
    await expect(conversationItem.locator('svg').first()).toBeVisible({ timeout: 5000 });

    // Re-hover to verify the dropdown now shows "Unpin" instead of "Pin"
    await conversationItem.hover();
    const moreBtnAfter = conversationItem.getByRole("button").filter({ has: page.locator('svg') }).last();
    await moreBtnAfter.click();
    await expect(page.getByRole("menuitem", { name: /unpin/i })).toBeVisible();

    // Close the dropdown
    await page.keyboard.press("Escape");
  });

  test("delete conversation: open dropdown, click Delete, confirm — conversation removed from sidebar", async ({ page }) => {
    const botName = await setupBotAndConversation(page);

    // Hover over the conversation item to reveal the three-dot menu
    const conversationItem = page.locator('[class*="group"]').filter({ hasText: new RegExp(botName) }).first();
    await conversationItem.hover();

    // Click the three-dot menu button
    const moreBtn = conversationItem.getByRole("button").filter({ has: page.locator('svg') }).last();
    await moreBtn.click();

    // Click "Delete" in the dropdown
    await page.getByRole("menuitem", { name: /delete/i }).click();

    // A confirmation dialog should appear
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/delete conversation/i)).toBeVisible();

    // Confirm deletion
    await page.getByRole("button", { name: /^delete$/i }).click();

    // The confirmation dialog should close
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });

    // The conversation should no longer appear in the sidebar
    await expect(page.getByText(new RegExp(botName))).not.toBeVisible({ timeout: 5000 });
  });
});
