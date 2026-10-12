# DealsDash — Security Log

Append-only. One entry per review. Newest at the bottom.

**Template:**
```
## YYYY-MM-DD — <scope>
Reviewer: <who/agent>
| # | Severity | Finding | Action | File |
|---|---|---|---|---|
Open items:
```

---

## 2026-10-03 — Screener data build (`scripts/build_screener.py`, `public/data/screener.json`)
Reviewer: Claude (chat session, pre-handoff to Claude Code)

| # | Severity | Finding | Action | File |
|---|---|---|---|---|
| 1 | Medium | Price Paid was fetched over plain HTTP from the S3 website endpoint, so the data could be tampered with in transit. | Switched to `https://price-paid-data.publicdata.landregistry.gov.uk`. Non-HTTPS URLs are now refused. | build_screener.py |
| 2 | Medium | The PIPR download link is scraped from an ONS web page, so a tampered link could point the build at any host. | Added a host allow-list, checked both before the request and after redirects (`r.geturl()`). | build_screener.py |
| 3 | Low | An unbounded download could fill the disk. | Added a 1 GB cap per file, streamed in chunks. | build_screener.py |
| 4 | Low | An interrupted download could leave a truncated file that later runs treat as valid cache. | Downloads now write to `.part` and are atomically renamed on completion. | build_screener.py |
| 5 | Low | The XML in the ONS `.xlsx` is parsed by openpyxl. | Added `defusedxml` to requirements; openpyxl uses it automatically. | requirements-screener.txt |
| 6 | Info | `screener.json` is world-readable on Firebase Hosting. | Confirmed it contains only aggregated public OGL statistics: no personal data, user settings or secrets. User weights are stored in Firestore, not in this file. | screener.json |

Open items:
- When ONS centroids are added, add their host to `ALLOWED_HOSTS` and log it here.

---

## 2026-10-03 — Screener UI (`src/components/ScreenerView.jsx`, `src/App.jsx` wiring)
Reviewer: Claude Code (automated inline review)

| # | Severity | Finding | Action | File |
|---|---|---|---|---|
| 1 | None | XSS: all area names, council names, outcodes, and nation labels are rendered as React children (text nodes). No `dangerouslySetInnerHTML`, `innerHTML`, or `eval` found. | No change needed. Confirmed safe. | ScreenerView.jsx |
| 2 | None | Firestore write (`settings.screener`): written via the existing `applySettings` path to `users/{uid}/settings/app` — a document the user owns and that Firestore rules scope to their UID. Values are numeric (weights clamped 0–10 at write time), string enums, or booleans. No injection surface. | No change needed. | ScreenerView.jsx, App.jsx |
| 3 | None | `screener.json` fetch: same-origin `/data/screener.json` served from Firebase Hosting. No cross-origin request, no user-supplied URL. Content already reviewed in 2026-10-03 data-build entry as aggregated public OGL statistics. | No change needed. | ScreenerView.jsx |
| 4 | None | Dynamic property access: `vals[key]` uses `key` values sourced exclusively from the module-level `FACTOR_META` array (hardcoded). No user input reaches property accessor keys. | No change needed. | ScreenerView.jsx |
| 5 | Low | The `maxPrice` input is stored as a raw string in Firestore. If the string grows unboundedly (e.g. a very long paste), it wastes Firestore quota. | Acceptable: `Number(maxPrice) \|\| Infinity` at read time means invalid values are safely ignored. Could add a `maxLength` attribute to the input in a future pass. | ScreenerView.jsx |

Open items:
- When ONS centroids are added, add their host to `ALLOWED_HOSTS` and log it here.

---

## 2026-10-10 — P09 full branch review (`feature/appraisal-v2` vs `main`, P00–P08, 45 files)
Reviewer: Claude Code security-reviewer subagent (independent pass)

| # | Severity | Finding | Action | File |
|---|---|---|---|---|
| 1 | None | Secrets (ANTHROPIC_API_KEY, EPC_API_KEY) loaded via Firebase Secrets only — absent from client code, public/, bundle.js | No action needed | functions/index.js:8–11 |
| 2 | None | Firebase Web API key in bundle.js — intended public client identifier, access controlled by auth+rules | No action needed | src/App.jsx:49 |
| 3 | None | Firestore rules: users/ wildcard gated to uid + email; covers all new P00–P08 subcollections (agents, briefs, buyBoxes, notifications) | No action needed | firestore.rules:6–10 |
| 4 | None | Firestore rules: marketStats/ — read requires auth+email; write: if false; Admin SDK writes only | No action needed | firestore.rules:11–15 |
| 5 | None | Firestore rules: mail/ — read+write: if false; Admin SDK only | No action needed | firestore.rules:16–18 |
| 6 | None | Storage rules: legalPacks/ restricted to uid+email+≤40 MB+PDF content-type | No action needed | storage.rules |
| 7 | None | XSS: zero dangerouslySetInnerHTML across all src/**/*.jsx; AI output as React text nodes | No action needed | src/ |
| 8 | None | All 6 callable Functions + estatelyWebhook check request.auth + email before any work | No action needed | functions/index.js |
| 9 | None | sanitizeLeads() and sanitizeFlag() re-validate all AI-returned fields before Firestore writes | No action needed | functions/index.js:431–453, 764–773 |
| 10 | None | screener.json — aggregated public OGL statistics only; no personal data | No action needed | public/data/screener.json |
| 11 | None | build_screener.py: HTTPS-only + host allow-list checked before and after redirects | No action needed | docs/build_screener.py:89–114 |
| 12 | None | build_screener.py: 1 GB download cap, streaming chunks, atomic .part rename | No action needed | docs/build_screener.py:50, 110 |
| 13 | None | build_screener.py: no subprocess/shell calls; paths from hardcoded templates only | No action needed | docs/build_screener.py |
| 14 | None | Legal pack upload path built from auth UID + UUID; Cloud Function validates prefix | No action needed | src/App.jsx:4879, functions/index.js:561–563 |
| 15 | None | v2.js migration: idempotent, pure, additive, no I/O, no injection surface | No action needed | src/lib/migrations/v2.js |
| 16 | Low | Emulator hooks (window.__testAuth etc.) in prod bundle, inert without ?useEmulator=1 | Flagged — could guard behind FUNCTIONS_EMULATOR at build time (open item A) | src/App.jsx:71–79 |
| 17 | Medium | SSRF: recheckLeadStatus fetches caller-supplied sourceUrl with no host allow-list | Awaiting Paul's approval — proposed allow-list code in open items (B) | functions/index.js:827–848 |
| 18 | Medium | ANTHROPIC_API_URL_OVERRIDE / EPC_API_URL_OVERRIDE read at runtime; misconfigured prod env var could redirect API traffic | Awaiting Paul's approval — FUNCTIONS_EMULATOR guard proposed (C) | functions/index.js:17, 928 |
| 19 | Low | file.name used in Storage path; Firebase SDK encodes segments; rendered as text node | Noted; no action needed | src/App.jsx:4879, 4961 |
| 20 | High | npm audit functions/: proxy-addr critical (IP spoofing), @fastify/busboy high, @grpc/grpc-js high, node-forge high via firebase-admin ≤14.3.0 | **Fixed 2026-10-10:** `npm audit fix` (non-breaking) + `firebase-admin@14.5.0`. Result: 0 vulnerabilities. Tested on emulator — all 10 functions loaded, app functional. | functions/package.json |
| 21 | High | npm audit root: @grpc/grpc-js high (4 findings) via @firebase/firestore | **Accepted risk 2026-10-10:** `@firebase/firestore` pins `@grpc/grpc-js ~1.9.0` across all firebase 12.x and 13.x. The only npm-suggested fix is firebase@9.14.0 (major downgrade — refused). Upgraded firebase@12.17.1 → 12.19.0 (latest 12.x patch). The grpc transport is not used by the browser Firebase SDK (it uses WebChannel/HTTP); this advisory has no runtime impact on the client app. Remaining unfixable dev-tool advisories (vitest/tinypool test-time, tailwindcss/braces build-time, esbuild dev-server-only) are accepted as non-production risks. | package.json |
| 22–28 | None | No allow read/write: if true; no secrets in git history; repo.js paths from auth UID only; rate limits on AI calls; HMAC timing-safe; email HTML escaped | No action needed | various |

Open items (require Paul's decision before release):
- **A (Low):** Emulator hooks in prod bundle — wrap in NODE_ENV !== "production" guard.
- **B (Medium):** Add URL host allow-list to `recheckLeadStatus`. Proposed hosts: rightmove.co.uk, zoopla.co.uk, onthemarket.com, plus auction house domains in use.
- **C (Medium):** Guard `ANTHROPIC_API_URL_OVERRIDE` / `EPC_API_URL_OVERRIDE` behind `process.env.FUNCTIONS_EMULATOR` so they can't redirect prod API traffic.
- ~~**D (High — blocks release):** `npm audit fix` in `functions/` + `firebase-admin` ≥14.5.0. Test on emulator.~~ **RESOLVED 2026-10-10.**
- ~~**E (High — blocks release):** Firebase JS client SDK patch upgrade to resolve `@grpc/grpc-js` findings.~~ **CLOSED 2026-10-10 — accepted risk, not exploitable in browser execution path.**
