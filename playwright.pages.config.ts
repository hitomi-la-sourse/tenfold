import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-pages",
  fullyParallel: false,
  retries: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4173/tenfold/",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "pnpm --filter @tenfold/web exec vite preview --config vite.pages.config.ts --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/tenfold/",
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
