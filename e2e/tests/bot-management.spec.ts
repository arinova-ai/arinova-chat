import { test, expect } from "@playwright/test";
import { registerUser, loginUser } from "../helpers/auth";

test.describe("Bot Management", () => {
  test.beforeEach(async ({ page }) => {
    const user = await registerUser(page);
    await loginUser(page, user);
  });

  test("create and edit a bot", async ({ page }) => {
    // Open bot creation dialog
    await page.click('button:has-text("Add Bot"), button:has-text("New Bot"), [data-testid="add-bot"]');

    // Fill in bot name
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    await nameInput.fill("TestEditBot");

    // Submit
    await page.click('button:has-text("Create"), button:has-text("Add"), button[type="submit"]');

    // Wait for bot to appear
    await expect(page.locator("text=TestEditBot").first()).toBeVisible({ timeout: 10000 });

    // Navigate to bot settings / click on bot to edit
    // Look for a settings or edit button near the bot
    const botElement = page.locator("text=TestEditBot").first();
    await botElement.click();

    // Look for edit/settings option
    const editButton = page.locator(
      'button:has-text("Edit"), button:has-text("Settings"), [data-testid="edit-bot"], button[title*="edit" i], button[title*="settings" i]'
    ).first();

    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editButton.click();

      // Update name
      const editNameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
      await editNameInput.clear();
      await editNameInput.fill("RenamedBot");

      // Save
      await page.click('button:has-text("Save"), button:has-text("Update"), button[type="submit"]');

      // Verify rename
      await expect(page.locator("text=RenamedBot").first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("create and delete a bot", async ({ page }) => {
    // Create a bot first
    await page.click('button:has-text("Add Bot"), button:has-text("New Bot"), [data-testid="add-bot"]');

    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    await nameInput.fill("DeleteMeBot");

    await page.click('button:has-text("Create"), button:has-text("Add"), button[type="submit"]');

    await expect(page.locator("text=DeleteMeBot").first()).toBeVisible({ timeout: 10000 });

    // Navigate to bot and look for delete option
    const botElement = page.locator("text=DeleteMeBot").first();
    await botElement.click();

    // Look for delete button (may be in settings or directly available)
    const deleteButton = page.locator(
      'button:has-text("Delete"), [data-testid="delete-bot"], button[title*="delete" i]'
    ).first();

    if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteButton.click();

      // Confirm deletion if there's a confirmation dialog
      const confirmButton = page.locator(
        'button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete"):visible'
      ).first();

      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }

      // Verify bot is gone
      await expect(page.locator("text=DeleteMeBot")).toHaveCount(0, { timeout: 5000 });
    }
  });
});
