import { defineConfig, devices } from "@playwright/test";

// The end-to-end harness toward the Phase 2 gate (frontend guide 7: Playwright
// for the critical journeys, on desktop and mobile viewports). Journey one
// (professor authors and publishes; student redeems and reads) lands with the
// Phase 2.3 reading surfaces and a seeded backend; for now the specs cover the
// shipped entry surfaces and carry the axe accessibility checks (guide 6).
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // A real mobile profile: the upload flow and entry must be flawless on
    // phones (guide 4.0, 4.1), so every journey runs on both viewports.
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    // Dev server is enough for functional and accessibility checks; Lighthouse
    // runs against a production build separately (lighthouserc.json).
    command: `pnpm dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
