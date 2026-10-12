# P00 — Audit Findings
**Produced:** 9 October 2026  ·  **Branch:** feature/appraisal-v2  ·  **Auditor:** Claude Code (read-only pass)

---

## 1. Folder structure and build tooling

```
dealsdash-package/
├── public/          static site (bundle.js, styles.css, index.html, favicon.png)
├── src/
│   ├── App.jsx      MONOLITH — all UI + calculation engine (~5,700 lines)
│   ├── main.jsx     React root mount
│   ├── components/  Badge.jsx, UserGuideView.jsx, WorkspaceView.jsx, ScreenerView.jsx
│   ├── data/        repo.js (Firestore refs/CRUD), migrate.js, seedDefaults.js
│   ├── design-system/ VIXIV DS v1 (react/index.jsx, tokens.css, tailwind.preset.js)
│   ├── lib/         decision.js, funding.js, pipeline.js, utils.js (+test files)
│   ├── logos/       PNG brand assets (not imported after logo revert)
│   └── modules/survey/  SurveyModule.jsx + data/rates.js, lib/costing.js, etc.
├── functions/       index.js (all Cloud Functions, ~1,600 lines)
├── docs/            planning docs, spike findings, appraisal-v2/ pack
└── scripts/         build-imd.js
```

**Build tooling:** esbuild (NOT Vite) — bundle via `npm run build:js`.  
**CSS:** Tailwind CSS v3.4 — `npm run build:css`.  
**Tests:** Vitest v3.2.7 — `npm test`, glob `src/**/*.test.js`.  
**Deploy:** Firebase Hosting + Firestore rules + Functions via `firebase deploy`.  
**Emulator:** `?useEmulator=1` wires `connectAuthEmulator / connectFirestoreEmulator / connectFunctionsEmulator / connectStorageEmulator`.

---

## 2. Deals appraisal engine

**Location:** `src/App.jsx` lines ~88–185 (no separate module yet).

| Function | Purpose |
|---|---|
| `calcFunding(deal)` | SDLT + fees + buyer's premium + refurb → fundsRequired, bridgeDrawn, shortfall |
| `calcBridge({amount,…})` | Compound retained interest, arrangement fee, exit fee → total bridge cost |
| `calcRefurbTotal(items, contingencyPct)` | Average of low/high per item × contingency |
| `calcGDV(deal)` | gdvOverride OR floorArea × avgPsf × (1 + conditionAdj) |
| `calcSelling(gdv,…)` | EA fee (% of GDV) + solicitor + EPC |
| `calcHolding(deal, months, bridgeTotal)` | holdingMonthly × months + bridge total |
| `calcTimeline(phases)` | Sum of phase weeks → months (ceil ÷ 4.33) |
| `appraiseDeal(deal)` | Assembles all above → {gdv, netProfit, roi, annualisedRoi, cashLeftIn, noi, netCashFlowMonthly, …} |

**Flip vs BRRR:** NOT separated. `appraiseDeal()` always computes both flip metrics (netProfit) and BTL metrics (noi, cashLeftIn, cashOnCash) from the same deal. No strategy-aware routing.

**Worst/mid/best:** NOT implemented. Single GDV is used. `calcGDVLow()` exists only for the max bid solver.

**Profit-first stack:** NOT implemented. The engine subtracts costs from GDV; it does not deduct a target profit first to derive the purchase budget.

---

## 3. Max bid bisection solver

**Location:** `src/App.jsx` lines ~218–251.

```js
function solveMaxBid(deal, targetProfit, opts = {})
// tol: £100; maxIter: 40; hi0 = calcGDVLow(deal)
// Bisects [0, gdvLow] on profitAt(price) — calls full appraiseDeal() at each step
// Returns: { maxBid: ceiling, safeBid, bufferPct, profitAtMaxBid, gdvLow, iterations, note }
```

**Conservative GDV (`calcGDVLow`):** 25th-percentile £/sq ft from comp distribution × floorArea × (1 + conditionAdj). Falls back to `calcGDV()` when fewer than enough comps.

**Price-dependent costs handled by solver (via `calcFunding`):**
- SDLT (progressive, price-dependent)
- Bridge loan drawn (LTV × price)
- Bridge interest (compounds on loan)
- Arrangement fee (% of loan)
- Exit fee (% of loan)
- **Buyer's premium** (% of price — added in recent session)

**Buffer:** `safeBid = ceiling × (1 − bidBufferPct)`; default 2%. Stored separately as `maxBidSafe`.

**Gap vs v2:** Solver still calls the v1 `appraiseDeal()` engine. P01 will wrap it onto the v2 engine.

---

## 4. SDLT

**Location:** `src/lib/funding.js` lines 16–53, exported as `calcSdltAudit(price, additionalProperty)`.

| Table | Effective date | Rates |
|---|---|---|
| `SDLT_BANDS_ADDITIONAL` | 31 Oct 2024 | 5%/7%/10%/15%/17% |
| `SDLT_BANDS_STANDARD` | 1 Apr 2025 | 0%/2%/5%/10%/12% |

- **Company-specific rates:** Not implemented. Company purchases are modelled as `additionalProperty = true` (which is correct — companies always pay the surcharge), but there is no separate company rate table.
- **First-time buyer relief:** Never applied. Correct per RULES.md §12.
- **Scotland/Wales:** `sdltJurisdictionNote()` returns a disclaimer string; the App.jsx UI surfaces it. The numeric calc still runs against England bands for non-England deals — a **silent bug**; the disclaimer is shown but the number is still calculated. v2 should return `unsupported` and 0.
- **Jurisdiction check in calcSdltAudit:** None — the function has no country parameter; jurisdiction awareness is caller-side only.
- `effectiveFrom` and `verifyAt` fields: Not yet on the data structure (RULES.md §11 requires these in v2).

---

## 5. Cost lines in a deal

Every numeric field defaults to `Number(x) || 0` — **blanks are silently treated as zero**. This is the behaviour RULES.md §7 requires v2 to fix (null ≠ zero).

| Category | Fields |
|---|---|
| Purchase | price, fees.{solicitor, searches, survey, broker, valuation, landReg, other} |
| Auction | buyersPremiumPct |
| Refurb | refurbItems[{name, low, high}], contingencyPct |
| Finance | bridgeLTV, bridgeMonthlyRate, arrangementPct, exitPct, ownCash |
| Holding | holdingMonthly, phases[{name, weeks}] |
| Selling | eaPct, solicitorSale, epc |
| BTL | btlLtv, btlRate, btlProductFeePct, monthlyRent, voidPct, mgmtPct, maintPct, llInsurance |
| Buffer | bidBufferPct |

---

## 6. Data model

**Schema version:** `settings/app.schemaVersion === 2` (migrated from single `appData/main` doc).

**Subcollections under `users/{uid}/`:**

| Collection | Description |
|---|---|
| `deals/{id}` | Full deal objects including appraisal inputs |
| `leads/{id}` | Sourcing pipeline leads |
| `ledger/{id}` | Capital/cash ledger entries |
| `contacts/{id}` | Contacts |
| `properties/{id}` | BTL portfolio properties |
| `settings/app` | User settings + schemaVersion |
| `planner/main` | Business planner state |
| `buyBoxes/{id}` | Buy box / Playbook definitions |
| `deals/{id}/briefs/{id}` | Decision brief history |
| `notifications/{id}` | In-app notification inbox |
| `marketStats/{district}` | **Root collection** (not per-user) — Land Registry stats, written by Cloud Function |

**Document size:** Unknown. Paul needs to run the export script (Step 3) to measure. At risk of growth as deals accumulate comparables, maxBidLog entries, and v2 fields.

---

## 7. Business Planner

- State: `planner/main` Firestore doc
- Capital pool tracked via ledger entries
- VIXIV revolving fund: `calcFundUsage()` in `funding.js` — 8%/yr, 365-day term, 90-day extension, cost = `allocation × rate × days ÷ 365`
- **£50k raise tracking:** Not implemented. The Business Planner UI shows capital deployment but has no explicit "family-and-friends fund" pool with turn-rate tracking. Will be built in P04.

---

## 8. Refurb Survey module

- Location: `src/modules/survey/`
- Benchmark rates: `data/rates.js` (placeholder rates per trade)
- Costing: `lib/costing.js` applies rates × quantity
- Integration: `lib/applyToDeal.js` merges survey lines into deal refurbItems
- Kerb-appeal benchmarks and £1→£3 check: **not yet implemented** (P06)

---

## 9. EPC / Area Intelligence

**EPC fields currently fetched** (from `checkEpcRegister` Cloud Function):
- `address`, `currentEnergyEfficiencyBand`, `registrationDate`, `certificateNumber`

**EPC fields NOT yet fetched** (needed by P06):
- `walls-description`
- `built-form`
- `construction-age-band`
- `property-type` (EPC API field)

These are available from the MHCLG API but not currently requested. P06 will need to extend the `checkEpcRegister` function and the `deal.epcCheck` shape.

---

## 10. Tests

**Runner:** Vitest v3.2.7 (already installed — no action needed)  
**Status:** 34 tests, 2 files, all passing

| File | Tests | Coverage |
|---|---|---|
| `src/lib/funding.test.js` | 19 | SDLT bands, bridge interest (retained/serviced), BRRR exit, ICR, fund usage |
| `src/lib/decision.test.js` | 15 | BUY/WATCH/PASS verdict, rule resolution, legal pack flags, risk register, open questions |

**Not tested:** `appraiseDeal()`, `solveMaxBid()`, `calcGDVLow()`, `calcGDV()`, `calcBridge()`, `calcRefurbTotal()`, `calcFunding()`, all UI components. The golden cases from the training day (§5 of README) have **no test coverage** — writing them is the first task in P01.

---

## 11. Cloud Functions

All `onCall` functions verify `request.auth.token.email === ALLOWED_EMAIL` before any work.

| Export | Trigger | Auth | Notes |
|---|---|---|---|
| `reviewDeal` | onCall | email gate | claude-haiku-4-5-20251001; 60s; AI memo of deal |
| `researchLeads` | onCall | email gate | claude-sonnet-4-6; 180s; web search → leads |
| `reviewLegalPack` | onCall | email gate | claude-sonnet-4-6; 300s; 1GiB; PDF chunking |
| `recheckLeadStatus` | onCall | email gate | claude-haiku-4-5-20251001; 60s; direct fetch + AI fallback |
| `checkEpcRegister` | onCall | email gate | MHCLG EPC API proxy; 30s |
| `refreshMarketStats` | onCall | email gate | Land Registry SPARQL; 120s |
| `estatelyWebhook` | onRequest | HMAC-SHA256 | No Firebase Auth — signed webhook; 30s |

**Model risk flag:** `reviewDeal` and `recheckLeadStatus` use `claude-haiku-4-5-20251001`. This is a valid model ID as of the knowledge cutoff. Verify it remains available before P10.

---

## 12. Firestore rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId
        && request.auth.token.email == "paul.a.adeogun@gmail.com";
    }
    match /marketStats/{district} {
      allow read: if request.auth != null
        && request.auth.token.email == "paul.a.adeogun@gmail.com";
      allow write: if false;
    }
    match /mail/{id} {
      allow read, write: if false;
    }
  }
}
```

---

## 13. Reuse vs Build table

| v2 module | Target path | Status | File to touch |
|---|---|---|---|
| `valuation.js` | `src/lib/appraisal/` | **Build new** | No worst/mid/best split exists |
| `costs.js` | `src/lib/appraisal/` | **Build new** | null-not-zero model doesn't exist |
| `sdlt.js` | `src/lib/funding.js` | **Extend** | Add company table, effectiveFrom/verifyAt; fix country guard |
| `bridging.js` | `src/lib/appraisal/` | **Build new** | Day-one release not modelled; redemption at month m missing |
| `capital.js` | `src/lib/funding.js` → new file | **Extend** | `calcFundUsage()` exists; recycling tracker needs building |
| `flip.js` | `src/App.jsx` → new file | **Build new** | Profit-first max offer not implemented |
| `brrr.js` | `src/App.jsx` → new file | **Build new** | Break-even valuation not calculated |
| `cashflow.js` | `src/App.jsx` appraiseDeal | **Extend** | noi/netCashFlow/ICR all exist; reserves config missing |
| `stress.js` | `src/lib/appraisal/` | **Build new** | 7 scenarios not implemented |
| `walkaway.js` | `src/lib/appraisal/` | **Build new** | 5 walk-away tests not implemented |
| `solve.js` | `src/App.jsx` solveMaxBid | **Extend** | Bisection logic reusable; needs v2 engine wiring |
| Golden tests | `src/lib/appraisal/__tests__/` | **Build new** | 8 golden cases from README §5 — zero test coverage today |
