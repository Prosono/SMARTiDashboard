import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "../tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:8765", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: ".venv/bin/python scripts/test_server.py",
    cwd: "../",
    url: "http://localhost:8765/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
