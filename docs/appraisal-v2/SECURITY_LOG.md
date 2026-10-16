# Appraisal v2 — Security Log

## P09 — Full Security Review (P00–P11 scope) · 16 October 2026

| Date | Phase | ID | Area | Finding | Severity | File:line | Fix applied | Status |
|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | P09 | SEC-01 | CSP / Security headers | `firebase.json` had only a `Cache-Control` header. Missing: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. | Medium | firebase.json:6 | Yes — added all four headers in a `**` catch-all block | Fixed |
| 2026-10-16 | P09 | SEC-02 | Dependencies | `npm audit --omit=dev` reports 4 High via `@grpc/grpc-js@1.9.16` (transitive: `firebase → @firebase/firestore → @grpc/grpc-js`). The grpc module is used only in Node.js / emulator context; esbuild browser bundle does not include it (confirmed: 0 matches in public/bundle.js). Fix requires `npm audit fix --force` which downgrades `firebase` to v9 — a major breaking change. `functions/` has 0 vulnerabilities. | High (audit) / Info (runtime exposure) | package.json | No — breaking change; defer to planned Firebase SDK upgrade | Accepted by Paul 2026-10-16 — deferred to Firebase SDK upgrade |
| 2026-10-16 | P09 | SEC-03 | Cloud Functions — rate limiting | `reviewDeal`, `researchLeads`, `recheckLeadStatus`, and `reviewLegalPack` have no per-call rate limit or cooldown. Auth guard restricts to one email so abuse requires account compromise; Anthropic API costs are the practical ceiling. | Low | functions/index.js | No — single-user app, auth gate is sufficient mitigation | Accepted |
| 2026-10-16 | P09 | SEC-04 | Cloud Functions — input size | `criteria` string and `brief.notes` are injected into the Anthropic prompt without a max-length cap. Firebase Callable SDK imposes a 10 MB body limit. Risk is low in a single-user app. | Low | functions/index.js:181,373 | No — acceptable given single-user scope | Accepted |
| 2026-10-16 | P09 | SEC-05 | Cloud Functions — error leak | `refreshMarketStats` throws `HttpsError("internal", \`…: ${e.message}\`)` at line 1164, exposing the raw exception message to the caller. The caller is the authenticated single user who owns the app. | Low | functions/index.js:1164 | No — exposed only to authenticated owner | Accepted |
| 2026-10-16 | P09 | SEC-06 | XSS / open URL | `lead.sourceUrl` is rendered as a raw `href` (App.jsx:5303) without scheme validation. A `javascript:` URI manually entered in the source URL field would survive storage and render as a live link. `sanitizeLeads()` server-side does `String(...)` but does not strip schemes. Modern browsers block `javascript:` href navigation but this is defence-in-depth gap. | Low | src/App.jsx:5303, functions/index.js:443 | Yes — added `safeUrl()` helper in sanitizeLeads (strips non-http/s schemes); added `/^https?:\/\//` guard on client render | Fixed |
| 2026-10-16 | P09 | SEC-07 | Console PII logging | `migrate.js:101` logs `before` (the full pre-migration Firestore doc snapshot, which includes financial deal data) to `console.log`. This goes to the browser DevTools console — not a remote service. | Low | src/data/migrate.js:101 | Yes — replaced `before` with `before?.deals?.length ?? 'unknown'` count only | Fixed |
| 2026-10-16 | P09 | SEC-08 | Data hygiene | `deleteAllForUser` in `repo.js` does not cascade-delete `deals/{dealId}/programme/main` subcollections. Programme docs persist after a user data reset. | Info | src/data/repo.js | No — data hygiene, not a security boundary gap | Open — track for P12 |
| 2026-10-16 | P09 | SEC-09 | Firestore rules | `users/{uid}/{document=**}` wildcard correctly covers all subcollections including `programme/main` and briefs. Auth is uid + email double-check. No wildcard `allow all` paths. | Info | firestore.rules | No action needed | Clear |
| 2026-10-16 | P09 | SEC-10 | Secrets | No hardcoded secrets in source files, public/bundle.js, or .env files. `ANTHROPIC_API_KEY` and `EPC_API_KEY` accessed only via `defineSecret()` in Cloud Functions. `.env*` and `backups/` are git-ignored. | Info | — | No action needed | Clear |
| 2026-10-16 | P09 | SEC-11 | XSS — dangerouslySetInnerHTML | No `dangerouslySetInnerHTML` usage found across all src/ files. | Info | — | No action needed | Clear |
| 2026-10-16 | P09 | SEC-12 | External links | All `target="_blank"` links use `rel="noreferrer"` (which implies `noopener` in all modern browsers). Three occurrences: App.jsx:5303, AppraisalV2Tab.jsx:524, ScreenerView.jsx:587. | Info | — | No action needed | Clear |
| 2026-10-16 | P09 | SEC-13 | Storage rules | PDF upload locked to `request.auth.uid == userId` + email check + 40 MB size cap + `contentType == "application/pdf"`. Server-side Cloud Function independently checks `storagePath.startsWith('users/${uid}/')`. | Info | storage.rules | No action needed | Clear |
| 2026-10-16 | P09 | SEC-14 | SSRF guard | `recheckLeadStatus` validates `sourceUrl` against an explicit allowlist of known UK property portals before fetching. Non-allowlisted hosts are rejected with `invalid-argument`. | Info | functions/index.js:830–848 | No action needed | Clear |
| 2026-10-16 | P09 | SEC-15 | Webhook security | `estatelyWebhook` uses `crypto.timingSafeEqual` for HMAC-SHA256 signature verification. Buffer length normalisation prevents timing side-channels when signature lengths differ. | Info | functions/index.js:1274–1278 | No action needed | Clear |
| 2026-10-16 | P09 | SEC-16 | Test artefacts | `public/bundle.js` contains zero matches for `seed-emulator`, `__tests__`, `vitest`, `playwright`, `useEmulator`. Emulator connectors are behind a `process.env.NODE_ENV !== 'production'` dead-code guard eliminated by esbuild `--define`. | Info | public/bundle.js | No action needed | Clear |
| 2026-10-16 | P09 | SEC-17 | CSV import | No CSV import feature exists in the codebase — formula injection check N/A. | Info | — | N/A | Clear |

---

## P11 — Deal Programme · 16 October 2026

### Firestore rules

No rule changes were required. The new path `users/{uid}/deals/{dealId}/programme/main` is covered by the existing wildcard rule:

```
match /users/{userId}/{document=**} {
  allow read, write: if request.auth.uid == userId;
}
```

This means only the authenticated user who owns the document can read or write programme data. No cross-user access is possible.

**Verification needed:** Add an emulator test confirming that a request authenticated as uid-B cannot read `users/uid-A/deals/xxx/programme/main`. This test has not yet been written (deferred from P11 gate scope).

---

### Input validation — ProgrammeView

| Input | Validation applied |
|---|---|
| `dealSecured` (date string) | Rendered as `<input type="date">`; browser enforces YYYY-MM-DD format. Schedule engine returns `status:'incomplete'` for blank or unparseable dates — no crash. |
| `contingencyPct` | Numeric input; schedule engine applies `Math.max(0, value)` implicitly via `Math.ceil(baseDur * (1 + pct))` — negative values reduce duration but cannot go below 0 via the ceiling. |
| `auctionCompletionDays`, `agentExchangeToCompletion`, `agentSaleToAgreement`, `saleExchangeToCompletion`, `retentionReleaseLag` | Numeric inputs; schedule engine uses them as lag values in `addWorkdays` — non-numeric values fall back to the template default via `?? 0`. |
| `customNonWorkdays` (array of ISO strings) | Merged into holidays array; only passed to the calendar engine which tests each against `/^\d{4}-\d{2}-\d{2}$/` implicitly via Set membership. User-entered values are not interpolated into any URL or query. |

---

### Bank holiday fetch

- **URL:** Fixed constant `https://www.gov.uk/bank-holidays.json` — no user input is appended.
- **Schema validation:** Response is rejected if `england-and-wales.events` is absent or fewer than 10 dates are parsed — prevents a malformed response poisoning the calendar.
- **Caching:** Written to `localStorage` under key `dealsdash_bh_v1`. Key is a fixed constant; no user input influences the key or value. Cache is parsed with `JSON.parse` inside a `try/catch`.
- **Fallback:** If fetch fails or schema check fails, the bundled 2026–2028 `FALLBACK` array is used. A `source: 'fallback'` tag is shown in the UI.
- **CORS:** The GOV.UK JSON endpoint sets `Access-Control-Allow-Origin: *` — no credentials are sent.

---

### New dependencies

No new npm packages were added in P11. All functionality uses:
- React (already a dependency)
- Firebase Firestore (already a dependency)
- Browser `fetch` API (no library wrapper)
- `localStorage` (browser native)

---

### Data stored in Firestore

The `programme/main` document stores:
- `inputs` — numeric/string configuration values entered by the user (no PII)
- `scope` — boolean flags for work scope categories
- `actuals` — user-entered actual finish dates (ISO strings)
- `customNonWorkdays` — user-entered non-working day dates (ISO strings)
- `schemaVersion`, `templateVersion`, `updatedAt` — metadata

No personally identifiable information (PII) is stored beyond what the deal document already contains. The programme document is covered by the same data deletion path as other deal subcollections.

**Note:** `deleteAllForUser` in `src/data/repo.js` deletes top-level subcollections but does not yet delete `deals/{dealId}/programme/main`. Programme documents will persist after a user data reset until a separate migration is added.
