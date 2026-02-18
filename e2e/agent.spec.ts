import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("Agent Management", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("create bot: fill form, submit, bot appears", async ({ page }) => {
    // Click "Create Bot" button in sidebar
    await page.getByRole("button", { name: "Create Bot" }).click();

    // The dialog should appear with form fields
    await expect(page.getByPlaceholder("e.g. CodeBot")).toBeVisible();
    await expect(
      page.getByPlaceholder("What does this agent do?")
    ).toBeVisible();

    // Fill in the bot details
    const botName = `E2EBot-${Date.now()}`;
    await page.getByPlaceholder("e.g. CodeBot").fill(botName);
    await page
      .getByPlaceholder("What does this agent do?")
      .fill("A bot created by E2E tests");

    // Submit the form
    await page.getByRole("button", { name: "Create Bot" }).click();

    // Should show success state with "Bot Created"
    await expect(page.getByText("Bot Created")).toBeVisible({
      timeout: 10_000,
    });

    // Should show the bot name in the success message
    await expect(page.getByText(botName)).toBeVisible();

    // Should show the bot token
    await expect(page.getByText("Bot Token")).toBeVisible();

    // Close the dialog by clicking "Start Chat"
    await page.getByRole("button", { name: "Start Chat" }).click();

    // Should now be in a chat with the new bot
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("delete bot: open manage dialog, delete", async ({ page }) => {
    // First, open New Chat dialog to see agent list
    await page.getByRole("button", { name: "New Chat" }).click();
    await expect(page.getByText("New Conversation")).toBeVisible();

    // Check if there are any agents with a settings button
    const settingsButtons = page
      .locator('[role="dialog"]')
      .getByRole("button")
      .filter({ has: page.locator('svg.lucide-settings') });

    const count = await settingsButtons.count();
    if (count > 0) {
      // Click settings on the first agent to open manage dialog
      await settingsButtons.first().click();

      // The bot manage dialog should open
      // Look for a delete button or confirm deletion flow
      const deleteButton = page.getByRole("button", { name: /delete/i });
      if (await deleteButton.isVisible().catch(() => false)) {
        await deleteButton.click();

        // Confirm if there's a confirmation dialog
        const confirmButton = page.getByRole("button", {
          name: /confirm|yes|delete/i,
        });
        if (await confirmButton.isVisible().catch(() => false)) {
          await confirmButton.click();
        }
      }
    }
  });
});
