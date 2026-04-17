import { defineConfig } from "@playwright/test";

const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER !== "false";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  expect: { timeout: 5_000 },
  // The E2E suite mutates one shared seeded user and database, so parallel file
  // execution causes cross-test cleanup races (pacts/settings/partners).
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: [
    {
      // E2E depends on the API as well as Vite, so start the backend explicitly.
      command: "cd .. && ./scripts/start_backend_for_e2e.sh",
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer,
      timeout: 15_000,
    },
  ],
});
