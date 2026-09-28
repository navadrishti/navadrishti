import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 3100)
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`
const useDevServer = process.env.E2E_DEV === '1'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: useDevServer
          ? `pnpm dev -p ${PORT}`
          : `pnpm build && pnpm start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 600_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
