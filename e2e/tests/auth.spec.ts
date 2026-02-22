import { test, expect, type Page } from "@playwright/test";
import { uniqueUser, registerUser, loginUser, logoutUser } from "../helpers/auth";

test.describe("Authentication", () => {
  test("register new user redirects to /", async ({ page }) => {
    const user = uniqueUser();
    await page.goto("/register", { waitUntil: "networkidle" });

    await page.locator('input[id="name"]').click();
    await page.locator('input[id="name"]').fill(user.name);
    await page.locator('input[id="email"]').click();
    await page.locator('input[id="email"]').fill(user.email);
    await page.locator('input[id="password"]').click();
    await page.locator('input[id="password"]').fill(user.password);
    await expect(page.locator('input[id="name"]')).toHaveValue(user.name, { timeout: 5000 });
    await page.locator('button[type="submit"]').click();

    await page.waitForURL("/", { timeout: 20000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test("login with existing user redirects to /", async ({ page }) => {
    const user = uniqueUser();

    // First register the user
    await registerUser(page, user);

    // Then log out so we can test login
    await logoutUser(page);

    // Now log in again
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.locator('input[id="email"]').click();
    await page.locator('input[id="email"]').fill(user.email);
    await page.locator('input[id="password"]').click();
    await page.locator('input[id="password"]').fill(user.password);
    await expect(page.locator('input[id="email"]')).toHaveValue(user.email, { timeout: 5000 });
    await page.locator('button[type="submit"]').click();

    await page.waitForURL("/", { timeout: 20000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test("auth guard: navigating to / without auth redirects to /login", async ({ page }) => {
    // Go to home without any session cookie
    await page.context().clearCookies();
    await page.goto("/");

    await page.waitForURL("/login", { timeout: 15000 });
    expect(page.url()).toContain("/login");
  });

  test("logout redirects to /login", async ({ page }) => {
    const user = uniqueUser();

    // Register and get into the chat
    await registerUser(page, user);

    // Click sign out from the sidebar
    const signOutBtn = page.getByRole("button", { name: /sign out/i }).first();
    await signOutBtn.click();

    await page.waitForURL("/login", { timeout: 15000 });
    expect(page.url()).toContain("/login");
  });
});
