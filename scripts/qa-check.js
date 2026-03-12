#!/usr/bin/env node
// =============================================================
//  CGMax FFTP — QA / Code Quality Checker
//  Validates HTML structure, linked assets, manifest,
//  service worker, file sizes, TODO tracking, and more.
//
//  Exit code 0 = pass (or warnings only)
//  Exit code 1 = blocking issues found
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

let blocking = 0;
let warnings = 0;
let passes   = 0;

// Structured data for HTML report
const reportItems = [];
let currentSection = '';

function pass(msg)         { passes++;   reportItems.push({ level:'pass', msg, detail:null, section:currentSection }); console.log(GREEN  + '  ✅ PASS' + RESET + ' ' + msg); }
function warn(msg, detail) { warnings++; reportItems.push({ level:'warn', msg, detail:detail||null, section:currentSection }); console.log(YELLOW + '  ⚠️  WARN' + RESET + ' ' + msg + (detail ? '\n         ' + DIM + detail + RESET : '')); }
function fail(msg, detail) { blocking++; reportItems.push({ level:'fail', msg, detail:detail||null, section:currentSection }); console.log(RED    + '  ❌ FAIL' + RESET + ' ' + msg + (detail ? '\n         ' + DIM + detail + RESET : '')); }
function info(msg)         {             console.log('  ℹ️  INFO  ' + DIM + msg + RESET); }
function section(title)    { currentSection = title; console.log('\n' + BOLD + CYAN + '── ' + title + RESET); }

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}
function fileExists(p) { return fs.existsSync(p); }

// ─── HTML STRUCTURE ───────────────────────────────────────────
function checkHTML(filename) {
  section(`HTML — ${filename}`);
  const filePath = path.join(ROOT, filename);
  const content  = readFile(filePath);
  if (!content) { fail(`${filename} not found`); return; }

  // DOCTYPE
  if (!/^<!DOCTYPE\s+html>/i.test(content.trim())) {
    warn(`${filename} missing <!DOCTYPE html>`);
  } else {
    pass('DOCTYPE present');
  }

  // <html lang>
  if (!/<html[^>]+lang\s*=/i.test(content)) {
    warn(`${filename} missing lang attribute on <html> — affects accessibility and SEO`);
  } else {
    pass('<html lang> attribute present');
  }

  // <meta charset>
  if (!/<meta[^>]+charset/i.test(content)) {
    fail(`${filename} missing <meta charset> — encoding issues possible`);
  } else {
    pass('<meta charset> present');
  }

  // <meta viewport>
  if (!/<meta[^>]+viewport/i.test(content)) {
    warn(`${filename} missing <meta name="viewport"> — mobile layout may break`);
  } else {
    pass('<meta viewport> present');
  }

  // <title>
  if (!/<title>/i.test(content)) {
    warn(`${filename} missing <title> tag`);
  } else {
    pass('<title> tag present');
  }

  // Open Graph tags (important for sharing)
  const ogTags = ['og:title', 'og:description', 'og:image'];
  const missingOG = ogTags.filter(tag => !content.includes(tag));
  if (missingOG.length && filename === 'index.html') {
    warn(`index.html missing OG tags: ${missingOG.join(', ')}`);
  } else if (filename === 'index.html') {
    pass('Open Graph meta tags present');
  }

  // Unclosed tags check (basic)
  const openDivs  = (content.match(/<div[^/]/g) || []).length;
  const closeDivs = (content.match(/<\/div>/g) || []).length;
  if (Math.abs(openDivs - closeDivs) > 5) {
    warn(`${filename}: div tag mismatch — ${openDivs} opening vs ${closeDivs} closing (threshold: 5)`);
  } else {
    pass(`div tag balance OK (${openDivs} open, ${closeDivs} close)`);
  }

  // Check for broken internal asset references (src/href pointing to relative files)
  const assetRefs = [];
  const srcPattern   = /(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;
  let match;
  while ((match = srcPattern.exec(content)) !== null) {
    const ref = match[1];
    // Skip data URIs, external URLs, and anchors
    if (ref.startsWith('data:') || /^https?:\/\//.test(ref) || ref.startsWith('//')) continue;
    assetRefs.push(ref);
  }
  const missing = assetRefs.filter(ref => !fileExists(path.join(ROOT, ref)));
  if (missing.length) {
    warn(`${filename}: ${missing.length} possibly broken internal reference${missing.length > 1 ? 's' : ''}`,
      missing.slice(0, 8).join(', '));
  } else {
    pass(`All ${assetRefs.length} internal asset references resolve`);
  }
}

// ─── APP.HTML SPECIFIC ────────────────────────────────────────
function checkApp() {
  section('App-Specific Checks — app.html');
  const content = readFile(path.join(ROOT, 'app.html'));
  if (!content) { fail('app.html not found'); return; }

  // JS syntax (basic — just checks for common runtime issues)
  const scriptBlocks = [];
  const scriptRe = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
  let sm;
  while ((sm = scriptRe.exec(content)) !== null) {
    scriptBlocks.push(sm[1]);
  }
  try {
    new Function(scriptBlocks.join('\n'));
    pass('JavaScript syntax valid (no parse errors)');
  } catch (e) {
    fail('JavaScript syntax error detected', e.message.slice(0, 200));
  }

  // All expected screen IDs present
  const requiredScreens = ['screen-setup', 'screen-main', 'screen-season', 'screen-roster'];
  const missingScreens  = requiredScreens.filter(id => !content.includes(`id="${id}"`));
  if (missingScreens.length) {
    fail(`Missing screen element${missingScreens.length > 1 ? 's' : ''}: ${missingScreens.join(', ')}`);
  } else {
    pass('All required screen elements present');
  }

  // Critical function presence
  const requiredFns = [
    'function renderSeasonScreen',
    'function renderTrophyPodium',
    'function buildCartoonAvatarSVG',
    'function endAndSave',
    'function openSeason',
    'function loadSeason',
    'function saveSeason',
    'function getPlayerPhoto',
    'function isPro',
  ];
  const missingFns = requiredFns.filter(fn => !content.includes(fn));
  if (missingFns.length) {
    fail(`Missing critical functions: ${missingFns.join(', ')}`);
  } else {
    pass(`All ${requiredFns.length} critical functions present`);
  }

  // TODO/FIXME tracking
  const todos   = (content.match(/\bTODO\b/g) || []).length;
  const fixmes  = (content.match(/\bFIXME\b/g) || []).length;
  const hacks   = (content.match(/\bHACK\b/g) || []).length;
  if (todos + fixmes + hacks > 0) {
    warn(`Outstanding markers: ${todos} TODO, ${fixmes} FIXME, ${hacks} HACK`);
  } else {
    pass('No TODO/FIXME/HACK markers found');
  }

  // Service worker reference consistency
  const swReg = content.match(/register\s*\(\s*['"]([^'"]+)['"]/);
  if (swReg) {
    const swFile = swReg[1];
    if (fileExists(path.join(ROOT, swFile))) {
      pass(`Service worker registered and file exists: ${swFile}`);
    } else {
      fail(`Service worker registered as '${swFile}' but file not found`);
    }
  } else {
    warn('No service worker registration found in app.html');
  }

  // PWA manifest link
  if (!content.includes('manifest.json')) {
    warn('No manifest.json link found in app.html — PWA install may not work');
  } else {
    pass('PWA manifest.json referenced');
  }

  // esc()/escHtml() usage ratio check
  const innerHTMLCount = (content.match(/\.innerHTML\s*[+]?=/g) || []).length;
  const escCallCount   = (content.match(/esc(?:Html)?\s*\(/g) || []).length;
  info(`innerHTML assignments: ${innerHTMLCount}, esc/escHtml calls: ${escCallCount}`);
  if (escCallCount < innerHTMLCount * 0.3) {
    warn('Low ratio of escaping calls to innerHTML assignments — verify XSS protection');
  }
}

// ─── MANIFEST.JSON ────────────────────────────────────────────
function checkManifest() {
  section('PWA Manifest — manifest.json');
  const content = readFile(path.join(ROOT, 'manifest.json'));
  if (!content) { warn('manifest.json not found'); return; }

  let manifest;
  try {
    manifest = JSON.parse(content);
    pass('manifest.json is valid JSON');
  } catch (e) {
    fail('manifest.json is invalid JSON', e.message);
    return;
  }

  const required = ['name', 'short_name', 'start_url', 'display', 'icons'];
  const missing  = required.filter(k => !manifest[k]);
  if (missing.length) {
    warn(`manifest.json missing fields: ${missing.join(', ')}`);
  } else {
    pass(`All required manifest fields present`);
  }

  // Icon sizes
  if (manifest.icons && manifest.icons.length) {
    const sizes = manifest.icons.map(i => i.sizes).join(', ');
    const hasLarge = manifest.icons.some(i => parseInt(i.sizes) >= 512);
    if (!hasLarge) warn('manifest.json missing 512×512 icon (required for installability)');
    else pass(`Icon sizes present: ${sizes}`);

    // Verify icon files exist
    const missingIcons = manifest.icons.filter(i => i.src && !fileExists(path.join(ROOT, i.src)));
    if (missingIcons.length) {
      fail(`Missing icon file${missingIcons.length > 1 ? 's' : ''}: ${missingIcons.map(i => i.src).join(', ')}`);
    }
  }
}

// ─── SERVICE WORKER ──────────────────────────────────────────
function checkServiceWorker() {
  section('Service Worker — sw.js');
  const content = readFile(path.join(ROOT, 'sw.js'));
  if (!content) { warn('sw.js not found'); return; }

  // Cache version present
  const verMatch = content.match(/['"]([a-zA-Z0-9_:.-]+-v\d+[^'"]*)['"]/);
  if (verMatch) {
    pass(`Cache version key found: ${verMatch[1]}`);
  } else {
    warn('No versioned cache key found in sw.js — hard to bust cache on updates');
  }

  // C11 — Cache version staleness: compare version date to last app.html git commit.
  // If app.html was committed after the date in CACHE_VERSION, the version is stale.
  // Coaches with cached versions will keep running old code until sw.js ships a new key.
  if (verMatch) {
    const dateInVersion = verMatch[1].match(/(\d{4}-\d{2}-\d{2})$/);
    if (dateInVersion) {
      try {
        const { execSync } = require('child_process');
        const lastAppCommitRaw = execSync(
          'git log -1 --format=%ci -- app.html',
          { cwd: ROOT, timeout: 5000 }
        ).toString().trim();

        if (lastAppCommitRaw) {
          const lastAppDate  = new Date(lastAppCommitRaw);
          const versionDate  = new Date(dateInVersion[1]);
          const daysBehind   = Math.floor((lastAppDate - versionDate) / (1000 * 60 * 60 * 24));

          if (daysBehind > 0) {
            warn(
              `Cache version date (${dateInVersion[1]}) is ${daysBehind} day(s) behind last app.html commit`,
              'CI auto-bumps sw.js on every push via scripts/bump-sw-version.js. ' +
              'If running locally, run: node scripts/bump-sw-version.js'
            );
          } else {
            pass(`Cache version date (${dateInVersion[1]}) is current vs last app.html commit`);
          }
        } else {
          info('No git history for app.html — skipping version staleness check');
        }
      } catch (_) {
        info('git unavailable in this environment — skipping version staleness check');
      }
    }
  }

  // fetch event handler
  if (!content.includes('fetch')) {
    warn('No fetch event handler in sw.js — offline support may be limited');
  } else {
    pass('fetch event handler present');
  }

  // install + activate
  ['install', 'activate'].forEach(evt => {
    if (!content.includes(evt)) warn(`sw.js missing '${evt}' event handler`);
    else pass(`'${evt}' event handler present`);
  });
}

// ─── FILE SIZE MONITOR ────────────────────────────────────────
function checkFileSizes() {
  section('File Size Monitor');

  const limits = [
    { file: 'app.html',          warnKB: 500, failKB: 700 },
    { file: 'sw.js',             warnKB: 50,  failKB: 100 },
    { file: 'manifest.json',     warnKB: 10,  failKB: 50  },
  ];

  limits.forEach(({ file, warnKB, failKB }) => {
    const fp = path.join(ROOT, file);
    if (!fileExists(fp)) return;
    const sizeKB = Math.round(fs.statSync(fp).size / 1024);
    if (sizeKB >= failKB) {
      fail(`${file} is ${sizeKB} KB — exceeds ${failKB} KB limit`);
    } else if (sizeKB >= warnKB) {
      warn(`${file} is ${sizeKB} KB — approaching ${warnKB} KB warning threshold`);
    } else {
      pass(`${file}: ${sizeKB} KB ✓`);
    }
  });

  // Overall asset audit
  const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  const images = fs.readdirSync(ROOT).filter(f => imageExts.some(e => f.endsWith(e)));
  const largeImages = images.filter(f => {
    try { return fs.statSync(path.join(ROOT, f)).size > 200 * 1024; } catch(e) { return false; }
  });
  if (largeImages.length) {
    warn(`${largeImages.length} image${largeImages.length > 1 ? 's' : ''} exceed 200 KB — consider compressing`,
      largeImages.join(', '));
  } else {
    pass(`All root-level images under 200 KB (${images.length} checked)`);
  }
}

// ─── BACKEND QA ──────────────────────────────────────────────
function checkBackend() {
  section('Backend QA — cgmax-fftp-backend/api/');

  // The backend lives in a sibling repo next to the frontend root.
  // ROOT = flagfootball/ so the backend api is one level up then into
  // cgmax-fftp-backend/api. Falls back to legacy 'backend/api' if the
  // sibling repo isn't present (e.g. partial checkouts).
  const apiDir = fs.existsSync(path.join(ROOT, '..', 'cgmax-fftp-backend', 'api'))
    ? path.join(ROOT, '..', 'cgmax-fftp-backend', 'api')
    : path.join(ROOT, 'backend', 'api');
  if (!fs.existsSync(apiDir)) { warn('cgmax-fftp-backend/api not found — skipping backend checks'); return; }

  function getJSFiles(dir) {
    const results = [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...getJSFiles(full));
      else if (e.name.endsWith('.js')) results.push(full);
    });
    return results;
  }

  const files = getJSFiles(apiDir);

  files.forEach(filePath => {
    const rel     = path.relative(ROOT, filePath);
    const content = readFile(filePath);
    if (!content) return;

    // Every handler should export a function
    if (!content.includes('module.exports')) {
      fail(`[${rel}] No module.exports found — Vercel handler won't work`);
    } else {
      pass(`[${rel}] exports handler function`);
    }

    // Error handling — every async handler should have try/catch
    const hasTryCatch = content.includes('try {') || content.includes('try{');
    if (!hasTryCatch) {
      warn(`[${rel}] No try/catch block — unhandled errors will crash the handler`);
    } else {
      pass(`[${rel}] try/catch error handling present`);
    }

    // Response always returned (check for bare return without res.*)
    if (!content.includes('res.status') && !content.includes('res.json')) {
      warn(`[${rel}] No res.status/res.json calls found — handler may not respond`);
    }

    // OPTIONS preflight handled
    if (!content.includes('OPTIONS')) {
      warn(`[${rel}] No OPTIONS preflight handler — CORS preflight requests will fail`);
    } else {
      pass(`[${rel}] OPTIONS preflight handled`);
    }
  });
}

// ─── HTML REPORT ─────────────────────────────────────────────
function writeHTMLReport() {
  const runDate = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  let gitCommit = 'unknown';
  try {
    gitCommit = require('child_process')
      .execSync('git rev-parse --short HEAD 2>/dev/null', { cwd: ROOT }).toString().trim();
  } catch (e) {}

  const overallStatus = blocking > 0 ? 'BLOCKING ISSUES' : warnings > 0 ? 'WARNINGS' : 'ALL CLEAR';
  const statusColor   = blocking > 0 ? '#FF4444' : warnings > 0 ? '#FFB800' : '#44BB44';

  // Group by section
  const sections = [];
  let lastSec = null;
  reportItems.forEach(item => {
    if (!lastSec || lastSec.title !== item.section) {
      lastSec = { title: item.section, items: [] };
      sections.push(lastSec);
    }
    lastSec.items.push(item);
  });

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function badge(level) {
    if (level === 'pass') return '<span class="badge pass">✅ PASS</span>';
    if (level === 'warn') return '<span class="badge warn">⚠️ WARN</span>';
    return '<span class="badge fail">❌ FAIL</span>';
  }

  const sectionHTML = sections.map(sec => {
    const issues = sec.items.filter(i => i.level !== 'pass');
    const statusCls = sec.items.some(i=>i.level==='fail') ? 'fail' : sec.items.some(i=>i.level==='warn') ? 'warn' : 'pass';
    return `
    <div class="sec ${statusCls}">
      <div class="sec-title">${esc(sec.title)}
        <span class="sec-counts">${sec.items.filter(i=>i.level==='pass').length} passed · ${sec.items.filter(i=>i.level==='warn').length} warnings · ${sec.items.filter(i=>i.level==='fail').length} failing</span>
      </div>
      ${issues.length ? `<div class="findings-list">${issues.map(item => `
        <div class="finding ${item.level}">${badge(item.level)}<div class="finding-body">
          <div class="finding-msg">${esc(item.msg)}</div>
          ${item.detail ? `<pre class="finding-detail">${esc(item.detail)}</pre>` : ''}
        </div></div>`).join('')}</div>`
      : '<div class="all-clear">✅ All checks in this section passed.</div>'}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CGMax FFTP — QA Report</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0;line-height:1.5}
  .topbar{background:linear-gradient(135deg,#AA0000,#CC1100);padding:24px 32px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
  .topbar h1{font-size:22px;font-weight:900;letter-spacing:4px;color:#FFD700}
  .topbar .subtitle{font-size:12px;letter-spacing:2px;color:rgba(255,255,255,.6);margin-top:2px}
  .overall-badge{padding:8px 18px;border-radius:20px;font-weight:700;font-size:14px;letter-spacing:1px;background:${statusColor}22;border:2px solid ${statusColor};color:${statusColor}}
  .meta-bar{background:#111;padding:12px 32px;font-size:12px;color:#666;border-bottom:1px solid #222;display:flex;gap:24px;flex-wrap:wrap}
  .meta-bar span b{color:#aaa}
  .container{max-width:960px;margin:0 auto;padding:24px 24px 48px}
  .summary-cards{display:flex;gap:12px;margin-bottom:28px;flex-wrap:wrap}
  .card{flex:1;min-width:100px;background:#141414;border:1px solid #2a2a2a;border-radius:10px;padding:16px;text-align:center}
  .card .num{font-size:36px;font-weight:900;line-height:1}
  .card .lbl{font-size:11px;letter-spacing:1.5px;color:#666;margin-top:4px;text-transform:uppercase}
  .card.pass .num{color:#44BB44} .card.warn .num{color:#FFB800} .card.fail .num{color:#FF4444}
  .section-title{font-size:13px;font-weight:700;letter-spacing:2px;color:#888;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #222}
  .sec{background:#111;border:1px solid #1e1e1e;border-radius:10px;margin-bottom:10px;overflow:hidden}
  .sec.fail{border-color:#FF444433} .sec.warn{border-color:#FFB80033} .sec.pass{border-color:#44BB4422}
  .sec-title{font-size:14px;font-weight:700;color:#f0f0f0;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
  .sec-counts{font-size:11px;color:#555;font-weight:400}
  .findings-list{border-top:1px solid #1e1e1e;padding:10px 18px;display:flex;flex-direction:column;gap:8px}
  .finding{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:8px;background:#0d0d0d}
  .finding.warn{border-left:3px solid #FFB800} .finding.fail{border-left:3px solid #FF4444}
  .badge{font-size:11px;font-weight:700;white-space:nowrap;padding:2px 8px;border-radius:4px;margin-top:1px}
  .badge.pass{background:#44BB4420;color:#44BB44} .badge.warn{background:#FFB80020;color:#FFB800} .badge.fail{background:#FF444420;color:#FF4444}
  .finding-body{flex:1}
  .finding-msg{font-size:13px;color:#ddd;line-height:1.4}
  .finding-detail{font-size:11px;color:#777;margin-top:6px;background:#0a0a0a;padding:8px 10px;border-radius:5px;white-space:pre-wrap;word-break:break-word;line-height:1.5}
  .all-clear{font-size:13px;color:#44BB44;padding:10px 18px 12px}
  .footer{text-align:center;padding:20px;font-size:11px;color:#333;letter-spacing:1px}
</style></head>
<body>
<div class="topbar">
  <div><div class="topbar h1">CGMAX FFTP</div><div class="subtitle">QA &amp; CODE QUALITY REPORT</div></div>
  <div class="overall-badge">${esc(overallStatus)}</div>
</div>
<div class="meta-bar">
  <span><b>Run date:</b> ${esc(runDate)}</span>
  <span><b>Commit:</b> ${esc(gitCommit)}</span>
</div>
<div class="container">
  <div class="summary-cards">
    <div class="card pass"><div class="num">${passes}</div><div class="lbl">Passed</div></div>
    <div class="card warn"><div class="num">${warnings}</div><div class="lbl">Warnings</div></div>
    <div class="card fail"><div class="num">${blocking}</div><div class="lbl">Blocking</div></div>
  </div>
  <div class="section-title">Results by Check</div>
  ${sectionHTML}
</div>
<div class="footer">CGMax FFTP · ITCC LLC · Generated by qa-check.js</div>
</body></html>`;

  const outDir = path.join(ROOT, 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'qa-report.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(GREEN + `\n  📄 HTML report saved → reports/qa-report.html` + RESET);
}

// ─── MAIN ─────────────────────────────────────────────────────
console.log(BOLD + '\n╔══════════════════════════════════════════════╗');
console.log('║     CGMax FFTP — QA Checker                 ║');
console.log('╚══════════════════════════════════════════════╝' + RESET);

checkHTML('app.html');
checkHTML('index.html');
checkApp();
checkManifest();
checkServiceWorker();
checkFileSizes();
checkBackend();

section('Summary');
console.log(GREEN  + `  ✅ ${passes}   passed` + RESET);
console.log(YELLOW + `  ⚠️  ${warnings}   warnings` + RESET);
console.log(RED    + `  ❌ ${blocking}   blocking` + RESET);
console.log('');

writeHTMLReport();

if (blocking > 0) {
  console.log(RED + BOLD + '  QA CHECK FAILED — fix blocking issues before deploying.' + RESET);
  process.exit(1);
} else if (warnings > 0) {
  console.log(YELLOW + '  QA passed with warnings. Review items above.' + RESET);
  process.exit(0);
} else {
  console.log(GREEN + BOLD + '  All QA checks passed! 🎉' + RESET);
  process.exit(0);
}
