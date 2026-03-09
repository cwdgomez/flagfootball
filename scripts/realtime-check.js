// =============================================================
//  CGMax FFTP — Supabase Realtime Health Check
//
//  Tests the full Supabase Realtime pipeline by:
//    1. Connecting to the Realtime WebSocket server
//    2. Joining a broadcast channel (same mechanism used by
//       the live parent scoreboard and Stat Coach mode)
//    3. Broadcasting a test message with self:true
//    4. Asserting the message is received back within TIMEOUT_MS
//    5. Disconnecting cleanly
//
//  WHY THIS MATTERS:
//    Both the Live Parent Scoreboard and Stat Coach mode depend
//    entirely on Supabase Realtime broadcast channels. If the
//    Realtime service is degraded or misconfigured, coaches can
//    activate the feature but parents and secondary coaches
//    receive nothing — silently broken.
//
//  REQUIREMENTS:
//    Needs the 'ws' npm package: npm install ws --no-save
//    The Supabase ANON key and URL are read from app.html
//    (where they are intentionally hardcoded as public values).
//
//  Run manually: npm install ws --no-save && node scripts/realtime-check.js
//  Called by:   .github/workflows/realtime-monitor.yml
// =============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Read Supabase config from app.html ───────────────────────
// These values are intentionally public (anon key, not service role).
const appHtml = fs.readFileSync(path.resolve(__dirname, '..', 'app.html'), 'utf8');

const urlMatch  = appHtml.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
const keyMatch  = appHtml.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

if (!urlMatch || !keyMatch) {
  console.error('❌ Could not extract SUPABASE_URL or SUPABASE_ANON_KEY from app.html');
  process.exit(1);
}

const SUPABASE_URL      = urlMatch[1];    // e.g. https://auth.cgmaxfftp.com
const SUPABASE_ANON_KEY = keyMatch[1];
const TIMEOUT_MS        = 8000;           // 8 seconds — allows for cold start
const TEST_CHANNEL      = 'realtime:fftp_ci_healthcheck';
const TEST_PAYLOAD      = { type: 'broadcast', event: 'ci_ping', payload: { ts: Date.now() } };

// ─── Load ws ─────────────────────────────────────────────────
let WebSocket;
try {
  WebSocket = require('ws');
} catch (e) {
  console.error('❌ ws package not found. Run: npm install ws --no-save');
  process.exit(1);
}

// ─── Build the Realtime WebSocket URL ────────────────────────
// Supabase Realtime uses the Phoenix WebSocket protocol.
// vsn=1.0.0 is the required protocol version for Realtime v2.
const wsUrl = SUPABASE_URL.replace(/^https?/, 'wss') +
  `/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

// ─── Phoenix frame helpers ────────────────────────────────────
let ref = 0;
const nextRef = () => String(++ref);

function frame(topic, event, payload, joinRef = null) {
  return JSON.stringify({ topic, event, payload, ref: nextRef(), join_ref: joinRef });
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n📡 Supabase Realtime Health Check`);
  console.log(`   URL     : ${SUPABASE_URL}`);
  console.log(`   Channel : ${TEST_CHANNEL}`);
  console.log(`   Timeout : ${TIMEOUT_MS}ms\n`);

  return new Promise((resolve) => {
    let timer;
    let joinRef;
    let joined    = false;
    let received  = false;

    const ws = new WebSocket(wsUrl);

    const fail = (reason) => {
      clearTimeout(timer);
      ws.terminate();
      console.error(`\n❌ Realtime check FAILED: ${reason}`);
      console.error('   This means Stat Coach mode and the Live Parent Scoreboard');
      console.error('   may be silently broken for coaches right now.\n');
      process.exit(1);
    };

    const succeed = () => {
      clearTimeout(timer);
      ws.close();
      console.log('✅ Realtime broadcast round-trip confirmed — channel joined and message received.');
      console.log('   Live Parent Scoreboard and Stat Coach pipeline are healthy.\n');
      resolve();
      process.exit(0);
    };

    timer = setTimeout(() => fail(`No broadcast received within ${TIMEOUT_MS}ms`), TIMEOUT_MS);

    ws.on('error', (err) => fail(`WebSocket error: ${err.message}`));

    ws.on('open', () => {
      console.log('   🔌 WebSocket connected');

      // Step 1: Join the broadcast channel
      joinRef = nextRef();
      ws.send(JSON.stringify({
        topic    : TEST_CHANNEL,
        event    : 'phx_join',
        payload  : { config: { broadcast: { self: true } } },
        ref      : joinRef,
        join_ref : joinRef,
      }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (_) { return; }

      const ev = msg.event;
      const tp = msg.topic;

      // Heartbeat reply — send heartbeat back
      if (tp === 'phoenix' && ev === 'phx_reply') return;

      // Channel join confirmed
      if (tp === TEST_CHANNEL && ev === 'phx_reply' && !joined) {
        if (msg.payload?.status === 'ok') {
          joined = true;
          console.log('   ✅ Channel joined');

          // Step 2: Broadcast a test message (self:true means we receive our own broadcast)
          ws.send(JSON.stringify({
            topic    : TEST_CHANNEL,
            event    : 'broadcast',
            payload  : TEST_PAYLOAD,
            ref      : nextRef(),
            join_ref : joinRef,
          }));
          console.log('   📤 Test broadcast sent');
        } else {
          fail(`Channel join rejected: ${JSON.stringify(msg.payload)}`);
        }
        return;
      }

      // Broadcast received back (self:true echo)
      if (tp === TEST_CHANNEL && ev === 'broadcast' && !received) {
        received = true;
        console.log('   📥 Broadcast received back — round-trip complete');
        succeed();
      }
    });
  });
}

main().catch((e) => {
  console.error('Unexpected error:', e.message);
  process.exit(1);
});
