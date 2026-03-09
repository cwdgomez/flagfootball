// =============================================================
//  CGMax FFTP — Supabase Schema Drift Detector
//
//  Probes the live Supabase REST API to verify all expected
//  tables and key columns still exist.  Uses only Node.js
//  built-ins (https module) — no npm install required.
//
//  HOW IT WORKS:
//    For each table, it sends:
//      GET /rest/v1/<table>?select=<col1>,<col2>&limit=0
//    with the public anon key.
//
//    Response interpretation:
//      200 (empty array)    → table + columns exist, RLS allows reads ✅
//      401 / 403            → table + columns exist, RLS blocks reads  ✅
//      400 "does not exist" → table or column was dropped / renamed    ❌
//      5xx                  → Supabase REST API is down               ❌
//
//  WHY THIS MATTERS:
//    Vercel backend functions (backup-season, sync-coach-data, etc.)
//    read and write these tables on every coach action.  A renamed or
//    dropped column silently corrupts coach data with no visible error
//    until a coach notices their stats or roster disappeared.
//
//  CREDENTIALS:
//    Reads SUPABASE_URL and SUPABASE_ANON_KEY from app.html.
//    Both are intentionally public (anon key, not service role).
//
//  Run manually: node scripts/schema-check.js
//  Called by:   .github/workflows/schema-monitor.yml
// =============================================================

'use strict';

const fs    = require('fs');
const https = require('https');
const path  = require('path');

// ─── Read Supabase config from app.html ───────────────────────
const appHtml = fs.readFileSync(path.resolve(__dirname, '..', 'app.html'), 'utf8');

const urlMatch = appHtml.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
const keyMatch = appHtml.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

if (!urlMatch || !keyMatch) {
  console.error('❌ Could not extract SUPABASE_URL or SUPABASE_ANON_KEY from app.html');
  process.exit(1);
}

const SUPABASE_URL      = urlMatch[1];   // e.g. https://auth.cgmaxfftp.com
const SUPABASE_ANON_KEY = keyMatch[1];
const TIMEOUT_MS        = 15000;

// ─── Expected schema ─────────────────────────────────────────
// Each entry: table name → array of columns that MUST exist.
// Derived from Vercel backend endpoint behavior and app.html
// Supabase client calls.  Add columns here as the schema grows.
//
// NOTE: RLS may prevent the anon key from reading rows, but the
// REST API still validates table/column names before applying
// auth.  A 401/403 response means the schema is intact.
const EXPECTED_SCHEMA = [
  {
    table   : 'coach_profiles',
    columns : ['id', 'email', 'display_name', 'created_at'],
    note    : 'Core coach identity — used on every sign-in',
  },
  {
    table   : 'season_backups',
    columns : ['id', 'coach_id', 'data', 'created_at'],
    note    : 'Cloud backups created by /api/backup-season',
  },
  {
    table   : 'licenses',
    columns : ['id', 'license_key', 'coach_id', 'status', 'created_at'],
    note    : 'License validation — checked on every app load',
  },
  {
    table   : 'consent_records',
    columns : ['id', 'coach_id', 'player_name', 'consented_at'],
    note    : 'COPPA consent audit trail — required for legal compliance',
  },
  {
    table   : 'live_games',
    columns : ['id', 'coach_id', 'channel_id', 'game_data', 'updated_at'],
    note    : 'Realtime scoreboard data used by Live Parent Scoreboard',
  },
  {
    table   : 'coach_data',
    columns : ['id', 'coach_id', 'data', 'updated_at'],
    note    : 'Synced coach roster/stats from /api/sync-coach-data',
  },
];

// ─── HTTP helper ─────────────────────────────────────────────
function probe(table, columns) {
  return new Promise((resolve) => {
    const selectParam = encodeURIComponent(columns.join(','));
    const urlPath     = `/rest/v1/${table}?select=${selectParam}&limit=0`;
    const host        = SUPABASE_URL.replace(/^https?:\/\//, '');

    const options = {
      hostname : host,
      path     : urlPath,
      method   : 'GET',
      timeout  : TIMEOUT_MS,
      headers  : {
        'apikey'        : SUPABASE_ANON_KEY,
        'Authorization' : `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept'        : 'application/json',
      },
    };

    let body = '';
    const req = https.request(options, (res) => {
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: null, body: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      resolve({ status: null, body: err.message });
    });

    req.end();
  });
}

// ─── Drift detector ──────────────────────────────────────────
// A response signals schema drift when the body contains a
// PostgREST "does not exist" error regardless of status code.
function isDriftError(body) {
  try {
    const json = JSON.parse(body);
    const msg  = (json.message || json.hint || json.details || '').toLowerCase();
    return (
      msg.includes('does not exist') ||
      msg.includes('undefined_table') ||
      msg.includes('undefined_column') ||
      msg.includes('relation') && msg.includes('not exist')
    );
  } catch (_) {
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n🗄️  Supabase Schema Drift Detector');
  console.log(`   URL    : ${SUPABASE_URL}`);
  console.log(`   Tables : ${EXPECTED_SCHEMA.length}`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms\n`);

  let passed  = 0;
  let failed  = 0;
  const fails = [];

  for (const { table, columns, note } of EXPECTED_SCHEMA) {
    process.stdout.write(`   Checking ${table} (${columns.join(', ')}) … `);

    const { status, body } = await probe(table, columns);

    if (status === null) {
      // Network error or timeout
      console.log(`❌ UNREACHABLE — ${body}`);
      failed++;
      fails.push({ table, columns, reason: body });
      continue;
    }

    if (isDriftError(body)) {
      // PostgREST reports the table or a column does not exist
      let detail = '';
      try {
        const json = JSON.parse(body);
        detail = json.message || json.hint || body;
      } catch (_) {
        detail = body.slice(0, 200);
      }
      console.log(`❌ SCHEMA DRIFT — ${detail}`);
      failed++;
      fails.push({ table, columns, reason: detail, note });
      continue;
    }

    if (status >= 500) {
      console.log(`❌ SERVER ERROR — HTTP ${status}`);
      failed++;
      fails.push({ table, columns, reason: `HTTP ${status}` });
      continue;
    }

    // 200 (schema visible) or 401/403 (schema intact, RLS blocking) — both are healthy
    console.log(`✅ OK (HTTP ${status})`);
    passed++;
  }

  console.log(`\n─────────────────────────────────────────────`);
  console.log(`   Passed : ${passed} / ${EXPECTED_SCHEMA.length}`);
  console.log(`   Failed : ${failed} / ${EXPECTED_SCHEMA.length}`);

  if (failed > 0) {
    console.error('\n❌ Schema drift detected on the following tables:\n');
    for (const f of fails) {
      console.error(`   • ${f.table}`);
      console.error(`     Columns checked : ${f.columns.join(', ')}`);
      console.error(`     Error           : ${f.reason}`);
      if (f.note) console.error(`     Used by         : ${f.note}`);
      console.error('');
    }
    console.error('   A table or column was likely renamed, dropped, or migrated.');
    console.error('   Update the schema in scripts/schema-check.js if intentional,');
    console.error('   or roll back the migration if accidental.\n');
    process.exit(1);
  }

  console.log('\n✅ All tables and columns confirmed present — no schema drift.\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('Unexpected error:', e.message);
  process.exit(1);
});
