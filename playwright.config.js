// =============================================================
//  CGMax FFTP — Playwright Configuration
//  Tests run against a locally-served copy of the app
// =============================================================

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir:    './tests',
  timeout:    30_000,
  retries:    process.env.CI ? 2 : 0,   // retry twice on CI, none locally
  workers:    process.env.CI ? 2 : 4,   // 2 workers on CI (handles 6 browser projects efficiently)

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
    // ── Chromium (Chrome / Edge) ────────────────────────────
    {
      name: 'Desktop Chrome',
      use:  { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome (Android)',
      // Pixel 5 = typical mid-range Android viewport (393 × 851)
      use:  { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Chrome (Galaxy S22)',
      // Samsung Galaxy S22 — high-density flagship Android (360 × 780 @ 3x dpr)
      // Tests layout on tall, narrow portrait viewport common on Samsung devices.
      use: {
        ...devices['Pixel 5'],   // inherit Chromium + Android UA base
        viewport         : { width: 360, height: 780 },
        deviceScaleFactor: 3,
        userAgent        : 'Mozilla/5.0 (Linux; Android 12; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    },

    // ── Firefox ─────────────────────────────────────────────
    {
      name: 'Desktop Firefox',
      use:  { ...devices['Desktop Firefox'] },
    },

    // ── WebKit (Safari) — critical for iPhone coaches ────────
    // Safari has different behaviour for Web Audio (requires user
    // gesture to unlock AudioContext), service worker update
    // timing, localStorage limits, and OAuth popup handling.
    {
      name: 'Desktop Safari',
      use:  { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Safari (iPhone 14)',
      // devices['iPhone 14'] defaults to WebKit — real Safari engine
      use:  { ...devices['iPhone 14'] },
    },
  ],
});
