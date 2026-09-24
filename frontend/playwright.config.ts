import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173'
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8000'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['junit', { outputFile: 'playwright-results.xml' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `cd ../backend && uv run uvicorn app.main:app --port ${new URL(API_URL).port}`,
      url: `${API_URL}/api/health/deps`,
      env: { SHADOWLEARN_ENABLE_TEST_ROUTES: 'true' },
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `pnpm dev --host ${new URL(FRONTEND_URL).hostname} --port ${new URL(FRONTEND_URL).port} --strictPort`,
      url: FRONTEND_URL,
      env: { VITE_API_BASE: API_URL },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
