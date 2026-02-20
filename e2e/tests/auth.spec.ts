import { test, expect, type Page } from "@playwright/test";
import { uniqueUser, registerUser, loginUser, logoutUser } from "../helpers/auth";

test.describe("Authentication", () => {
  test("register new user redirects to /", async ({ page }) => {
    const user = uniqueUser();
    await page.goto("/register");

    await page.fill('input[id="name"]', user.name);
    await page.fill('input[id="email"]', user.email);
    await page.fill('input[id="password"]', user.password);
    await page.click('button[type="submit"]');

    await page.waitForURL("/", { timeout: 10000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test("login with existing user redirects to /", async ({ page }) => {
    const user = uniqueUser();

    // First register the user
    await registerUser(page, user);

    // Then log out so we can test login
    await logoutUser(page);

    // Now log in again
    await page.goto("/login");
    await page.fill('input[id="email"]', user.email);
    await page.fill('input[id="password"]', user.password);
    await page.click('button[type="submit"]');

    await page.waitForURL("/", { timeout: 10000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test("auth guard: navigating to / without auth redirects to /login", async ({ page }) => {
    // Go to home without any session cookie
    await page.context().clearCookies();
    await page.goto("/");

    await page.waitForURL("/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("logout redirects to /login", async ({ page }) => {
    const user = uniqueUser();

    // Register and get into the chat
    await registerUser(page, user);
    await page.waitForURL("/", { timeout: 10000 });

    // Click sign out from the sidebar
    const signOutBtn = page.getByRole("button", { name: /sign out/i }).first();
    await signOutBtn.click();

    await page.waitForURL("/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });
});
