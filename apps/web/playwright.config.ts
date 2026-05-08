import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local so E2E_TEST_EMAIL / E2E_TEST_PASSWORD reach test fixtures.
// (Next.js loads it for the dev server, but Playwright runs in its own process.)
try {
  const text = readFileSync(resolve(__dirname, ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key && !process.env[key]) process.env[key] = value;
  }
} catch {
  // .env.local is optional; tests will use defaults.
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  ...(process.env["CI"] ? { workers: 1 } : {}),
  reporter: "html",
  use: {
    baseURL: process.env["BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
  },
});
