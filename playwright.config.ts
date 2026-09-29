import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// Use a preinstalled Chromium when one is provided (e.g. sandboxed CI images).
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/umiversity_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
      },
    },
  ],
  webServer: {
    command: `tsx scripts/e2e-db.ts && next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/manifest.webmanifest`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DB,
      E2E_TEST_AUTH: "1",
      REQUEST_PROMOTE_THRESHOLD: "3",
    },
  },
});
