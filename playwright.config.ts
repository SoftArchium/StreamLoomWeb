import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests for the TV guide.
 *
 * These run against the real dev server (and therefore the real Redis
 * catalogue), because the guide's layout — sticky columns, two-axis scroll,
 * virtualization — can only be validated in a browser. Server-side rendering
 * checks cannot catch any of it.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Bound to 127.0.0.1 explicitly: `localhost` can resolve to ::1 while the
    // server listens on IPv4 only, which makes the readiness probe hang.
    command: 'npx vite --host 127.0.0.1 --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
