import { type Page, expect } from "@playwright/test";

const API_URL = "http://localhost:3501";

// Generate unique test user credentials
let userCounter = 0;
export function uniqueUser() {
  const n = ++userCounter;
  const ts = Date.now();
  return {
    name: `E2E User ${n}`,
    email: `e2e-${ts}-${n}@test.example.com`,
    password: `TestPass${ts}!`,
  };
}

export async function registerUser(page: Page, user: { name: string; email: string; password: string }) {
  await page.goto("/register", { waitUntil: "networkidle" });
  // Wait for React hydration — fill, verify, retry if needed
  const nameInput = page.locator('input[id="name"]');
  const emailInput = page.locator('input[id="email"]');
  const passwordInput = page.locator('input[id="password"]');
  await nameInput.click();
  await nameInput.fill(user.name);
  await emailInput.click();
  await emailInput.fill(user.email);
  await passwordInput.click();
  await passwordInput.fill(user.password);
  // Verify values actually persisted (React hydration)
  await expect(nameInput).toHaveValue(user.name, { timeout: 5000 });
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/", { timeout: 20000 });
}

export async function loginUser(page: Page, user: { email: string; password: string }) {
  await page.goto("/login", { waitUntil: "networkidle" });
  const emailInput = page.locator('input[id="email"]');
  const passwordInput = page.locator('input[id="password"]');
  await emailInput.click();
  await emailInput.fill(user.email);
  await passwordInput.click();
  await passwordInput.fill(user.password);
  await expect(emailInput).toHaveValue(user.email, { timeout: 5000 });
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/", { timeout: 20000 });
}

export async function logoutUser(page: Page) {
  const signOutBtn = page.getByRole("button", { name: /sign out/i }).first();
  await signOutBtn.waitFor({ state: "visible", timeout: 10000 });
  await signOutBtn.click();
  await page.waitForURL("/login", { timeout: 15000 });
}
