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
