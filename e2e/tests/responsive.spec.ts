import { test, expect, type Page } from "@playwright/test";
import { uniqueUser, registerUser } from "../helpers/auth";

test.describe("Responsive Layout", () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await registerUser(page, user);
    await page.waitForURL("/", { timeout: 10000 });
  });

  test("mobile viewport (375x667): only sidebar OR chat is visible, not both", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // On mobile, when no conversation is active, only the sidebar is visible
    // The chat area is hidden (has class "hidden" when no active conversation on mobile)
    // The sidebar is shown fullscreen

    // Wait for the layout to settle
    await page.waitForTimeout(300);

    // The sidebar should be visible (mobile sidebar is shown when no conversation active)
    // The chat area panel should be hidden (has "hidden" class on mobile without an active conversation)
    // We check by looking at the desktop-only sidebar (md:block hidden by default on mobile)
    // and the mobile sidebar
    const desktopSidebar = page.locator('.hidden.md\\:block').first();
    const mobileSidebar = page.locator('.md\\:hidden').first();
    const chatArea = page.locator('.hidden.md\\:block').last();

    // On mobile without an active conversation:
    // - Mobile sidebar container is flex-1 (visible)
    // - Chat area is "hidden md:block" (hidden on mobile)
    const mobileSidebarContainer = page.locator('[class*="md:hidden"]').filter({ has: page.locator('[class*="bg-card"]') }).first();

    // Verify "New Chat" button is visible (it's in the sidebar)
    await expect(page.getByRole("button", { name: /new chat/i })).toBeVisible();

    // The "Type a message..." textarea (in chat area) should NOT be visible when no conversation is active
    await expect(page.locator('textarea[placeholder="Type a message..."]')).not.toBeVisible();
  });

  test("desktop viewport (1280x720): both sidebar and chat are visible side by side", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    // Wait for the layout to settle
    await page.waitForTimeout(300);

    // On desktop, the sidebar is always visible (w-80 hidden md:block)
    // The chat area is always visible too (flex-1 bg-background)

    // The "New Chat" button should be visible (in the sidebar)
    await expect(page.getByRole("button", { name: /new chat/i })).toBeVisible();

    // The "Create Bot" button should also be visible (in the sidebar)
    await expect(page.getByRole("button", { name: /create bot/i })).toBeVisible();

    // The chat area should be visible on desktop even without an active conversation
    // It renders the empty state or the chat area container
    // We check that the sidebar (with New Chat button) AND the chat column are both in the DOM and visible
    const desktopSidebarWrapper = page.locator('.hidden.md\\:block').first();
    await expect(desktopSidebarWrapper).toBeVisible();

    // The main chat column (flex-1 bg-background) should also be visible
    // We verify the layout has both columns by checking both key sidebar elements
    // and the chat area region exist and are visible simultaneously
    const sidebar = page.locator('div').filter({ has: page.getByRole("button", { name: /new chat/i }) }).first();
    await expect(sidebar).toBeVisible();

    // The chat area (empty state or placeholder) should be simultaneously visible
    const chatColumn = page.locator('.bg-background.flex-1').first();
    await expect(chatColumn).toBeVisible();
  });
});
