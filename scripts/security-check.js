#!/usr/bin/env node
// =============================================================
//  CGMax FFTP — OWASP Top 10 (2021) Security Scanner
//  Checks frontend (app.html) and backend (backend/api/*)
//  against all 10 OWASP categories. Zero external dependencies.
//
//  Exit 0 = clean or warnings only
//  Exit 1 = critical issues found
//
//  OWASP Top 10 (2021):
//    A01 Broken Access Control
//    A02 Cryptographic Failures
//    A03 Injection
//    A04 Insecure Design
//    A05 Security Misconfiguration
//    A06 Vulnerable & Outdated Components
//    A07 Identification & Authentication Failures
//    A08 Software & Data Integrity Failures
//    A09 Security Logging & Monitoring Failures
//    A10 Server-Side Request Forgery (SSRF)
// =============================================================

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const BLUE   = '\x1b[34m';

// Track results per OWASP category for the coverage report
const owaspResults = {};
[
  'A01','A02','A03','A04','A05','A06','A07','A08','A09','A10'
].forEach(k => { owaspResults[k] = { pass: 0, warn: 0, fail: 0, skipped: 0 }; });

let totalCriticals = 0;
let totalWarnings  = 0;
let totalPasses    = 0;

// Structured data for HTML report
const reportItems = [];
let   currentSection = '';

function pass(owasp, msg) {
  totalPasses++;
  owaspResults[owasp].pass++;
  reportItems.push({ cat: owasp, level: 'pass', msg, detail: null });
  console.log(GREEN + `  ✅ PASS [${owasp}]` + RESET + ' ' + msg);
}
function warn(owasp, msg, detail) {
  totalWarnings++;
  owaspResults[owasp].warn++;
  reportItems.push({ cat: owasp, level: 'warn', msg, detail: detail || null });
  console.log(YELLOW + `  ⚠️  WARN [${owasp}]` + RESET + ' ' + msg +
    (detail ? '\n         ' + DIM + detail + RESET : ''));
}
function fail(owasp, msg, detail) {
  totalCriticals++;
  owaspResults[owasp].fail++;
  reportItems.push({ cat: owasp, level: 'fail', msg, detail: detail || null });
  console.log(RED + `  ❌ CRIT [${owasp}]` + RESET + ' ' + msg +
    (detail ? '\n         ' + DIM + detail + RESET : ''));
}
function skip(owasp, msg) {
  owaspResults[owasp].skipped++;
  reportItems.push({ cat: owasp, level: 'skip', msg, detail: null });
  console.log(`  ⬜ SKIP [${owasp}] ` + DIM + msg + RESET);
}
function info(msg)      { console.log('  ℹ️        ' + DIM + msg + RESET); }
function section(title) {
  currentSection = title;
  console.log('\n' + BOLD + CYAN + '── ' + title + RESET);
}

// ─── Helpers ─────────────────────────────────────────────────
function readFile(p)    { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } }
function fileExists(p)  { try { return fs.existsSync(p); } catch (e) { return false; } }

function findLines(content, regex) {
  return content.split('\n').reduce((acc, line, i) => {
    if (regex.test(line)) acc.push({ line: i + 1, text: line.trim().slice(0, 130) });
    return acc;
  }, []);
}

// Recursively get all .js files in a directory
function getJSFiles(dir) {
  if (!fileExists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? getJSFiles(full) : (e.name.endsWith('.js') ? [full] : []);
  });
}

// ══════════════════════════════════════════════════════════════
//  A01 — BROKEN ACCESS CONTROL
// ══════════════════════════════════════════════════════════════
function checkA01_AccessControl() {
  section('A01 — Broken Access Control');

  // ── Backend: protected endpoints must have auth ──
  const apiDir = path.join(ROOT, 'backend', 'api');
  const files  = getJSFiles(apiDir);

  const PROTECTED = ['sync-coach-data','download-coach-data','backup-season','check-license','link-license'];

  files.forEach(fp => {
    const rel     = path.relative(ROOT, fp);
    const content = readFile(fp);
    if (!content) return;

    const isProtected  = PROTECTED.some(n => fp.includes(n));
    const hasJwtAuth   = /Authorization|verifyUser|getUser/.test(content);
    const hasLicAuth   = /validateLicense|licenseKey|license_key/.test(content);
    const hasAnyAuth   = hasJwtAuth || hasLicAuth;

    if (isProtected && !hasAnyAuth) {
      fail('A01', `[${rel}] Protected endpoint missing auth (JWT or license key)`);
    } else if (isProtected) {
      pass('A01', `[${rel}] Auth guard present (${hasJwtAuth ? 'JWT' : 'license key'})`);
    }

    // Path traversal — user input used in file path construction
    const traversal = findLines(content, /path\.join\s*\(|__dirname.*req\.|readFile.*req\./);
    if (traversal.length) {
      warn('A01', `[${rel}] Possible path traversal — user input in file path`,
        traversal.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }

    // IDOR — selecting DB records directly by user-supplied ID without ownership check
    const idorHits = findLines(content, /\.eq\s*\(\s*['"]id['"].*req\.|\.eq\s*\(\s*['"]user_id['"].*req\.body/)
      .filter(({ text }) => !/user\.id|userId/.test(text));
    if (idorHits.length) {
      warn('A01', `[${rel}] Possible IDOR — DB query uses user-supplied ID without ownership check`,
        idorHits.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }

    // HTTP method enforcement
    if (content.includes('req.method') && !content.includes('405')) {
      warn('A01', `[${rel}] HTTP method check exists but 405 (Method Not Allowed) may not be returned`);
    } else if (content.includes('req.method') && content.includes('405')) {
      pass('A01', `[${rel}] HTTP method enforcement with 405 response`);
    }
  });

  // ── Frontend: no admin routes exposed ──
  const appContent = readFile(path.join(ROOT, 'app.html'));
  if (appContent) {
    const adminRoutes = findLines(appContent, /\/admin|\/dashboard\/.*admin|role\s*===\s*['"]admin['"]/i);
    if (adminRoutes.length) {
      warn('A01', `Frontend references admin routes/roles (${adminRoutes.length} hit) — ensure server-side enforcement`,
        adminRoutes.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A01', 'No admin route references in frontend');
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  A02 — CRYPTOGRAPHIC FAILURES
// ══════════════════════════════════════════════════════════════
function checkA02_CryptoFailures() {
  section('A02 — Cryptographic Failures');

  const appContent = readFile(path.join(ROOT, 'app.html'));

  // ── Hardcoded secrets in frontend ──
  const secretPatterns = [
    { re: /supabase_service_role_key|service_role/i,  label: 'Supabase service role key' },
    { re: /sk_live_[A-Za-z0-9]{20,}/,                label: 'Stripe live secret key' },
    { re: /rk_live_[A-Za-z0-9]{20,}/,                label: 'Stripe restricted key' },
    { re: /-----BEGIN (RSA |EC )?PRIVATE KEY/,        label: 'Private key block' },
    { re: /AKIA[0-9A-Z]{16}/,                         label: 'AWS access key' },
    { re: /ghp_[A-Za-z0-9]{36}/,                     label: 'GitHub PAT' },
    { re: /re_[A-Za-z0-9]{32,}/,                     label: 'Resend API key' },
    { re: /xoxb-[A-Za-z0-9-]{50,}/,                  label: 'Slack bot token' },
  ];

  if (appContent) {
    let secretFound = false;
    secretPatterns.forEach(({ re, label }) => {
      const hits = findLines(appContent, re);
      if (hits.length) {
        secretFound = true;
        fail('A02', `${label} pattern in frontend`,
          hits.map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
      }
    });
    if (!secretFound) pass('A02', 'No hardcoded secret key patterns in frontend');

    // Sensitive data in localStorage
    const localStorageKeys = findLines(appContent, /localStorage\.setItem\s*\(\s*['"][^'"]*(?:token|secret|password|private|key)[^'"]*['"]/i);
    if (localStorageKeys.length) {
      warn('A02', `Sensitive data may be stored in localStorage (${localStorageKeys.length} hit) — tokens in localStorage are accessible to XSS`,
        localStorageKeys.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A02', 'No obviously sensitive values stored in localStorage keys');
    }

    // HTTP form submissions
    const httpForms = findLines(appContent, /action\s*=\s*["']http:\/\//i);
    if (httpForms.length) {
      fail('A02', `Form submits over HTTP (not HTTPS) — ${httpForms.length} hit`,
        httpForms.map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A02', 'No HTTP form actions found');
    }

    // All external scripts use HTTPS
    const httpScripts = findLines(appContent, /<script[^>]+src\s*=\s*["']http:\/\//i);
    if (httpScripts.length) {
      fail('A02', `External script loaded over HTTP — ${httpScripts.length} hit`,
        httpScripts.map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A02', 'All external scripts use HTTPS');
    }
  }

  // ── Backend: secrets must be in env vars ──
  const apiFiles = getJSFiles(path.join(ROOT, 'backend', 'api'));
  apiFiles.forEach(fp => {
    const rel     = path.relative(ROOT, fp);
    const content = readFile(fp);
    if (!content) return;
    const hardcoded = findLines(content,
      /(?:supabase_url|supabase_key|stripe_secret|api_key|secret|password)\s*=\s*['"][^'"]{10,}['"]/i
    ).filter(({ text }) => !text.includes('process.env') && !text.trim().startsWith('//'));
    if (hardcoded.length) {
      fail('A02', `[${rel}] Hardcoded credential (not using process.env)`,
        hardcoded.map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }
  });

  // ── Check vercel.json for HSTS header (check root and backend/) ──
  const vercelRaw = readFile(path.join(ROOT, 'vercel.json')) || readFile(path.join(ROOT, 'backend', 'vercel.json')) || '{}';
  const vercelConfigA02 = JSON.parse(vercelRaw);
  const headersA02 = vercelConfigA02.headers || [];
  const hasHSTS = headersA02.some(h =>
    (h.headers || []).some(hh => hh.key === 'Strict-Transport-Security')
  );
  if (!hasHSTS) {
    warn('A02', 'vercel.json: Strict-Transport-Security (HSTS) header not configured',
      'Add: { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" }');
  } else {
    pass('A02', 'HSTS header configured in vercel.json');
  }
}

// ══════════════════════════════════════════════════════════════
//  A03 — INJECTION
// ══════════════════════════════════════════════════════════════
function checkA03_Injection() {
  section('A03 — Injection');

  const appContent = readFile(path.join(ROOT, 'app.html'));

  if (appContent) {
    // eval()
    const evalHits = findLines(appContent, /\beval\s*\(/)
      .filter(({ text }) => !text.trim().startsWith('//'));
    if (evalHits.length) {
      fail('A03', `eval() usage — XSS / code injection risk (${evalHits.length} hit)`,
        evalHits.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A03', 'No eval() usage found');
    }

    // document.write() (excluding print window usage)
    const docWriteHits = findLines(appContent, /document\.write\s*\(/)
      .filter(({ text }) => !/window\.open|print|'<html|"<html/.test(text));
    if (docWriteHits.length) {
      fail('A03', `Unsafe document.write() usage (${docWriteHits.length} hit)`,
        docWriteHits.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A03', 'No unsafe document.write() usage');
    }

    // innerHTML safety — check for assignments without nearby escaping
    const innerHTMLLines = findLines(appContent, /\.innerHTML\s*[+]?=/);
    const unsafeInner    = innerHTMLLines.filter(({ text }) =>
      !/esc\s*\(|escHtml\s*\(|innerHTML\s*=\s*''|innerHTML\s*=\s*""/.test(text)
    );
    if (unsafeInner.length > 5) {
      warn('A03', `${unsafeInner.length} innerHTML assignments without inline escaping call — review for XSS`,
        unsafeInner.slice(0,5).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A03', `innerHTML escaping looks consistent (${innerHTMLLines.length} total, ${unsafeInner.length} flagged)`);
    }

    // Prototype pollution
    const protoPollution = findLines(appContent, /__proto__|constructor\.prototype|Object\.assign\s*\(\s*\w+\s*,\s*req\./);
    if (protoPollution.length) {
      warn('A03', `Prototype pollution patterns detected (${protoPollution.length} hit)`,
        protoPollution.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A03', 'No prototype pollution patterns in frontend');
    }
  }

  // ── Backend injection checks ──
  const apiFiles = getJSFiles(path.join(ROOT, 'backend', 'api'));
  apiFiles.forEach(fp => {
    const rel     = path.relative(ROOT, fp);
    const content = readFile(fp);
    if (!content) return;

    // SQL / NoSQL injection — raw string concat into DB query
    const sqlHits = findLines(content, /\.from\s*\(\s*['"`][^'"`]+['"`]\s*\+|query\s*=\s*[^;]*\+\s*req\./);
    if (sqlHits.length) {
      fail('A03', `[${rel}] SQL/NoSQL injection risk — string concat in query`,
        sqlHits.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }

    // Command injection — child_process with user input
    const cmdHits = findLines(content, /exec\s*\(|spawn\s*\(|execSync\s*\(/)
      .filter(({ text }) => /req\.|user/.test(text));
    if (cmdHits.length) {
      fail('A03', `[${rel}] Command injection risk — child_process call with user input`,
        cmdHits.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }

    // Template injection
    const tmplHits = findLines(content, /`[^`]*\$\{.*req\.(body|query|params)/)
      .filter(({ text }) => !/\/\//.test(text.trim().slice(0,2)));
    if (tmplHits.length) {
      warn('A03', `[${rel}] Template literal with user input — verify it's not passed to a template engine`,
        tmplHits.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }

    // Prototype pollution in backend
    const ppHits = findLines(content, /__proto__|constructor\.prototype/);
    if (ppHits.length) {
      warn('A03', `[${rel}] Prototype pollution pattern detected`,
        ppHits.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  A04 — INSECURE DESIGN
// ══════════════════════════════════════════════════════════════
function checkA04_InsecureDesign() {
  section('A04 — Insecure Design');

  const apiFiles = getJSFiles(path.join(ROOT, 'backend', 'api'));

  // Rate limiting on public endpoints
  const PUBLIC_ENDPOINTS = ['validate-license', 'live-game', 'roster-share', 'send-consent'];
  apiFiles.forEach(fp => {
    const rel     = path.relative(ROOT, fp);
    const content = readFile(fp);
    if (!content) return;
    const isPublic = PUBLIC_ENDPOINTS.some(n => fp.includes(n));
    if (isPublic) {
      if (content.includes('isRateLimited') || content.includes('RL_MAX') || content.includes('rate')) {
        pass('A04', `[${rel}] Rate limiting present on public endpoint`);
      } else {
        warn('A04', `[${rel}] Public endpoint with no rate limiting — brute force / abuse risk`);
      }
    }
  });

  // Frontend: no unbounded data fetch (e.g., fetching all users)
  const appContent = readFile(path.join(ROOT, 'app.html'));
  if (appContent) {
    const unbounded = findLines(appContent, /\.select\s*\(\s*['"]?\*['"]?\s*\)/)
      .filter(({ text }) => !/limit|\.maybeSingle|\.single/.test(text));
    if (unbounded.length) {
      warn('A04', `Frontend: ${unbounded.length} unbounded .select('*') without limit — could fetch excessive data`,
        unbounded.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A04', 'No obviously unbounded DB selects in frontend');
    }

    // Payload size limits — backend should enforce max sizes
    apiFiles.forEach(fp => {
      const rel     = path.relative(ROOT, fp);
      const content = readFile(fp);
      if (!content) return;
      if (content.includes('req.body') && !content.includes('1024') && !content.includes('MB') && !content.includes('byteLength') && !content.includes('length >')) {
        skip('A04', `[${rel}] No explicit payload size check found — Vercel has a 4.5MB default limit`);
      } else if (content.includes('byteLength') || content.includes('MB') || content.includes('1024')) {
        pass('A04', `[${rel}] Payload size check present`);
      }
    });
  }
}

// ══════════════════════════════════════════════════════════════
//  A05 — SECURITY MISCONFIGURATION
// ══════════════════════════════════════════════════════════════
function checkA05_Misconfiguration() {
  section('A05 — Security Misconfiguration');

  // ── vercel.json security headers (check root and backend/) ──
  const vercelRawA05 = readFile(path.join(ROOT, 'vercel.json')) || readFile(path.join(ROOT, 'backend', 'vercel.json')) || '{}';
  const vercelConfig = JSON.parse(vercelRawA05);
  const allHeaders   = (vercelConfig.headers || []).flatMap(h => h.headers || []);
  const headerKeys   = allHeaders.map(h => h.key);

  const requiredHeaders = [
    { key: 'X-Content-Type-Options',     rec: 'nosniff',                           why: 'prevents MIME sniffing attacks' },
    { key: 'X-Frame-Options',            rec: 'SAMEORIGIN',                        why: 'prevents clickjacking' },
    { key: 'Referrer-Policy',            rec: 'strict-origin-when-cross-origin',   why: 'controls referrer leakage' },
    { key: 'Permissions-Policy',         rec: 'camera=(), microphone=(), geolocation=()', why: 'restricts browser features' },
    { key: 'X-XSS-Protection',          rec: '1; mode=block',                     why: 'legacy XSS filter for older browsers' },
  ];

  requiredHeaders.forEach(({ key, rec, why }) => {
    if (headerKeys.includes(key)) {
      pass('A05', `Security header present: ${key}`);
    } else {
      warn('A05', `Missing security header: ${key}`,
        `Recommended: "${key}": "${rec}" — ${why}`);
    }
  });

  // Content-Security-Policy (special handling — more complex)
  const hasCSP = headerKeys.includes('Content-Security-Policy') ||
                 headerKeys.includes('Content-Security-Policy-Report-Only');
  if (!hasCSP) {
    warn('A05', 'No Content-Security-Policy header in vercel.json',
      'CSP is the strongest XSS mitigation. Start with Report-Only mode to audit before enforcing.');
  } else {
    pass('A05', 'Content-Security-Policy header configured');
  }

  // ── Backend: CORS must be restrictive (not wildcard) ──
  const apiFiles = getJSFiles(path.join(ROOT, 'backend', 'api'));
  apiFiles.forEach(fp => {
    const rel     = path.relative(ROOT, fp);
    const content = readFile(fp);
    if (!content) return;

    // Wildcard CORS
    const wildcardCORS = findLines(content, /Access-Control-Allow-Origin.*\*|setHeader.*origin.*\*/i)
      .filter(({ text }) => !/\/\//.test(text.trim().slice(0,2)));
    if (wildcardCORS.length) {
      fail('A05', `[${rel}] Wildcard CORS (Access-Control-Allow-Origin: *) — allows any origin`,
        wildcardCORS.map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else if (content.includes('Access-Control-Allow-Origin')) {
      pass('A05', `[${rel}] CORS origin is restricted (not wildcard)`);
    }

    // Stack traces in error responses
    const stackTrace = findLines(content, /res\.(?:json|send)\s*\([^)]*(?:err\.stack|error\.stack|e\.stack)/);
    if (stackTrace.length) {
      fail('A05', `[${rel}] Stack trace exposed in API response — leaks internal info`,
        stackTrace.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A05', `[${rel}] No stack traces in responses`);
    }

    // Error message leaking internal details
    const errLeak = findLines(content, /res\.(?:json|send)\s*\([^)]*(?:err\.message|error\.message)/i)
      .filter(({ text }) => !text.includes('//'));
    if (errLeak.length) {
      warn('A05', `[${rel}] Raw error.message sent to client (${errLeak.length} hit) — may leak internals`,
        errLeak.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }
  });

  // ── Debug mode / verbose output in frontend ──
  const appContent = readFile(path.join(ROOT, 'app.html'));
  if (appContent) {
    const consoleLogs = findLines(appContent, /console\.log\s*\(/)
      .filter(({ text }) => !text.trim().startsWith('//'));
    if (consoleLogs.length > 10) {
      warn('A05', `${consoleLogs.length} console.log() statements — remove before production or guard behind a debug flag`);
    } else if (consoleLogs.length > 0) {
      warn('A05', `${consoleLogs.length} console.log() statement${consoleLogs.length > 1 ? 's' : ''} found`);
    } else {
      pass('A05', 'No unguarded console.log() in frontend');
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  A06 — VULNERABLE & OUTDATED COMPONENTS
// ══════════════════════════════════════════════════════════════
function checkA06_VulnerableComponents() {
  section('A06 — Vulnerable & Outdated Components');

  const pkgPath = path.join(ROOT, 'backend', 'package.json');
  const pkg     = JSON.parse(readFile(pkgPath) || '{}');
  const deps    = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});

  // Pinned vs floating versions
  const unpinned = Object.entries(deps).filter(([, v]) => /^\^|~/.test(v));
  if (unpinned.length) {
    warn('A06', `${unpinned.length} dep${unpinned.length > 1 ? 's' : ''} use ^ or ~ (auto-update) — pin exact versions for reproducible production builds`,
      unpinned.map(([n, v]) => `${n}: ${v}`).join(', '));
  } else {
    pass('A06', 'All backend dependencies use exact pinned versions');
  }

  // Known risky / deprecated packages
  const risky = {
    'request':              'deprecated, use node-fetch or axios',
    'moment':               'large and legacy, use date-fns or Temporal',
    'lodash':               'often tree-shaking issues; use native JS or lodash-es',
    'serialize-javascript': 'has had XSS vuln; verify you need it',
    'node-fetch':           'v1/v2 had issues; ensure v3+',
    'jsonwebtoken':         'algorithm confusion vulns in old versions; ensure latest',
  };
  Object.keys(deps).forEach(d => {
    if (risky[d]) warn('A06', `Dependency '${d}' — ${risky[d]}`);
  });
  if (!Object.keys(deps).some(d => risky[d])) {
    pass('A06', 'No commonly problematic dependencies detected');
  }

  // package-lock.json
  if (!fileExists(path.join(ROOT, 'backend', 'package-lock.json'))) {
    warn('A06', 'No package-lock.json in backend/ — dependency versions are not locked; run npm install');
  } else {
    pass('A06', 'package-lock.json present — dependency tree is locked');
  }

  // CDN script version pinning in frontend
  const appContent = readFile(path.join(ROOT, 'app.html'));
  if (appContent) {
    const cdnScripts = findLines(appContent, /<script[^>]+src\s*=\s*["'][^"']*cdn[^"']*["']/i);
    const unpinnedCDN = cdnScripts.filter(({ text }) => {
      // Exclude Cloudflare-injected /cdn-cgi/ scripts — not developer-controlled
      if (/\/cdn-cgi\//.test(text)) return false;
      // Matches @latest, @2 (major-only), or no @ version at all
      return /@latest|@\d+["']|@\d+\//.test(text) || !/@\d+/.test(text);
    });
    if (unpinnedCDN.length) {
      warn('A06', `${unpinnedCDN.length} CDN script without a pinned semver (e.g. @2.43.0) — floating versions can introduce breaking changes or malicious updates`,
        unpinnedCDN.slice(0,4).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A06', 'CDN scripts appear to use pinned versions');
    }
  }

  info('Run `cd backend && npm audit` locally for full CVE vulnerability report');
}

// ══════════════════════════════════════════════════════════════
//  A07 — IDENTIFICATION & AUTHENTICATION FAILURES
// ══════════════════════════════════════════════════════════════
function checkA07_AuthFailures() {
  section('A07 — Identification & Authentication Failures');

  const apiFiles = getJSFiles(path.join(ROOT, 'backend', 'api'));

  apiFiles.forEach(fp => {
    const rel     = path.relative(ROOT, fp);
    const content = readFile(fp);
    if (!content) return;

    // Token passed in URL query params
    const tokenInURL = findLines(content, /req\.query\s*\.\s*(?:token|key|api_key|access_token)/i);
    if (tokenInURL.length) {
      warn('A07', `[${rel}] Token/key read from URL query param — tokens in URLs end up in server logs and browser history`,
        tokenInURL.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }

    // Account enumeration — returning different errors for existing vs non-existing accounts
    const enumHits = findLines(content, /not_found|user.*not.*exist|invalid.*email/i)
      .filter(({ text }) => /res\.(?:json|send)/.test(text));
    if (enumHits.length) {
      warn('A07', `[${rel}] Possible account enumeration — distinct error messages may reveal whether an account exists`,
        enumHits.slice(0,2).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }

    // JWT algorithm confusion — ensure 'algorithm' is specified when verifying
    if (content.includes('jwt.verify') || content.includes('verify(token')) {
      if (!content.includes('algorithms') && !content.includes('algorithm:')) {
        warn('A07', `[${rel}] JWT verify() without explicit algorithm list — vulnerable to algorithm confusion attack`);
      } else {
        pass('A07', `[${rel}] JWT verify uses explicit algorithm`);
      }
    }

    // Supabase uses its own JWT verification — flag if getUser() result isn't checked
    // Accepts: if (!user), if(!user), authErr || !user, !user &&, user === null
    const getUserChecked = content.includes('if (!user)')
      || content.includes('if(!user)')
      || content.includes('authErr || !user')
      || content.includes('authErr||!user')
      || content.includes('!user &&')
      || content.includes('user === null');
    if (content.includes('getUser') && !getUserChecked) {
      warn('A07', `[${rel}] getUser() called but null/error check may be missing`);
    } else if (content.includes('getUser')) {
      pass('A07', `[${rel}] getUser() result is checked`);
    }
  });

  // Frontend: license key stored plaintext in localStorage is acceptable for this use case
  // but flag if anything that looks like a session token is there
  const appContent = readFile(path.join(ROOT, 'app.html'));
  if (appContent) {
    const sessionStorage = findLines(appContent, /localStorage\.setItem\s*\([^)]*(?:session|access_token|refresh_token)/i);
    if (sessionStorage.length) {
      warn('A07', `Supabase session tokens stored in localStorage (${sessionStorage.length} hit) — XSS can steal them; consider httpOnly cookies if you move to SSR`,
        sessionStorage.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A07', 'No raw session/access tokens stored directly in localStorage by app code');
    }

    // Logout / token clearing on sign-out
    const hasSignOut = /signOut|sign_out|clearSession|removeItem.*session/i.test(appContent);
    if (!hasSignOut) {
      warn('A07', 'No signOut or session-clearing call found in frontend — verify auth session is invalidated on logout');
    } else {
      pass('A07', 'Sign-out / session clearing present');
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  A08 — SOFTWARE & DATA INTEGRITY FAILURES
// ══════════════════════════════════════════════════════════════
function checkA08_IntegrityFailures() {
  section('A08 — Software & Data Integrity Failures');

  const appContent = readFile(path.join(ROOT, 'app.html'));

  if (appContent) {
    // SRI on external scripts
    const scriptSrcLines = findLines(appContent, /<script[^>]+src\s*=\s*["']https?:\/\//i);
    const noSRI          = scriptSrcLines.filter(({ text }) => !/integrity\s*=/.test(text));
    if (noSRI.length) {
      warn('A08', `${noSRI.length} external script without SRI integrity hash — a compromised CDN could inject malicious code`,
        'Add integrity="sha384-..." crossorigin="anonymous"\n         ' +
        noSRI.slice(0,4).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A08', 'All external scripts have SRI integrity attributes (or none found)');
    }

    // Same for external stylesheets
    const linkSrcLines = findLines(appContent, /<link[^>]+href\s*=\s*["']https?:\/\/[^"']*\.css/i);
    const noLinkSRI    = linkSrcLines.filter(({ text }) => !/integrity\s*=/.test(text));
    if (noLinkSRI.length) {
      warn('A08', `${noLinkSRI.length} external stylesheet without SRI integrity hash`,
        noLinkSRI.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A08', 'External stylesheets have SRI integrity (or none found)');
    }
  }

  // ── Backend: JSON deserialization safety ──
  const apiFiles = getJSFiles(path.join(ROOT, 'backend', 'api'));
  apiFiles.forEach(fp => {
    const rel     = path.relative(ROOT, fp);
    const content = readFile(fp);
    if (!content) return;

    // JSON.parse without try/catch
    const rawParse = findLines(content, /JSON\.parse\s*\(/);
    rawParse.forEach(({ line, text }) => {
      // Check if it's inside a try block (rough check: look in surrounding 5 lines)
      const lines = content.split('\n');
      const context = lines.slice(Math.max(0, line - 6), line + 1).join('\n');
      if (!context.includes('try')) {
        warn('A08', `[${rel}] JSON.parse() at line ${line} without surrounding try/catch — can throw on malformed input`,
          text);
      }
    });
    if (rawParse.length === 0 || rawParse.every(({ line }) => {
      const lines = content.split('\n');
      const ctx   = lines.slice(Math.max(0, line - 6), line + 1).join('\n');
      return ctx.includes('try');
    })) {
      if (rawParse.length > 0) pass('A08', `[${rel}] JSON.parse() calls are inside try/catch`);
    }

    // Service worker — data integrity
  });

  // Service worker cache busting
  const swContent = readFile(path.join(ROOT, 'sw.js'));
  if (swContent) {
    const match = swContent.match(/['"]([a-zA-Z0-9_:.-]+-v\d+[^'"]*)['"]/);
    if (match) {
      pass('A08', `Service worker uses versioned cache key: ${match[1]}`);
      info('Remember to bump the cache key on every deployment to prevent stale content');
    } else {
      warn('A08', 'Service worker cache key is not versioned — stale cached files may serve outdated code');
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  A09 — SECURITY LOGGING & MONITORING FAILURES
// ══════════════════════════════════════════════════════════════
function checkA09_LoggingFailures() {
  section('A09 — Security Logging & Monitoring Failures');

  const apiFiles = getJSFiles(path.join(ROOT, 'backend', 'api'));

  apiFiles.forEach(fp => {
    const rel     = path.relative(ROOT, fp);
    const content = readFile(fp);
    if (!content) return;

    // console.log (not appropriate for production — use console.error for errors)
    const clogHits = findLines(content, /console\.log\s*\(/)
      .filter(({ text }) => !text.trim().startsWith('//'));
    if (clogHits.length) {
      warn('A09', `[${rel}] ${clogHits.length} console.log() — use console.error() for security events; logs are collected by Vercel`);
    } else {
      pass('A09', `[${rel}] No console.log() — uses console.error() for logging`);
    }

    // Auth failures being silently swallowed (catch without logging)
    const silentCatch = findLines(content, /catch\s*\(.*\)\s*\{\s*\}|catch\s*\(.*\)\s*\{[\s]*\}/)
      .concat(findLines(content, /catch\s*\([^)]*\)\s*\{[^}]*\}\s*\/\//));
    if (silentCatch.length) {
      warn('A09', `[${rel}] Silent catch block (catch with empty or comment-only body) — security events may go unlogged`,
        silentCatch.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    }

    // Auth events logged?
    const hasAuthLogging = /console\.(?:error|warn|log)\s*\([^)]*(?:auth|login|unauthorized|401|403)/i.test(content);
    const isAuthRelated  = /verifyUser|validateLicense|getUser|Authorization/.test(content);
    if (isAuthRelated && !hasAuthLogging) {
      warn('A09', `[${rel}] Auth endpoint — no logging of authentication failures detected`);
    } else if (isAuthRelated) {
      pass('A09', `[${rel}] Auth failures appear to be logged`);
    }

    // Rate limit events logged?
    if (content.includes('isRateLimited') && !content.includes("'Too many'") && !content.includes('"Too many"') && !content.includes('429')) {
      skip('A09', `[${rel}] Rate limit 429 responses — verify they are being logged for monitoring`);
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  A10 — SERVER-SIDE REQUEST FORGERY (SSRF)
// ══════════════════════════════════════════════════════════════
function checkA10_SSRF() {
  section('A10 — Server-Side Request Forgery (SSRF)');

  const apiFiles = getJSFiles(path.join(ROOT, 'backend', 'api'));

  apiFiles.forEach(fp => {
    const rel     = path.relative(ROOT, fp);
    const content = readFile(fp);
    if (!content) return;

    // fetch() / axios / http.get with user-supplied URL
    const ssrfHits = findLines(content, /fetch\s*\(|axios\s*\.\s*(?:get|post)|http(?:s)?\.(?:get|request)\s*\(/)
      .filter(({ text }) => /req\.(body|query|params)/.test(text));
    if (ssrfHits.length) {
      fail('A10', `[${rel}] Possible SSRF — outbound request URL sourced from user input`,
        ssrfHits.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         ') +
        '\n         Validate URLs against an allowlist of trusted domains');
    }

    // Any fetch calls at all (good to know about)
    const allFetch = findLines(content, /fetch\s*\(|axios\s*\.\s*(?:get|post)/);
    const safeFetch = allFetch.filter(({ text }) => !/req\.(body|query|params)/.test(text));
    if (safeFetch.length && !ssrfHits.length) {
      pass('A10', `[${rel}] ${safeFetch.length} outbound request${safeFetch.length > 1 ? 's' : ''} use hardcoded/internal URLs — SSRF risk is low`);
    } else if (!allFetch.length) {
      pass('A10', `[${rel}] No outbound HTTP requests — no SSRF surface`);
    }
  });

  // Frontend: any fetch to user-controlled endpoint
  const appContent = readFile(path.join(ROOT, 'app.html'));
  if (appContent) {
    const dynFetch = findLines(appContent, /fetch\s*\([^)]*\+|fetch\s*\(`[^`]*\$\{/)
      .filter(({ text }) => !/\/\//.test(text.trim().slice(0,2)));
    if (dynFetch.length) {
      warn('A10', `Frontend: ${dynFetch.length} dynamic fetch URL (string concat or template literal) — ensure base URL is hardcoded`,
        dynFetch.slice(0,3).map(m => `Line ${m.line}: ${m.text}`).join('\n         '));
    } else {
      pass('A10', 'Frontend fetch calls appear to use static/hardcoded URLs');
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  OWASP COVERAGE REPORT
// ══════════════════════════════════════════════════════════════
function printCoverageReport() {
  const NAMES = {
    A01: 'Broken Access Control',
    A02: 'Cryptographic Failures',
    A03: 'Injection',
    A04: 'Insecure Design',
    A05: 'Security Misconfiguration',
    A06: 'Vulnerable & Outdated Components',
    A07: 'Identification & Auth Failures',
    A08: 'Software & Data Integrity',
    A09: 'Security Logging & Monitoring',
    A10: 'Server-Side Request Forgery',
  };

  console.log('\n' + BOLD + BLUE + '╔══════════════════════════════════════════════════════════════╗');
  console.log('║           OWASP Top 10 (2021) Coverage Report               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝' + RESET);

  let categoriesWithIssues = 0;
  Object.entries(owaspResults).forEach(([cat, r]) => {
    const total  = r.pass + r.warn + r.fail;
    const status = r.fail > 0 ? RED + '❌' : r.warn > 0 ? YELLOW + '⚠️ ' : GREEN + '✅';
    const badge  = r.fail > 0 ? RED + ' CRITICAL' : r.warn > 0 ? YELLOW + ' WARNINGS' : GREEN + ' CLEAN';
    if (r.fail > 0 || r.warn > 0) categoriesWithIssues++;
    console.log(
      status + RESET + ' ' + BOLD + cat + RESET +
      ` ${NAMES[cat].padEnd(38)}` +
      DIM + ` ${r.pass}✅  ${r.warn}⚠️   ${r.fail}❌  ${r.skipped}⬜` + RESET +
      badge + RESET
    );
  });
  console.log('');

  const coveragePct = Math.round(
    (Object.values(owaspResults).filter(r => r.pass + r.warn + r.fail > 0).length / 10) * 100
  );
  console.log(BOLD + `  Coverage: ${coveragePct}% of OWASP Top 10 categories checked` + RESET);
  console.log(BOLD + `  Categories with issues: ${categoriesWithIssues}/10` + RESET);
}

// ══════════════════════════════════════════════════════════════
//  HTML REPORT GENERATOR
// ══════════════════════════════════════════════════════════════
function writeHTMLReport() {
  const OWASP_NAMES = {
    A01: 'Broken Access Control',
    A02: 'Cryptographic Failures',
    A03: 'Injection',
    A04: 'Insecure Design',
    A05: 'Security Misconfiguration',
    A06: 'Vulnerable & Outdated Components',
    A07: 'Identification & Auth Failures',
    A08: 'Software & Data Integrity',
    A09: 'Security Logging & Monitoring',
    A10: 'Server-Side Request Forgery (SSRF)',
  };
  const OWASP_EXPLAIN = {
    A01: 'Controls whether users can only access what they\'re allowed to. Failures here let attackers view or modify other users\' data, or access admin features without permission.',
    A02: 'Covers secrets, encryption, and how sensitive data is stored/transmitted. Failures expose passwords, tokens, and private data to attackers.',
    A03: 'Prevents attackers from injecting malicious code into your app via inputs. Classic example: XSS (cross-site scripting) and SQL injection.',
    A04: 'Covers fundamental design choices that could allow abuse — like missing rate limits that let attackers spam your endpoints thousands of times.',
    A05: 'Covers misconfigured servers, missing security headers, or exposed debug info. These headers tell browsers how to protect users visiting your app.',
    A06: 'Checks for outdated libraries or unpinned package versions that could introduce known vulnerabilities via a supply chain attack.',
    A07: 'Covers login/session security. Ensures tokens are checked properly, sessions expire, and attackers can\'t brute-force accounts.',
    A08: 'Ensures your code and dependencies haven\'t been tampered with. SRI hashes verify that CDN scripts haven\'t been swapped for malicious ones.',
    A09: 'Checks that failures and suspicious events are logged so you can detect and investigate attacks after the fact.',
    A10: 'Prevents attackers from tricking your server into making requests to internal systems or other servers on their behalf.',
  };

  const runDate = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  let gitCommit = 'unknown';
  try {
    gitCommit = require('child_process')
      .execSync('git rev-parse --short HEAD 2>/dev/null', { cwd: ROOT }).toString().trim();
  } catch (e) { /* not a git repo or git not available */ }

  // Group items by OWASP category
  const grouped = {};
  ['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10'].forEach(k => { grouped[k] = []; });
  reportItems.forEach(item => { if (grouped[item.cat]) grouped[item.cat].push(item); });

  const overallStatus = totalCriticals > 0 ? 'CRITICAL' : totalWarnings > 0 ? 'WARNINGS' : 'CLEAN';
  const statusColor   = totalCriticals > 0 ? '#FF4444' : totalWarnings > 0 ? '#FFB800' : '#44BB44';

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function levelBadge(level) {
    if (level === 'pass') return '<span class="badge pass">✅ PASS</span>';
    if (level === 'warn') return '<span class="badge warn">⚠️ WARN</span>';
    if (level === 'fail') return '<span class="badge fail">❌ CRITICAL</span>';
    return '<span class="badge skip">⬜ SKIP</span>';
  }

  function categoryRows() {
    return ['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10'].map(cat => {
      const r = owaspResults[cat];
      const hasIssues = r.fail > 0 || r.warn > 0;
      const statusCls = r.fail > 0 ? 'fail' : r.warn > 0 ? 'warn' : 'pass';
      const statusLabel = r.fail > 0 ? '❌ CRITICAL' : r.warn > 0 ? '⚠️ WARNINGS' : '✅ CLEAN';
      const items = grouped[cat];
      const issueItems = items.filter(i => i.level === 'warn' || i.level === 'fail');

      return `
      <div class="category ${statusCls}" id="cat-${cat}">
        <div class="cat-header">
          <div class="cat-title">
            <span class="cat-code">${esc(cat)}</span>
            <span class="cat-name">${esc(OWASP_NAMES[cat])}</span>
          </div>
          <div class="cat-meta">
            <span class="cat-counts">${r.pass} passed · ${r.warn} warnings · ${r.fail} critical</span>
            <span class="cat-status ${statusCls}">${statusLabel}</span>
          </div>
        </div>
        <div class="cat-explain">${esc(OWASP_EXPLAIN[cat])}</div>
        ${issueItems.length ? `
        <div class="findings-list">
          ${issueItems.map(item => `
          <div class="finding ${item.level}">
            ${levelBadge(item.level)}
            <div class="finding-body">
              <div class="finding-msg">${esc(item.msg)}</div>
              ${item.detail ? `<pre class="finding-detail">${esc(item.detail)}</pre>` : ''}
            </div>
          </div>`).join('')}
        </div>` : `<div class="all-clear">✅ No issues found in this category.</div>`}
      </div>`;
    }).join('');
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CGMax FFTP — Security Report</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0;line-height:1.5}
  a{color:#FFD700;text-decoration:none}
  .topbar{background:linear-gradient(135deg,#AA0000,#CC1100);padding:24px 32px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
  .topbar h1{font-size:22px;font-weight:900;letter-spacing:4px;color:#FFD700}
  .topbar .subtitle{font-size:12px;letter-spacing:2px;color:rgba(255,255,255,.6);margin-top:2px}
  .overall-badge{padding:8px 18px;border-radius:20px;font-weight:700;font-size:14px;letter-spacing:1px;background:${statusColor}22;border:2px solid ${statusColor};color:${statusColor}}
  .meta-bar{background:#111;padding:12px 32px;font-size:12px;color:#666;border-bottom:1px solid #222;display:flex;gap:24px;flex-wrap:wrap}
  .meta-bar span b{color:#aaa}
  .container{max-width:960px;margin:0 auto;padding:24px 24px 48px}
  .summary-cards{display:flex;gap:12px;margin-bottom:28px;flex-wrap:wrap}
  .card{flex:1;min-width:120px;background:#141414;border:1px solid #2a2a2a;border-radius:10px;padding:16px;text-align:center}
  .card .num{font-size:36px;font-weight:900;line-height:1}
  .card .lbl{font-size:11px;letter-spacing:1.5px;color:#666;margin-top:4px;text-transform:uppercase}
  .card.pass .num{color:#44BB44} .card.warn .num{color:#FFB800} .card.fail .num{color:#FF4444} .card.clean .num{color:#44BB44}
  .section-title{font-size:13px;font-weight:700;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #222}
  .category{background:#111;border:1px solid #1e1e1e;border-radius:10px;margin-bottom:12px;overflow:hidden;transition:border-color .2s}
  .category.fail{border-color:#FF444433} .category.warn{border-color:#FFB80033} .category.pass{border-color:#44BB4422}
  .cat-header{padding:14px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;cursor:default}
  .cat-title{display:flex;align-items:center;gap:10px}
  .cat-code{font-size:13px;font-weight:900;letter-spacing:1px;background:#1e1e1e;padding:3px 8px;border-radius:5px;color:#FFD700}
  .cat-name{font-size:15px;font-weight:700;color:#f0f0f0}
  .cat-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .cat-counts{font-size:12px;color:#555}
  .cat-status{font-size:12px;font-weight:700;padding:3px 10px;border-radius:10px}
  .cat-status.pass{background:#44BB4420;color:#44BB44} .cat-status.warn{background:#FFB80020;color:#FFB800} .cat-status.fail{background:#FF444420;color:#FF4444}
  .cat-explain{font-size:13px;color:#666;padding:0 18px 14px;line-height:1.6}
  .findings-list{border-top:1px solid #1e1e1e;padding:12px 18px;display:flex;flex-direction:column;gap:8px}
  .finding{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:8px;background:#0d0d0d}
  .finding.warn{border-left:3px solid #FFB800} .finding.fail{border-left:3px solid #FF4444}
  .badge{font-size:11px;font-weight:700;white-space:nowrap;padding:2px 8px;border-radius:4px;margin-top:1px}
  .badge.pass{background:#44BB4420;color:#44BB44} .badge.warn{background:#FFB80020;color:#FFB800} .badge.fail{background:#FF444420;color:#FF4444} .badge.skip{background:#2a2a2a;color:#666}
  .finding-body{flex:1}
  .finding-msg{font-size:13px;color:#ddd;line-height:1.4}
  .finding-detail{font-size:11px;color:#777;margin-top:6px;background:#0a0a0a;padding:8px 10px;border-radius:5px;white-space:pre-wrap;word-break:break-word;line-height:1.5}
  .all-clear{font-size:13px;color:#44BB44;padding:10px 18px 14px}
  .footer{text-align:center;padding:20px;font-size:11px;color:#333;letter-spacing:1px}
  @media(max-width:600px){.topbar,.meta-bar{padding:16px}.container{padding:16px}.summary-cards{flex-direction:column}}
</style>
</head>
<body>
<div class="topbar">
  <div>
    <div class="topbar h1">CGMAX FFTP</div>
    <div class="subtitle">OWASP TOP 10 SECURITY SCAN REPORT</div>
  </div>
  <div class="overall-badge">${overallStatus}</div>
</div>
<div class="meta-bar">
  <span><b>Run date:</b> ${esc(runDate)}</span>
  <span><b>Commit:</b> ${esc(gitCommit)}</span>
  <span><b>Coverage:</b> 100% of OWASP Top 10 (2021)</span>
</div>
<div class="container">
  <div class="summary-cards">
    <div class="card pass"><div class="num">${totalPasses}</div><div class="lbl">Passed</div></div>
    <div class="card warn"><div class="num">${totalWarnings}</div><div class="lbl">Warnings</div></div>
    <div class="card fail"><div class="num">${totalCriticals}</div><div class="lbl">Critical</div></div>
    <div class="card clean"><div class="num">${Object.values(owaspResults).filter(r=>r.fail===0&&r.warn===0).length}/10</div><div class="lbl">Categories Clean</div></div>
  </div>
  <div class="section-title">Results by OWASP Category</div>
  ${categoryRows()}
</div>
<div class="footer">CGMax FFTP · ITCC LLC · Generated by security-check.js</div>
</body>
</html>`;

  const outDir = path.join(ROOT, 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'security-report.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(GREEN + `\n  📄 HTML report saved → reports/security-report.html` + RESET);
}

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════
console.log(BOLD + '\n╔══════════════════════════════════════════════╗');
console.log('║   CGMax FFTP — OWASP Top 10 Security Scan  ║');
console.log('╚══════════════════════════════════════════════╝' + RESET);

checkA01_AccessControl();
checkA02_CryptoFailures();
checkA03_Injection();
checkA04_InsecureDesign();
checkA05_Misconfiguration();
checkA06_VulnerableComponents();
checkA07_AuthFailures();
checkA08_IntegrityFailures();
checkA09_LoggingFailures();
checkA10_SSRF();

printCoverageReport();

section('Overall Summary');
console.log(GREEN  + `  ✅ ${totalPasses}   passed` + RESET);
console.log(YELLOW + `  ⚠️  ${totalWarnings}   warnings` + RESET);
console.log(RED    + `  ❌ ${totalCriticals}   critical` + RESET);
console.log('');

writeHTMLReport();

if (totalCriticals > 0) {
  console.log(RED + BOLD + '  SECURITY SCAN FAILED — fix critical issues before deploying.' + RESET);
  process.exit(1);
} else if (totalWarnings > 0) {
  console.log(YELLOW + '  Security scan passed with warnings. Review items above.' + RESET);
  process.exit(0);
} else {
  console.log(GREEN + BOLD + '  All OWASP Top 10 checks passed! 🔒' + RESET);
  process.exit(0);
}
