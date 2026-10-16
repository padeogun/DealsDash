# Appraisal v2 — Security Log

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
