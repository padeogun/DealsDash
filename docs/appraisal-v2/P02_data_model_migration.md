# P02 — Data Model v2 and Safe Migration

**Read first:** `RULES.md`, `AUDIT_FINDINGS.md`, `DECISIONS.md`.

## Goal
Extend the single-document model (`users/{uid}/appData/main`) with v2 fields, additively and reversibly, and prove the migration on the emulator with a copy of Paul's real data.

## 1. Confirm backup
Do not proceed until a timestamped backup from P00 exists in `backups/`. If not, stop and ask Paul to run the export.

## 2. Schema additions (all optional, all defaulted)
Add JSDoc typedefs (or a `schema.js`) with inline comments for every field.

```js
appData.schemaVersion = 2                       // bumped from current (or 1 if absent)

appData.settings.appraisal = {                  // all "Illustrative — verify" until Paul confirms
  profitPctDefault: 0.15,
  acceptedLeftInDefault: 0,
  icr: 1.25, icrStressRate: 0.055,
  minNetMonthly: 150, minHeadroomPct: 0.05,
  reserves: { mgmt: 0.10, maint: 0.08, voids: 0.04 },
  stress: { valuationDrops:[0.05,0.10,0.15], lowerLtv:0.70, refurbOverruns:[0.10,0.20],
            rentDrops:[0.05,0.10], voidMonths:2, rateShockPp:0.02, delayMonths:3 },
  viewingTargetPerMonth: 20,
  privateCapital: { pool:50000, ratePct:0.08, termMonths:12, extensionCapMonths:3 },
  // values Paul confirmed in P00 override the defaults above (read DECISIONS.md)
}

deal.v2 = {
  valuation: { best:null, mid:null, worst:null, basis:'worst', comparables:[] },
  costLines: [],                                // CostLine[] — null means unknown, never zero
  funding: { sources:[] },                      // { type:'bridge'|'btlMortgage'|'privateLoan'|'cash'|'jv', ...params }
  refinance: { ltv:0.75, lenderRoute:null, refiFees:null, acceptedLeftIn:null },
  rent: { monthly:null, evidence:[] },
  results: null,                                // cached engine output + computedAt + engineVersion
  walkaway: null,                               // cached verdict
}

pipeline.viewings = []                          // filled in P07
planner.capitalPool = { allocations:[] }        // filled in P04
```

## 3. Migration
- `migrateToV2(appData)` — pure function in `src/lib/migrations/v2.js`: adds missing fields with defaults; **pre-fills** `deal.v2` from existing v1 fields where they map cleanly (e.g. v1 GDV → `valuation.worst` with `singlePoint:true`); never deletes or renames v1 fields.
- Idempotent: running twice gives the same result (test it).
- Runs once on load when `schemaVersion < 2`, writes back, and logs a one-line summary (deals migrated, fields pre-filled, fields left null).
- Keep the v1 result visible beside v2 in the UI until Paul retires it (feature flag `settings.showV1Comparison = true`).

## 4. Document size guard
- Compute serialized size of `appData` on save. Warn in the UI at 700 KB, block at 950 KB (Firestore limit is 1 MiB).
- Comparables stored as compact summaries (no listing HTML, no images).
- If Paul's real data is already above 500 KB, **propose** (do not implement) a move of deals to a `users/{uid}/deals/{dealId}` sub-collection, with the rules change needed.

## 5. Tests
- Unit: migration on fixtures — empty doc, typical v1 doc, doc already at v2, doc with odd/missing v1 fields.
- Emulator: import a **copy** of the production backup into the emulator, run the app with `?useEmulator=1`, confirm every existing deal opens, v1 figures unchanged, v2 pre-fills correct. Record before/after document size.

## Gate
Stop. Report the migration summary from the emulator run, document size before/after, any v1 fields that could not be mapped, and the size-guard decision. Update `CHANGELOG.md`. Wait for approval.
