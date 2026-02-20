import { test, expect, type Page } from "@playwright/test";
import { uniqueUser, registerUser } from "../helpers/auth";

test.describe("Chat", () => {
  let user: ReturnType<typeof uniqueUser>;

  test.beforeEach(async ({ page }) => {
    user = uniqueUser();
    await registerUser(page, user);
    await page.waitForURL("/", { timeout: 10000 });
  });

  test("create a bot: opens dialog, fills name, submits and bot appears in agent list", async ({ page }) => {
    const botName = `TestBot-${Date.now()}`;

    // Click "Create Bot" button in the sidebar
    const createBotBtn = page.getByRole("button", { name: /create bot/i });
    await createBotBtn.click();

    // The Create Bot dialog should appear
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: /create bot/i })).toBeVisible();

    // Fill in the bot name
    await page.fill('input[placeholder="e.g. CodeBot"]', botName);

    // Submit the form
    await page.getByRole("button", { name: /create bot/i }).last().click();

    // The success state should appear showing "Bot Created" with the bot name
    await expect(page.getByRole("heading", { name: /bot created/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(botName)).toBeVisible();

    // Close the dialog by clicking "Start Chat"
    await page.getByRole("button", { name: /start chat/i }).click();

    // The dialog should close and we should be in a conversation
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  });

  test("start conversation with bot: clicking the bot opens a conversation in the sidebar", async ({ page }) => {
    const botName = `ConvBot-${Date.now()}`;

    // Create a bot first
    const createBotBtn = page.getByRole("button", { name: /create bot/i });
    await createBotBtn.click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await page.fill('input[placeholder="e.g. CodeBot"]', botName);
    await page.getByRole("button", { name: /create bot/i }).last().click();
    await expect(page.getByRole("heading", { name: /bot created/i })).toBeVisible({ timeout: 10000 });

    // Click "Start Chat" to open a conversation
    await page.getByRole("button", { name: /start chat/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });

    // The conversation should now be visible in the sidebar (the bot name appears there)
    await expect(page.getByText(botName).first()).toBeVisible({ timeout: 5000 });
  });

  test("send message: typing in chat input and pressing Enter adds message to message list", async ({ page }) => {
    const botName = `MsgBot-${Date.now()}`;
    const testMessage = "Hello from E2E test!";

    // Create a bot and start a conversation
    const createBotBtn = page.getByRole("button", { name: /create bot/i });
    await createBotBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await page.fill('input[placeholder="e.g. CodeBot"]', botName);
    await page.getByRole("button", { name: /create bot/i }).last().click();
    await expect(page.getByRole("heading", { name: /bot created/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /start chat/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });

    // Type a message in the chat textarea
    const chatInput = page.locator('textarea[placeholder="Type a message..."]');
    await chatInput.click();
    await chatInput.fill(testMessage);

    // Press Enter to send (desktop behavior)
    await chatInput.press("Enter");

    // The message should appear in the message list
    await expect(page.getByText(testMessage)).toBeVisible({ timeout: 5000 });
  });
});
