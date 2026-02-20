import { test, expect, type Page } from "@playwright/test";
import { uniqueUser, registerUser } from "../helpers/auth";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    const user = uniqueUser();
    await registerUser(page, user);
    await page.waitForURL("/", { timeout: 10000 });
  });

  test("navigate to settings: clicking the settings icon in the sidebar loads the settings page", async ({ page }) => {
    // The settings button in the sidebar has title="Settings" and contains the Settings icon
    const settingsBtn = page.getByRole("button", { name: /settings/i });
    await settingsBtn.click();

    await page.waitForURL("/settings", { timeout: 10000 });
    expect(page.url()).toContain("/settings");

    // The settings page should have a heading
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible({ timeout: 5000 });
  });

  test("update display name: change name field and submit shows success message", async ({ page }) => {
    // Navigate to settings
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible({ timeout: 5000 });

    const newName = `Updated Name ${Date.now()}`;

    // Find the Display Name input (id="name") inside the Update Name section
    const nameInput = page.locator('input[id="name"]');
    await nameInput.clear();
    await nameInput.fill(newName);

    // Click the "Update Name" button
    await page.getByRole("button", { name: /update name/i }).click();

    // A success message should appear
    await expect(page.getByText(/name updated successfully/i)).toBeVisible({ timeout: 10000 });
  });

  test("password validation: entering mismatched passwords shows error message", async ({ page }) => {
    // Navigate to settings
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible({ timeout: 5000 });

    // Fill in the Change Password form with mismatched passwords
    const currentPasswordInput = page.locator('input[id="currentPassword"]');
    const newPasswordInput = page.locator('input[id="newPassword"]');
    const confirmPasswordInput = page.locator('input[id="confirmPassword"]');

    await currentPasswordInput.fill("SomeCurrentPass1!");
    await newPasswordInput.fill("NewPassword123!");
    await confirmPasswordInput.fill("DifferentPassword456!");

    // Submit the form
    await page.getByRole("button", { name: /change password/i }).click();

    // An error message should be shown for mismatched passwords
    // The frontend validates: "Passwords do not match"
    await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 5000 });
  });
});
