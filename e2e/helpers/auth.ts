import type { Page } from "@playwright/test";

export const TEST_USER = {
  name: "Test User",
  email: "test@example.com",
  password: "password123",
};

/**
 * Register a new user via the registration page.
 */
export async function register(page: Page, user = TEST_USER) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  // Wait for redirect to main app
  await page.waitForURL("/", { timeout: 10_000 });
}

/**
 * Log in an existing user via the login page.
 */
export async function login(page: Page, user = TEST_USER) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  // Wait for redirect to main app
  await page.waitForURL("/", { timeout: 10_000 });
}

/**
 * Log out the current user by clicking Sign Out in the sidebar.
 */
export async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign Out" }).click();
  await page.waitForURL("/login", { timeout: 10_000 });
}
