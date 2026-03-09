// =============================================================
//  CGMax FFTP — Accessibility (a11y) Tests
//
//  Uses @axe-core/playwright to run axe-core against every
//  public-facing page in the app at WCAG 2.1 AA standard.
//
//  MODE: Violations are REPORTED but do NOT fail the build.
//        (skipFailures = true)
//
//  HOW TO PROMOTE TO BLOCKING:
//    Once a page is clean, change its `skipFailures` to false.
//    Violations will then fail the Playwright run, protecting
//    that page from future regressions.
//
//  WHAT AXE CATCHES:
//    • Insufficient color contrast (critical for bright-sunlight
//      sideline use — coaches need readable text outdoors)
//    • Missing ARIA labels / roles on interactive elements
//    • Images without alt text
//    • Form inputs without associated labels
//    • Focus management issues (keyboard navigation)
//    • Duplicate IDs
//    • Missing page language declaration
//
//  Run: npx playwright test tests/a11y.spec.js
//  View report: npx playwright show-report
// =============================================================

const { test, expect } = require('@playwright/test');
const { checkA11y }    = require('@axe-core/playwright');

// ─── axe configuration ────────────────────────────────────────
// Run WCAG 2.1 Level A and AA rules only.
// Critical violations (contrast, ARIA, labels) are in these tags.
const AXE_OPTIONS = {
  axeOptions: {
    runOnly: {
      type  : 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
    // Exclude external CDN scripts from analysis — we don't control them
    exclude: [
      ['script[src*="cdn.jsdelivr.net"]'],
      ['script[src*="googletagmanager"]'],
    ],
  },
  detailedReport       : true,
  detailedReportOptions: { html: true },
};

// ─── Helper — run axe and log a summary ──────────────────────
// skipFailures = true → violations are WARNINGS, not test failures.
// Flip to false per-page once violations are resolved.
async function runA11y(page, pageLabel, skipFailures = true) {
  await checkA11y(page, null, AXE_OPTIONS, skipFailures);
  // Note: @axe-core/playwright logs a violation summary to stdout
  // automatically. Each entry shows: rule ID, impact, affected element,
  // and a help URL to understand and fix the issue.
}

// ─── Suite: app.html ─────────────────────────────────────────
test.describe('A11y — app.html (main coaching PWA)', () => {

  test('Setup screen passes axe WCAG 2.1 AA audit', async ({ page }) => {
    // Clear storage so the setup screen is shown (not the gate overlay)
    await page.goto('/app.html');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // ── Change skipFailures to false when you are ready to enforce ──
    await runA11y(page, 'app.html — Setup screen', true);
  });

  test('Main game screen passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/app.html');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Navigate to main game screen via a nav tab if visible
    const mainTab = page.locator('.nav-tab:has-text("Stats"), .nav-tab:has-text("Game"), .nav-tab').first();
    if (await mainTab.isVisible().catch(() => false)) {
      await mainTab.click();
      await page.waitForTimeout(400);
    }

    await runA11y(page, 'app.html — Main game screen', true);
  });

  test('Season screen passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/app.html');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const seasonTab = page.locator('.nav-tab:has-text("Season"), [onclick*="openSeason"]').first();
    if (await seasonTab.isVisible().catch(() => false)) {
      await seasonTab.click();
      await page.waitForTimeout(400);
    }

    await runA11y(page, 'app.html — Season screen', true);
  });

});

// ─── Suite: index.html (landing / marketing page) ────────────
test.describe('A11y — index.html (landing page)', () => {

  test('Landing page passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    await runA11y(page, 'index.html', true);
  });

});

// ─── Suite: parent.html (live parent scoreboard) ─────────────
test.describe('A11y — parent.html (live scoreboard)', () => {

  test('Parent scoreboard passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/parent.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    await runA11y(page, 'parent.html', true);
  });

});

// ─── Suite: statcoach.html (stat coach secondary device) ─────
test.describe('A11y — statcoach.html (stat coach)', () => {

  test('Stat coach page passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/statcoach.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    await runA11y(page, 'statcoach.html', true);
  });

});

// ─── Suite: tournament.html ───────────────────────────────────
test.describe('A11y — tournament.html (tournament bracket)', () => {

  test('Tournament page passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/tournament.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    await runA11y(page, 'tournament.html', true);
  });

});

// ─── Suite: playdesigner.html ─────────────────────────────────
test.describe('A11y — playdesigner.html (canvas play designer)', () => {

  test('Play designer passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/playdesigner.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    await runA11y(page, 'playdesigner.html', true);
  });

});

// ─── Suite: consent.html (parent media consent form) ─────────
test.describe('A11y — consent.html (parent consent form)', () => {

  test('Consent form passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/consent.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    // IMPORTANT: Consent form is used by parents on their own devices.
    // WCAG compliance here is especially important — unknown audience.
    await runA11y(page, 'consent.html', true);
  });

});

// ─── Suite: Legal pages ───────────────────────────────────────
test.describe('A11y — Legal pages (terms + privacy)', () => {

  test('Terms of Service passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/terms.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(400);

    await runA11y(page, 'terms.html', true);
  });

  test('Privacy Policy passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/privacy.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(400);

    await runA11y(page, 'privacy.html', true);
  });

  test('Help page passes axe WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto('/help.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(400);

    await runA11y(page, 'help.html', true);
  });

});
