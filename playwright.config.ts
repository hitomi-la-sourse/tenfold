import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "pnpm --filter @tenfold/server dev",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: true,
    },
    {
      command: "pnpm --filter @tenfold/web dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
