import { defineConfig, devices } from '@playwright/test'

// Browser tests run against the Vite dev server so the /harness/ page (test-only,
// never in the production build) is available alongside the app.
export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'tests/**/*.spec.ts'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.block-webaudio': false },
        },
      },
    },
  ],
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
