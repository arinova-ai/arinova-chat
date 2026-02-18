import { test, expect } from "@playwright/test";
import { TEST_USER, register, login, logout } from "./helpers/auth";

test.describe("Auth Flow", () => {
  test("registration flow: fill form, submit, redirected to chat", async ({
    page,
  }) => {
    await page.goto("/register");

    // Verify the registration form renders
    await expect(page.getByText("Create a new account")).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    // Fill and submit
    await page.getByLabel("Name").fill(TEST_USER.name);
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Create Account" }).click();

    // Should redirect to main app
    await expect(page).toHaveURL("/", { timeout: 10_000 });
  });

  test("login flow: fill form, submit, redirected to chat", async ({
    page,
  }) => {
    await page.goto("/login");

    // Verify the login form renders
    await expect(page.getByText("Sign in to your account")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    // Fill and submit
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign In" }).click();

    // Should redirect to main app
    await expect(page).toHaveURL("/", { timeout: 10_000 });
  });

  test("logout flow: click sign out, redirected to login", async ({
    page,
  }) => {
    // First log in
    await login(page);

    // Now log out
    await page.getByRole("button", { name: "Sign Out" }).click();

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("login page shows OAuth buttons", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "GitHub" })).toBeVisible();
  });

  test("register page shows OAuth buttons", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "GitHub" })).toBeVisible();
  });

  test("login page links to register", async ({ page }) => {
    await page.goto("/login");
    const registerLink = page.getByRole("link", { name: "Register" });
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute("href", "/register");
  });

  test("register page links to login", async ({ page }) => {
    await page.goto("/register");
    const loginLink = page.getByRole("link", { name: "Sign in" });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute("href", "/login");
  });
});
