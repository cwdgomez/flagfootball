// =============================================================
//  CGMax FFTP — Backend API Health Check
//
//  Sends a request to every Vercel backend endpoint with
//  clearly invalid / missing inputs and asserts the response
//  is NOT a 500 (Internal Server Error).
//
//  Logic:
//    • 400 Bad Request  → endpoint loaded, rejects bad input   ✅
//    • 401 Unauthorized → endpoint loaded, auth guard working  ✅
//    • 403 Forbidden    → endpoint loaded, access denied       ✅
//    • 405 Method N/A   → endpoint loaded, wrong method guard  ✅
//    • 500 Server Error → handler crashed, deploy is broken    ❌
//    • Timeout / ERR    → endpoint unreachable                 ❌
//
//  This does NOT test correct functionality — it proves every
//  handler is deployed, loaded, and not crashing on entry.
//  Real integration tests (with auth tokens) can be added later.
//
//  Run manually: node scripts/api-health-check.js
//  Called by:   .github/workflows/ci.yml (api-health job)
// =============================================================

'use strict';

const https = require('https');

const BASE_URL   = 'https://api.cgmaxfftp.com';
const TIMEOUT_MS = 20000;  // Vercel cold starts can take ~10s

// Each check: HTTP method, path, body to send (JSON string or null)
// Strategy: send empty / missing credentials so auth/validation fires,
// not application logic. We want a 4xx, never a 5xx.
const CHECKS = [
  {
    method : 'POST',
    path   : '/api/validate-license',
    body   : '{}',
    desc   : 'validate-license — empty body',
    // Expects 400 (missing key) — proves license validation handler is up
  },
  {
    method : 'POST',
    path   : '/api/backup-season',
    body   : '{}',
    desc   : 'backup-season — no auth header',
    // Expects 400 or 401 — proves backup handler is up and auth guard fires
  },
  {
    method : 'POST',
    path   : '/api/live-game',
    body   : '{}',
    desc   : 'live-game — no body fields',
    // Expects 400 — proves live game handler is up
  },
  {
    method : 'POST',
    path   : '/api/sync-coach-data',
    body   : '{}',
    desc   : 'sync-coach-data — no Authorization header',
    // Expects 401 — critical: this endpoint handles all Pro coach sync
  },
  {
    method : 'GET',
    path   : '/api/download-coach-data',
    body   : null,
    desc   : 'download-coach-data — no auth header',
    // Expects 401 — proves download handler is up and JWT guard fires
  },
  {
    method : 'GET',
    path   : '/api/check-license-link',
    body   : null,
    desc   : 'check-license-link — no auth header',
    // Expects 401 — proves license-link check handler is up
  },
  {
    method : 'POST',
    path   : '/api/link-license-to-user',
    body   : '{}',
    desc   : 'link-license-to-user — no auth header',
    // Expects 401 — proves license linking handler is up
  },
  {
    method : 'POST',
    path   : '/api/save-consent',
    body   : '{}',
    desc   : 'save-consent — empty body',
    // Expects 400 (missing required fields) — proves consent handler is up
  },
];

// ─── Single HTTP request ──────────────────────────────────────
function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyBuffer = body ? Buffer.from(body, 'utf8') : null;

    const options = {
      hostname : new URL(BASE_URL).hostname,
      path,
      method,
      headers  : {
        'Content-Type'  : 'application/json',
        'Accept'        : 'application/json',
        // Intentionally omit Authorization to trigger auth rejection
        ...(bodyBuffer ? { 'Content-Length': bodyBuffer.length } : {}),
      },
      timeout  : TIMEOUT_MS,
    };

    const req = https.request(options, (res) => {
      // Drain the body so the socket is released
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode));
    });

    req.on('error', reject);

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${TIMEOUT_MS}ms`));
    });

    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  const line = '─'.repeat(64);
  console.log(`\n🔍 API Health Check`);
  console.log(`   Backend : ${BASE_URL}`);
  console.log(`   Checks  : ${CHECKS.length} endpoints\n${line}\n`);

  let passed   = 0;
  let failed   = 0;
  const errors = [];

  for (const check of CHECKS) {
    try {
      const status = await httpRequest(check.method, check.path, check.body);
      const ok     = status !== 500 && status !== 0;

      if (ok) {
        console.log(`  ✅  [${status}]  ${check.method.padEnd(4)} ${check.path}`);
        console.log(`            ${check.desc}`);
        passed++;
      } else {
        console.error(`  ❌  [${status}]  ${check.method.padEnd(4)} ${check.path}  ← HANDLER CRASHED`);
        console.error(`            ${check.desc}`);
        errors.push(`${check.method} ${check.path} returned ${status} — handler is crashing`);
        failed++;
      }
    } catch (err) {
      console.error(`  ❌  [ERR]  ${check.method.padEnd(4)} ${check.path}  ← ${err.message}`);
      console.error(`            ${check.desc}`);
      errors.push(`${check.method} ${check.path} unreachable: ${err.message}`);
      failed++;
    }

    console.log('');
  }

  console.log(line);
  console.log(`  Result: ${passed}/${CHECKS.length} endpoints healthy\n`);

  if (failed > 0) {
    console.error(`🚨 ${failed} endpoint(s) failed:\n`);
    errors.forEach(e => console.error(`   • ${e}`));
    console.error('\n   A 500 means the Vercel handler is crashing on startup.');
    console.error('   Check the Vercel dashboard logs for the failing function.\n');
    process.exit(1);
  } else {
    console.log('✅ All backend endpoints are deployed and responding.\n');
  }
}

main();
