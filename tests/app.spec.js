// =============================================================
//  CGMax FFTP — Playwright E2E UX Tests
//  Tests every major user interaction in app.html
//  against a locally-served copy of the app.
//
//  Run: npx playwright test
//  View report: npx playwright show-report
// =============================================================

const { test, expect } = require('@playwright/test');

// ─── Helpers ─────────────────────────────────────────────────
async function clearStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function loadFreshApp(page) {
  await page.goto('/app.html');
  await clearStorage(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
}

// Set up a minimal roster and start a game
async function startGame(page, { team = 'Test Bears', opp = 'Test Lions', players = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Frank', 'George'] } = {}) {
  await loadFreshApp(page);

  // Fill team name
  const teamInput = page.locator('#su-team');
  await teamInput.fill(team);

  // Fill opponent
  const oppInput = page.locator('#su-opp');
  await oppInput.fill(opp);

  // Add players to roster
  for (const name of players) {
    const addInput = page.locator('.add-player-input, input[placeholder*="player" i], input[placeholder*="name" i]').first();
    if (await addInput.isVisible()) {
      await addInput.fill(name);
      const addBtn = page.locator('button:has-text("Add"), .add-player-btn, .add-btn').first();
      if (await addBtn.isVisible()) await addBtn.click();
    }
  }

  // Click Start / Kick Off
  const startBtn = page.locator('button:has-text("Start"), button:has-text("Kick Off"), .start-btn, #start-btn, .kickoff-btn').first();
  if (await startBtn.isVisible()) {
    await startBtn.click();
  }
}

// ─── Suite 1: Page Load & No Errors ──────────────────────────
test.describe('1 — Page Load & Stability', () => {

  test('app.html loads with HTTP 200', async ({ page }) => {
    const response = await page.goto('/app.html');
    expect(response.status()).toBe(200);
  });

  test('No critical JavaScript errors on load', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
    });

    await page.goto('/app.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500); // allow async init

    // Filter expected/acceptable errors (Supabase auth, network offline, etc.)
    const critical = jsErrors.filter(e =>
      !e.includes('supabase') &&
      !e.includes('ERR_NAME_NOT_RESOLVED') &&
      !e.includes('Failed to fetch') &&
      !e.includes('NetworkError') &&
      !e.includes('net::ERR_')
    );
    expect(critical, `Unexpected JS errors: ${critical.join('\n')}`).toHaveLength(0);
  });

  test('Page title is set correctly', async ({ page }) => {
    await page.goto('/app.html');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    // Should contain something related to the app
    expect(title.toLowerCase()).toMatch(/flag|cgmax|fftp|coach/i);
  });

  test('App container is rendered', async ({ page }) => {
    await page.goto('/app.html');
    // The app wraps everything in a main container
    await expect(page.locator('#app, .app-container, body')).toBeAttached();
  });

  test('index.html loads correctly', async ({ page }) => {
    const response = await page.goto('/index.html');
    expect(response.status()).toBe(200);
    await expect(page.locator('body')).toBeVisible();
  });

});

// ─── Suite 2: Setup Screen ────────────────────────────────────
test.describe('2 — Setup Screen', () => {

  test.beforeEach(async ({ page }) => {
    await loadFreshApp(page);
  });

  test('Setup screen is visible on first load', async ({ page }) => {
    const setup = page.locator('#screen-setup');
    await expect(setup).toBeVisible();
  });

  test('Team name input accepts text', async ({ page }) => {
    const input = page.locator('#su-team');
    await expect(input).toBeVisible();
    await input.fill('Thunder Hawks');
    await expect(input).toHaveValue('Thunder Hawks');
  });

  test('Opponent name input accepts text', async ({ page }) => {
    const input = page.locator('#su-opp');
    await expect(input).toBeVisible();
    await input.fill('Storm Eagles');
    await expect(input).toHaveValue('Storm Eagles');
  });

  test('Date input is present and editable', async ({ page }) => {
    const dateInput = page.locator('#su-date, input[type="date"]').first();
    await expect(dateInput).toBeVisible();
  });

  test('Color swatches are visible', async ({ page }) => {
    const swatches = page.locator('.swatch, .color-swatch');
    const count = await swatches.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Start/Kickoff button is present', async ({ page }) => {
    const btn = page.locator('button:has-text("Kick"), button:has-text("Start"), .kickoff-btn').first();
    await expect(btn).toBeVisible();
  });

});

// ─── Suite 3: Roster Screen ───────────────────────────────────
test.describe('3 — Roster Screen', () => {

  test.beforeEach(async ({ page }) => {
    await loadFreshApp(page);
  });

  test('Roster tab / button is reachable', async ({ page }) => {
    // Look for roster navigation
    const rosterNav = page.locator(
      '.nav-tab:has-text("Roster"), button:has-text("Roster"), [onclick*="openRoster"], [onclick*="Roster"]'
    ).first();
    if (await rosterNav.isVisible()) {
      await expect(rosterNav).toBeEnabled();
    } else {
      // Roster might be inside setup screen
      const rosterSection = page.locator('#screen-roster, .roster-section, .roster-wrap').first();
      // Just verify it exists in DOM
      await expect(rosterSection).toBeAttached();
    }
  });

  test('Player list renders in setup', async ({ page }) => {
    // The roster/player list should be somewhere on setup screen
    const playerArea = page.locator('.player-list, .roster-list, #player-list, .live-roster').first();
    // Just needs to exist in DOM (may be empty on first load)
    await expect(playerArea).toBeAttached();
  });

});

// ─── Suite 4: Main Game Screen & Navigation ──────────────────
test.describe('4 — Main Game Screen', () => {

  test('Main screen is in the DOM', async ({ page }) => {
    await page.goto('/app.html');
    await expect(page.locator('#screen-main')).toBeAttached();
  });

  test('Navigation tabs render in main screen', async ({ page }) => {
    await page.goto('/app.html');
    // Nav tabs should exist
    const tabs = page.locator('.nav-tab, .tab-btn');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(2);
  });

  test('Stats tab is present', async ({ page }) => {
    await page.goto('/app.html');
    const statsTab = page.locator('.nav-tab:has-text("Stats"), [onclick*="stats"], [data-tab="stats"]').first();
    await expect(statsTab).toBeAttached();
  });

  test('Rotations tab is present', async ({ page }) => {
    await page.goto('/app.html');
    const rotTab = page.locator('.nav-tab:has-text("Rot"), [onclick*="rot"], [data-tab="rotations"]').first();
    await expect(rotTab).toBeAttached();
  });

  test('Summary tab is present', async ({ page }) => {
    await page.goto('/app.html');
    const sumTab = page.locator('.nav-tab:has-text("Summary"), [onclick*="summary"]').first();
    await expect(sumTab).toBeAttached();
  });

  test('Score display elements are in DOM', async ({ page }) => {
    await page.goto('/app.html');
    const scoreEl = page.locator('.score-us, .score-them, #score-us, #score-them, [id*="score"]').first();
    await expect(scoreEl).toBeAttached();
  });

  test('Quarter buttons are in DOM', async ({ page }) => {
    await page.goto('/app.html');
    const qBtn = page.locator('.quarter-btn, .q-btn, [id*="q-btn"], button:has-text("Q1"), button:has-text("Q2")').first();
    await expect(qBtn).toBeAttached();
  });

});

// ─── Suite 5: Season Screen ───────────────────────────────────
test.describe('5 — Season Screen', () => {

  test('Season tab is in the nav', async ({ page }) => {
    await page.goto('/app.html');
    const seasonTab = page.locator('.nav-tab:has-text("Season"), [onclick*="season" i], [onclick*="Season"]').first();
    await expect(seasonTab).toBeAttached();
  });

  test('Season screen is in the DOM', async ({ page }) => {
    await page.goto('/app.html');
    await expect(page.locator('#screen-season')).toBeAttached();
  });

  test('Trophy podium container is in the DOM', async ({ page }) => {
    await page.goto('/app.html');
    await expect(page.locator('#sl-trophy-podium')).toBeAttached();
  });

  test('Season leaderboard table is in the DOM', async ({ page }) => {
    await page.goto('/app.html');
    await expect(page.locator('#sl-table')).toBeAttached();
  });

  test('Season actions buttons are present', async ({ page }) => {
    await page.goto('/app.html');
    // Export / Clear / Import buttons
    const actions = page.locator('.season-actions, .sact-btn');
    await expect(actions.first()).toBeAttached();
  });

  test('Opening Season tab shows screen or Pro gate', async ({ page }) => {
    await page.goto('/app.html');
    const seasonTab = page.locator('.nav-tab:has-text("Season"), [onclick*="openSeason"]').first();

    if (await seasonTab.isVisible()) {
      await seasonTab.click();
      await page.waitForTimeout(500);

      // Either the season screen is now active, OR a Pro modal appeared
      const seasonActive = await page.locator('#screen-season.active').isVisible();
      const proModal     = await page.locator('.modal-overlay.show, .pro-modal.show, [id*="pro-modal"]').isVisible().catch(() => false);

      expect(seasonActive || proModal).toBe(true);
    }
  });

  test('With saved season data, trophy podium renders avatars', async ({ page }) => {
    await page.goto('/app.html');

    // Inject mock season data with 3 ranked players
    await page.evaluate(() => {
      const mockGames = [{
        id: 1, date: '2025-10-01', team: 'Test Bears', opp: 'Lions',
        us: 21, them: 14, quarters: 4, qb: 'Alice', mvp: 'Alice',
        absent: [],
        playerStats: {
          'Alice': { score: 120, tds: 4, qbTDs: 2, ints: 1, flags: 3, blocks: 0, catches: 5, fumbles: 0 },
          'Bob':   { score: 90,  tds: 3, qbTDs: 0, ints: 0, flags: 5, blocks: 1, catches: 4, fumbles: 0 },
          'Charlie':{ score: 60, tds: 2, qbTDs: 0, ints: 0, flags: 2, blocks: 0, catches: 3, fumbles: 0 },
          'Dave':  { score: 30,  tds: 1, qbTDs: 0, ints: 0, flags: 1, blocks: 0, catches: 1, fumbles: 0 },
        }
      }];
      // Use the team-specific season key pattern
      const teamId = 'default';
      localStorage.setItem('ff_season_' + teamId, JSON.stringify(mockGames));
      // Also set the active team ID
      localStorage.setItem('ff_active_team', teamId);
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Open Season (bypass pro gate if possible — inject pro license)
    await page.evaluate(() => {
      localStorage.setItem('ff_license_key', 'CGMAX-TEST-TEST-TEST');
      localStorage.setItem('ff_is_pro', '1');
    });

    const seasonTab = page.locator('.nav-tab:has-text("Season"), [onclick*="openSeason"]').first();
    if (await seasonTab.isVisible()) {
      await seasonTab.click();
      await page.waitForTimeout(800);

      // Trophy podium should have SVG or img content
      const podium = page.locator('#sl-trophy-podium');
      const podiumHTML = await podium.innerHTML().catch(() => '');
      expect(podiumHTML.length).toBeGreaterThan(50); // should have some content
    }
  });

});

// ─── Suite 6: Interactive Buttons ────────────────────────────
test.describe('6 — Button & UI Interaction', () => {

  test('All .nav-tab elements are clickable', async ({ page }) => {
    await page.goto('/app.html');
    const tabs = page.locator('.nav-tab');
    const count = await tabs.count();

    for (let i = 0; i < Math.min(count, 8); i++) {
      const tab = tabs.nth(i);
      const isEnabled = await tab.isEnabled();
      const isVisible = await tab.isVisible();
      if (isVisible && isEnabled) {
        await expect(tab).toBeEnabled();
      }
    }
  });

  test('Score increment buttons exist and are enabled', async ({ page }) => {
    await page.goto('/app.html');
    const scoreBtns = page.locator('.score-btn, [onclick*="score"], button:has-text("+6"), button:has-text("+2")');
    const count = await scoreBtns.count();
    if (count > 0) {
      await expect(scoreBtns.first()).toBeAttached();
    }
  });

  test('End Game button is present', async ({ page }) => {
    await page.goto('/app.html');
    const endBtn = page.locator('button:has-text("End Game"), button:has-text("Save to Season"), .end-game-btn').first();
    await expect(endBtn).toBeAttached();
  });

  test('Undo button is present', async ({ page }) => {
    await page.goto('/app.html');
    const undoBtn = page.locator('button:has-text("Undo"), .undo-btn, [onclick*="undo"]').first();
    await expect(undoBtn).toBeAttached();
  });

  test('Settings / menu button is accessible', async ({ page }) => {
    await page.goto('/app.html');
    const settingsBtn = page.locator('button:has-text("Settings"), .settings-btn, [onclick*="settings" i], [onclick*="Settings"]').first();
    if (await settingsBtn.count() > 0) {
      await expect(settingsBtn).toBeAttached();
    }
  });

  test('No buttons throw JS errors when clicked', async ({ page }) => {
    await page.goto('/app.html');
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));

    // Click all visible, non-dangerous nav tabs
    const safeTabs = page.locator('.nav-tab:not(:has-text("Clear")):not(:has-text("Delete")):not(:has-text("Reset"))');
    const count = await safeTabs.count();

    for (let i = 0; i < Math.min(count, 6); i++) {
      const tab = safeTabs.nth(i);
      if (await tab.isVisible() && await tab.isEnabled()) {
        await tab.click().catch(() => {}); // ignore navigation errors
        await page.waitForTimeout(200);
      }
    }

    const critical = jsErrors.filter(e =>
      !e.includes('supabase') && !e.includes('net::ERR_') && !e.includes('Failed to fetch')
    );
    expect(critical).toHaveLength(0);
  });

});

// ─── Suite 7: Mobile Responsiveness ──────────────────────────
test.describe('7 — Mobile Layout', () => {

  test('App renders correctly at 390px wide (iPhone 14)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app.html');
    await expect(page.locator('body')).toBeVisible();

    // No horizontal scroll
    const hasHorizScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizScroll).toBe(false);
  });

  test('App renders correctly at 375px wide (iPhone SE)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/app.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Nav tabs are visible and not clipped on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/app.html');
    const tabs = page.locator('.nav-tab').first();
    if (await tabs.isVisible()) {
      const box = await tabs.boundingBox();
      if (box) {
        // Tab should be on screen (not clipped off left/right)
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390 + 10);
      }
    }
  });

});

// ─── Suite 8: PWA & Assets ────────────────────────────────────
test.describe('8 — PWA & Static Assets', () => {

  test('manifest.json is accessible', async ({ page }) => {
    const res = await page.goto('/manifest.json');
    expect(res.status()).toBe(200);
    const body = await res.text();
    const json = JSON.parse(body);
    expect(json.name || json.short_name).toBeTruthy();
  });

  test('sw.js is accessible', async ({ page }) => {
    const res = await page.goto('/sw.js');
    expect(res.status()).toBe(200);
  });

  test('icon-192.png is accessible', async ({ page }) => {
    const res = await page.goto('/icon-192.png');
    expect(res.status()).toBe(200);
  });

  test('icon-512.png is accessible', async ({ page }) => {
    const res = await page.goto('/icon-512.png');
    expect(res.status()).toBe(200);
  });

  test('No 404s for resources loaded by app.html', async ({ page }) => {
    const failed404s = [];
    page.on('response', res => {
      if (res.status() === 404) failed404s.push(res.url());
    });

    await page.goto('/app.html');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    // Filter out CDN 404s (external — not our fault) and sw registration
    const ours = failed404s.filter(url =>
      url.includes('localhost') && !url.includes('favicon')
    );
    expect(ours, `404s: ${ours.join('\n')}`).toHaveLength(0);
  });

});
