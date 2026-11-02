import { defineConfig, devices } from "@playwright/test";
const baseURL = `http://localhost:${process.env.SMARTI_TEST_PORT || "8765"}`;
export default defineConfig({
  testDir: "../tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Existing suites exercise inline controls in the retained detailed mode.
    // mobile-cards.spec.ts clears this state to verify the fresh phone default.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            { name: "smarti-home-mobile-layout", value: "detailed" },
          ],
        },
      ],
    },
  },
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
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
