// =============================================================
//  CGMax FFTP — Playwright Configuration
//  Tests run against a locally-served copy of the app
// =============================================================

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir:    './tests',
  timeout:    30_000,
  retries:    process.env.CI ? 2 : 0,   // retry twice on CI, none locally
  workers:    process.env.CI ? 1 : 2,   // single worker on CI for stability

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    baseURL:             'http://localhost:3333',
    screenshot:          'only-on-failure',
    video:               'retain-on-failure',
    trace:               'on-first-retry',
    // Don't actually navigate away on external links
    navigationTimeout:   15_000,
    actionTimeout:       10_000,
  },

  // Auto-start a local server before tests
  webServer: {
    command:             'npx serve . -p 3333 --no-clipboard',
    url:                 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    timeout:             20_000,
    stdout:              'ignore',
    stderr:              'pipe',
  },

  projects: [
    {
      name:  'Desktop Chrome',
      use:   { ...devices['Desktop Chrome'] },
    },
    {
      name:  'Mobile Chrome (iPhone 14)',
      use:   { ...devices['iPhone 14'] },
    },
  ],
});
