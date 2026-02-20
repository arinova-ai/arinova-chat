import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  retries: 2,
  workers: 1,
  use: {
    baseURL: "http://localhost:3500",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    navigationTimeout: 20000,
    actionTimeout: 10000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter server dev",
      port: 3501,
      reuseExistingServer: true,
      cwd: "..",
    },
    {
      command: "pnpm --filter web dev",
      port: 3500,
      reuseExistingServer: true,
      cwd: "..",
    },
  ],
});
