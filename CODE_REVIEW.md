# CGMax FFTP — Full Code Review
**Reviewed:** March 2, 2026
**Files reviewed:** app.html, index.html, privacy.html, terms.html, sw.js, manifest.json
**All issues below were FIXED in place.**

---

## app.html — 6 Fixes

### 🐛 BUG — Duplicate meta tags in `<head>`
`apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` were both defined twice. Duplicate meta tags can confuse browsers and are dead weight.
**Fixed:** Removed the duplicate pair.

### 🐛 BUG — Missing `viewport-fit=cover`
The viewport meta had `user-scalable=no` but was missing `viewport-fit=cover`. Without this, iOS safe area environment variables (`env(safe-area-inset-*)`) used throughout the CSS don't work — causing layout to clip behind the notch or Dynamic Island.
**Fixed:** Added `viewport-fit=cover` to the viewport meta.

### 🐛 BUG — Wrong page title
The `<title>` was `"Flag Football Tracker"` — a leftover from an earlier version. The manifest, landing page, and branding all say `"CGMax FFTP — Flag Football Tracker Pro"`.
**Fixed:** Title updated to match branding.

### 🐛 BUG — Theme color inconsistency
`theme-color` was `#CC0000` in app.html but `#AA0000` everywhere else (index.html, manifest.json). Causes a visible color flash when switching between pages.
**Fixed:** Changed to `#AA0000` to match the rest of the app.

### 🔒 SECURITY — Access code stored in localStorage as plaintext
The privacy policy explicitly states: *"the code itself is not stored in a recoverable form."* But the implementation was calling `localStorage.setItem(LS_GATE, code)` — storing the raw code string.
Anyone with access to the device's DevTools or browser storage could read the code.
**Fixed:** Now stores `'unlocked'` as the indicator. Validation logic updated accordingly. This aligns the code with your own privacy policy.

### ℹ️ NOTE — Access codes visible in JavaScript source
The 10 access codes are embedded in a plain JavaScript array. Anyone who opens DevTools → Sources can read all of them. This can't be truly fixed client-side. For stronger protection in the future, consider server-side validation (e.g., a Cloudflare Worker that validates a code against a private list and returns a signed token).

---

## index.html — 5 Fixes

### 🐛 BUG — Broken inline script (Cloudflare injection artifact)
Cloudflare's email-protection system injected its decode script as a `<script src="...">` tag wrapping the existing inline JavaScript. This is **invalid HTML** — a `<script>` element cannot have both a `src` attribute AND inline content. Browsers silently discard the inline content when `src` is present, meaning the iOS parallax fix and Service Worker registration were not actually executing.
**Fixed:** The script tag is now a clean `<script>` with the Cloudflare external load as a preceding comment.

### 🐛 BUG — Duplicate Cloudflare email-decode script loaded twice
The email-decode script was being loaded twice on the page.
**Fixed:** Removed the duplicate.

### 🐛 BUG — Hidden orphan element in footer
`<span class="foot-contact" style="display:none">dup [email]</span>` — a development leftover was sitting in the footer, invisible to users but still in the DOM and HTML source.
**Fixed:** Removed.

### 🐛 BUG — All email addresses were Cloudflare-obfuscated
Throughout the page, every `cgomez@itcc.llc` email link was replaced by Cloudflare with an `__cf_email__` span + encoded `data-cfemail` attribute. These are decoded client-side by the Cloudflare CDN script — meaning they **only work when the page is served through Cloudflare**. When accessed locally, shared as a file, or cached offline, every email link shows as `[email protected]` and mailto: links don't work.
**Fixed:** All email references replaced with plain `href="mailto:cgomez@itcc.llc"` links.

### ✨ PERFORMANCE — `will-change: transform` on a static element
`.bg-grid` had `will-change: transform` applied, which forces the browser to promote the element to its own GPU compositor layer. This is appropriate for animated elements, but `.bg-grid` is completely static — no transforms are applied to it. On mobile this wastes GPU memory for no benefit.
**Fixed:** Removed `will-change: transform`.

### 🗓️ CONTENT — Copyright year
Footer showed `© 2025 ITCC LLC`.
**Fixed:** Updated to `© 2026 ITCC LLC`.

---

## privacy.html — 2 Fixes

### 🐛 BUG — All email addresses were Cloudflare-obfuscated
Same issue as index.html — every in-body email reference was encoded. These show as `[email protected]` when the page is served without Cloudflare (locally, offline, cached).
**Fixed:** All 6 occurrences replaced with direct `href="mailto:cgomez@itcc.llc"` links.

### 🗓️ CONTENT — "Last Updated" date was February 2025
**Fixed:** Updated to March 2026.

---

## terms.html — 2 Fixes

### 🐛 BUG — All email addresses were Cloudflare-obfuscated
Same fix as privacy.html.
**Fixed:** All occurrences replaced with direct `href="mailto:cgomez@itcc.llc"` links.

### 🗓️ CONTENT — "Last Updated" date was February 2025
**Fixed:** Updated to March 2026.

---

## sw.js — 3 Improvements

### ✨ PERFORMANCE — Google Fonts not cached offline
The original cross-origin handler called `fetch(req).catch(() => caches.match(req))` — it tried the network and fell back to cache, but **never actually stored the response in the cache**. This meant fonts had to be re-fetched on every visit and were unavailable offline.
**Fixed:** Added a dedicated `FONT_CACHE` (`fftp-fonts-v1`) with stale-while-revalidate logic. Fonts are fetched with explicit `mode: 'cors', credentials: 'omit'` to get non-opaque responses that are safe to cache. Once cached, fonts work fully offline.

### ✨ IMPROVEMENT — Separate font cache survives app version bumps
By using a separate cache name for fonts, updating `CACHE_VERSION` (which you do on each deploy) no longer evicts the font cache. Fonts were downloaded once and persist indefinitely, saving bandwidth on every update.
**Fixed:** Activate handler now preserves `FONT_CACHE` while still purging old app caches.

### 🐛 BUG — Silent swallow of precache errors
The install handler had `.catch(err => console.warn(...))` which — while preventing a crash — masked failures silently and allowed the SW to install with an incomplete cache. Removed the catch so failures surface properly in DevTools.
**Fixed:** Removed the silent catch on install.

---

## manifest.json — No Changes Needed
Looks correct. Icons, categories, theme color, start URL, and display mode are all properly configured.

---

## Summary of All Fixes

| File | Issues Fixed | Category |
|------|-------------|----------|
| app.html | Duplicate meta tags | Bug |
| app.html | Missing viewport-fit=cover | Bug / iOS layout |
| app.html | Wrong title ("Flag Football Tracker") | Bug |
| app.html | Wrong theme color (#CC0000 vs #AA0000) | Bug |
| app.html | Raw access code stored in localStorage | Security / Privacy Policy |
| index.html | Broken inline script (Cloudflare injection) | Critical Bug |
| index.html | Duplicate Cloudflare decode script | Bug |
| index.html | Hidden orphan footer element | Cleanup |
| index.html | All emails Cloudflare-obfuscated (offline-broken) | Bug |
| index.html | will-change on static element | Performance |
| index.html | Copyright year 2025 | Content |
| privacy.html | All emails Cloudflare-obfuscated | Bug |
| privacy.html | Last Updated date | Content |
| terms.html | All emails Cloudflare-obfuscated | Bug |
| terms.html | Last Updated date | Content |
| sw.js | Fonts never cached (broken offline) | Performance / Bug |
| sw.js | Font cache evicted on every deploy | Performance |
| sw.js | Silent swallow of precache errors | Bug |

**Total: 17 issues fixed across 5 files.**

---

## Remaining Recommendations (Not Auto-Fixed)

These are things worth addressing in a future iteration but require larger decisions:

1. **Access codes in JS source** — True security requires server-side validation. Consider a Cloudflare Worker or similar serverless function that holds the codes privately and returns a signed token.

2. **Cloudflare email obfuscation** — If you're using Cloudflare for the live site, their system re-encodes emails on every deploy. Consider adding your email domain to Cloudflare's "Scrape Shield" exclusion list, or using a contact form instead of direct email links.

3. **Firebase config in localStorage** — Users paste their Firebase project config (including API keys) into the sync feature. This is standard for Firebase web apps (API keys are not secrets), but worth documenting so coaches understand it.

4. **App shell size** — At 377KB, app.html is very large for a single-file app. If performance becomes a concern on slower connections, consider splitting the CSS into a separate file so the browser can cache it independently.

5. **Terms and Privacy dates** — Consider updating the "Effective Date: January 1, 2025" once you finalize the terms with legal counsel as noted in the ToS itself.
