// =============================================================
//  CGMax FFTP — SSL/TLS Certificate Expiry Check
//
//  Checks the TLS certificate expiry date for every production
//  domain. Exits non-zero (fails CI / workflow) if any cert
//  expires within WARN_DAYS days, giving you a 3-week buffer
//  to act before a certificate failure breaks coach sign-ins.
//
//  Domains checked:
//    • cgmaxfftp.com        — main app / GitHub Pages
//    • auth.cgmaxfftp.com   — custom Supabase auth domain
//                             (Google OAuth, Apple OAuth, magic
//                              link all fail if this cert expires)
//
//  Run manually: node scripts/ssl-check.js
//  Called by:   .github/workflows/ssl-monitor.yml (daily 6 AM UTC)
// =============================================================

'use strict';

const tls = require('tls');

const DOMAINS    = ['cgmaxfftp.com', 'auth.cgmaxfftp.com'];
const PORT       = 443;
const WARN_DAYS  = 21;   // alert threshold — 3 weeks of runway
const TIMEOUT_MS = 12000;

// ─── Connect and read the peer certificate ────────────────────
function checkCert(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port: PORT, servername: host, rejectUnauthorized: true },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !cert.valid_to) {
          return reject(new Error(`No valid certificate returned for ${host}`));
        }

        const expiry   = new Date(cert.valid_to);
        const now      = new Date();
        const daysLeft = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
        const issuer   = cert.issuer ? (cert.issuer.O || cert.issuer.CN || 'unknown') : 'unknown';

        resolve({ host, expiry, daysLeft, issuer });
      }
    );

    socket.on('error', reject);

    // Hard timeout — don't let a stalled DNS hang the workflow
    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy();
      reject(new Error(`Connection to ${host}:${PORT} timed out after ${TIMEOUT_MS}ms`));
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  const line = '─'.repeat(62);
  console.log(`\n🔒 SSL Certificate Expiry Check\n${line}`);
  console.log(`   Domains : ${DOMAINS.join(', ')}`);
  console.log(`   Threshold: warn if < ${WARN_DAYS} days remaining\n`);

  let failures = 0;

  for (const host of DOMAINS) {
    try {
      const { expiry, daysLeft, issuer } = await checkCert(host);
      const expiryStr = expiry.toDateString();

      if (daysLeft < 0) {
        // Already expired
        console.error(`  ❌  EXPIRED   ${host}`);
        console.error(`               Expired ${Math.abs(daysLeft)} days ago on ${expiryStr}`);
        console.error(`               Issuer : ${issuer}`);
        failures++;
      } else if (daysLeft < WARN_DAYS) {
        // Expiring soon — alert
        console.error(`  ⚠️   EXPIRING  ${host}`);
        console.error(`               ${daysLeft} days remaining — expires ${expiryStr}`);
        console.error(`               Issuer : ${issuer}`);
        console.error(`               ACTION REQUIRED: renew before coaches lose sign-in access\n`);
        failures++;
      } else {
        // Healthy
        console.log(`  ✅  OK         ${host}`);
        console.log(`               ${daysLeft} days remaining — expires ${expiryStr}`);
        console.log(`               Issuer : ${issuer}`);
      }
    } catch (err) {
      console.error(`  ❌  ERROR      ${host}`);
      console.error(`               ${err.message}`);
      failures++;
    }

    console.log('');
  }

  console.log(line);

  if (failures > 0) {
    console.error(`\n🚨 ${failures} domain(s) need attention — see details above.`);
    console.error('   If auth.cgmaxfftp.com expires, all Google/Apple/magic-link sign-ins will fail.\n');
    process.exit(1);
  } else {
    console.log(`\n✅ All ${DOMAINS.length} certificates are healthy. No action required.\n`);
  }
}

main();
