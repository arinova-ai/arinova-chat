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
  await page.goto("/register");
  await page.fill('input[id="name"]', user.name);
  await page.fill('input[id="email"]', user.email);
  await page.fill('input[id="password"]', user.password);
  await page.click('button[type="submit"]');
  // Wait for redirect to chat
  await page.waitForURL("/", { timeout: 10000 });
}

export async function loginUser(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.fill('input[id="email"]', user.email);
  await page.fill('input[id="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/", { timeout: 10000 });
}

export async function logoutUser(page: Page) {
  // Find and click sign out button in sidebar
  // The sidebar has a sign out button with "Sign Out" text or a LogOut icon
  const signOutBtn = page.getByRole("button", { name: /sign out/i });
  if (await signOutBtn.isVisible()) {
    await signOutBtn.click();
  }
  await page.waitForURL("/login", { timeout: 10000 });
}
