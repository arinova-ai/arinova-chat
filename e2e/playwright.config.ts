import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.WEB_PORT) || 21000;
const API_PORT = Number(process.env.API_PORT) || 21001;

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  retries: 2,
  workers: 1,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
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
      port: API_PORT,
      reuseExistingServer: true,
      cwd: "..",
    },
    {
      command: "pnpm --filter web dev",
      port: WEB_PORT,
      reuseExistingServer: true,
      cwd: "..",
    },
  ],
});
