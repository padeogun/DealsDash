# Appraisal v2 — Changelog

## P02 — Data Model Migration · 10 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/lib/migrations/v2.js` — idempotent migration functions: `migrateV2Deal`, `migrateV2Settings`, `emptyV2Block`, `DEFAULT_APPRAISAL_SETTINGS`, `migrationSummary`
- `src/lib/migrations/v2.test.js` — 25 unit tests: settings migration, deal migration (empty/typical/idempotent/no-GDV variants), migrationSummary
- `src/lib/docSize.js` — Firestore document size guard: `estimateDocSize`, `checkDocSize` (warn at 700 KB, block at 950 KB)

**Files modified:**
- `src/data/repo.js` — `saveDeal` now checks document size; throws if ≥ 950 KB, warns if ≥ 700 KB
- `src/data/migrate.js` — added Pass 3 (schemaVersion 2 → 3): adds `deal.v2` block to all deals and `settings.appraisal` block; logs prefill summary
- `src/App.jsx` — `newDeal()` now includes `v2: emptyV2Block()` so new deals start with the v2 structure; added import for `emptyV2Block`

**Tests:** 120/120 passing (+25 migration tests)

**Schema changes (additive only — RULE 14):**
- `deal.v2` block added to all existing deals (pre-filled from v1 fields where unambiguous)
- `settings.appraisal` block added with illustrative defaults (ICR 1.25, profitPct 0.15, etc.)
- `schemaVersion` bumped: 2 → 3; `migratedV3At` timestamp added

**Pre-fill summary (from migration logic):**
- `v2.valuation.worst` — pre-filled when `gdvOverride > 0` (singlePoint mode)
- `v2.valuation.comparables` — pre-filled from `deal.comps` where no GDV override exists
- `v2.costLines` — pre-filled from `refurbItems` (average of low/high; zero-both-ends excluded per RULE 7)
- `v2.funding.sources[0]` — pre-filled from `fundingMode`, `bridgeLTV`, `bridgeMonthlyRate`, etc.
- `v2.refinance.ltv` — pre-filled from `btlLtv`
- `v2.rent.monthly` — pre-filled from `monthlyRent` where > 0

**v1 fields preserved:** All existing deal fields untouched (RULE 14). v1 engine still runs alongside v2 while `showV1Comparison: true` (from `DEFAULT_APPRAISAL_SETTINGS`).

**Gate:** P02 complete. Awaiting Paul's sign-off before proceeding to P03 (Deals Appraisal UI).

---

## P01 — Pure Calculation Engine · 9 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/lib/appraisal/costs.js` — CostLine type, sumCosts (null propagation)
- `src/lib/appraisal/valuation.js` — three-point valuation, basisValue, toValuation
- `src/lib/appraisal/sdlt.js` — data-driven SDLT with effectiveFrom/verifyAt; Scotland/Wales guard; FTB warning
- `src/lib/appraisal/solve.js` — bisection maxPrice solver; splitBudget
- `src/lib/appraisal/bridging.js` — bridgeRelease (simple interest for retained day-one deduction)
- `src/lib/appraisal/flip.js` — flipBudget, flipMaxOffer, flipBreakEvenSale, flipTargetSale
- `src/lib/appraisal/brrr.js` — brrrBudget, brrrMaxOffer, breakEvenValuation, headroomPct, refiPosition, cashLeftIn
- `src/lib/appraisal/capital.js` — capitalCost, recycling
- `src/lib/appraisal/cashflow.js` — netMonthly, icrPass, monthlyMortgage
- `src/lib/appraisal/stress.js` — 7 stress scenarios
- `src/lib/appraisal/walkaway.js` — 5 walk-away tests with verdict
- `src/lib/appraisal/index.js` — public re-export barrel
- `src/lib/appraisal/__tests__/golden.test.js` — 13 golden cases (written first, confirmed failing)
- `src/lib/appraisal/__tests__/additional.test.js` — 48 formula verification + edge case tests

**Tests:** 95/95 passing (was 34/34 before P01; +61 new tests)

**Golden case table — expected vs actual:**

| Test | Expected | Actual | Status |
|---|---|---|---|
| flipBudget (15% profit) | 110800 | 110800 | ✓ |
| splitBudget 110800 company → price | 105523.81 | 105523.81 | ✓ |
| splitBudget 110800 company → SDLT | 5276.19 | 5276.19 | ✓ |
| brrrBudget £20k left in | 200000 | 200000 | ✓ |
| brrrBudget all money out | 180000 | 180000 | ✓ |
| splitBudget 200000 company → price | 189252.34 | 189252.34 | ✓ |
| splitBudget 200000 company → SDLT | 10747.66 | 10747.66 | ✓ |
| bridgeRelease dayOneRelease | 63350 | 63350 | ✓ |
| breakEvenValuation Katie | 268666.67 | 268666.67 | ✓ |
| headroomPct 270k vs 268666 | ≈0.0049 | 0.0049 | ✓ |
| refiPosition 280k | 8500 | 8500 | ✓ |
| refiPosition 270k | 1000 | 1000 | ✓ |
| refiPosition 260k | −6500 | −6500 | ✓ |
| refiPosition 250k | −14000 | −14000 | ✓ |
| refiPosition 240k | −21500 | −21500 | ✓ |
| refiPosition Sean 85k | 12250 | 12250 | ✓ |
| null propagation legals:null | incomplete | incomplete | ✓ |
| Scotland SDLT → unsupported | unsupported | unsupported | ✓ |
| FTB → warning, standard rate | warning | warning | ✓ |

**Engine discrepancy (v1 vs v2) — Paul must decide before P02:**

| Aspect | v1 (App.jsx `calcBridgeInterest`) | v2 (`bridgeRelease`) | Impact |
|---|---|---|---|
| Retained bridge interest | **Compound** `loan × ((1+r)^n − 1)` | **Simple** `loan × r × n` | £75k at 1%/mo for 12mo: compound = £9504, simple = £9000. Difference of **£504** on the day-one release. |

For the training golden case (Katie), simple interest (£9000) matches the expected release of £63,350. Compound would give £62,846. **v2 (simple) is correct for that deal; v1 compound will be retired in P02 once confirmed.**

**Open questions for Paul before P02:**
1. Confirm the illustrative defaults in DECISIONS.md (flip profit % 15%, ICR 125%/5.5%, min net monthly £150, etc.)
2. Confirm simple vs compound interest is correct for your specific lenders (v2 uses simple — matches training golden case).
3. Did the backup script (`node scripts/backup-firestore.js`) run successfully?

**Gate:** Awaiting Paul's sign-off before wiring the v2 engine into the UI (P02).

---

## P00 — Audit and Setup · 9 October 2026

**Files created:**
- `docs/appraisal-v2/AUDIT_FINDINGS.md` — full codebase audit (folder structure, engine, SDLT, costs, data model, tests, Cloud Functions, Firestore rules, reuse/build table)
- `docs/appraisal-v2/CHANGELOG.md` — this file
- `CLAUDE.md` — project-level instructions + Appraisal v2 rules summary (all 20 rules, decisions)
- `scripts/backup-firestore.js` — export script for `users/{uid}` subcollections to `backups/`

**Files modified:**
- `.gitignore` — added `backups/` entry

**Branch created:** `feature/appraisal-v2` from `main` (commit a623c3d)

**No application code was changed in P00.**

**Tests:** 34/34 passing (no new tests — P01 adds the golden cases).

**Key audit findings:**
- Calculation engine is a monolith in `src/App.jsx`; must be extracted to `src/lib/appraisal/` in P01.
- `appraiseDeal()` has no worst/mid/best split — single GDV only.
- Null-not-zero: all cost fields default to 0 on blank — v2 must introduce the null model.
- SDLT: no company-specific table; Scotland/Wales disclaimer shown but England calculation still runs (silent bug).
- Day-one bridge release not modelled; profit-first stack not implemented; break-even valuation not calculated.
- 0 test coverage on `appraiseDeal()`, `solveMaxBid()`, or any golden cases from the training.
- EPC API returns band only; construction fields (walls-description, built-form, construction-age-band) not fetched.
- Backup script written but NOT yet run against production — Paul must run it and confirm.

**Gate:** Waiting for Paul's answers to P00 clarifying questions before proceeding to P01.
