// =============================================================
//  CGMax FFTP — Service Worker Cache Version Auto-Bumper
//
//  Reads sw.js, replaces the date portion of CACHE_VERSION
//  with today's date (YYYY-MM-DD), and writes the file back.
//  The version prefix (e.g. "fftp-v12") is preserved unchanged.
//
//  Before: const CACHE_VERSION = 'fftp-v12::2026-03-07';
//  After:  const CACHE_VERSION = 'fftp-v12::2026-03-09';  ← today
//
//  WHY:
//    Returning coaches have the old version cached by their
//    device's service worker. When sw.js ships a new CACHE_VERSION,
//    the browser detects the change and re-fetches the full app.
//    Without a bump, coaches may run stale code indefinitely.
//
//  CALLED BY:
//    CI: .github/workflows/ci.yml  sw-version-bump job
//    Manual: node scripts/bump-sw-version.js
//
//  CI BEHAVIOR:
//    If sw.js changed, the job commits it back with [skip ci]
//    so no additional pipeline run is triggered.
// =============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

const swPath = path.resolve(__dirname, '..', 'sw.js');
const today  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ─── Read sw.js ───────────────────────────────────────────────
let content;
try {
  content = fs.readFileSync(swPath, 'utf8');
} catch (e) {
  console.error(`❌ Could not read sw.js: ${e.message}`);
  process.exit(1);
}

// ─── Find and replace the date portion ───────────────────────
// Matches: const CACHE_VERSION = 'fftp-v12::2026-03-07';
// Group 1: everything up to and including '::'
// Group 2: the date (YYYY-MM-DD)
// Group 3: the closing quote
const pattern = /(const CACHE_VERSION\s*=\s*['"][a-zA-Z0-9_.-]+::)(\d{4}-\d{2}-\d{2})(['"])/;
const match   = content.match(pattern);

if (!match) {
  console.error('❌ Could not find CACHE_VERSION pattern in sw.js.');
  console.error('   Expected: const CACHE_VERSION = \'fftp-vN::YYYY-MM-DD\';');
  process.exit(1);
}

const currentDate = match[2];

if (currentDate === today) {
  console.log(`✅ Cache version already has today's date (${today}) — no update needed.`);
  process.exit(0);
}

// ─── Apply the bump ───────────────────────────────────────────
const updated = content.replace(pattern, `$1${today}$3`);

try {
  fs.writeFileSync(swPath, updated, 'utf8');
  console.log(`✅ Cache version bumped: ${currentDate} → ${today}`);
  console.log(`   New value: fftp-v*::${today}`);
} catch (e) {
  console.error(`❌ Failed to write sw.js: ${e.message}`);
  process.exit(1);
}
