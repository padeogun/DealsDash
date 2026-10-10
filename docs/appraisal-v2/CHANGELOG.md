# Appraisal v2 — Changelog

## P09 — Security Review · 10 October 2026

**Reviewer:** Claude Code security-reviewer subagent (independent pass, 45 files, P00–P08 scope)

**Results:** 0 Critical · 2 High · 2 Medium · 2 Low · 22 None

**No fixes applied this pass** — all actionable findings require Paul's approval (see open items).

**Open items blocking release (High):**
- D: `npm audit fix` in `functions/` + `firebase-admin` ≥14.5.0 (proxy-addr critical, node-forge high)
- E: Firebase JS client SDK patch upgrade (`@grpc/grpc-js` high via `@firebase/firestore`)

**Open items not blocking release (Medium/Low):**
- B: SSRF host allow-list in `recheckLeadStatus` (defence-in-depth; auth gate is primary protection)
- C: Guard `ANTHROPIC_API_URL_OVERRIDE` / `EPC_API_URL_OVERRIDE` behind `FUNCTIONS_EMULATOR` env check
- A: Emulator hooks in prod bundle (inert without `?useEmulator=1`)

**Full log:** `docs/SECURITY_LOG.md` — 2026-10-10 entry, findings #1–28

---

## P08 — National Area Screener · 10 October 2026

**Files created:**
- `src/components/ScreenerView.jsx` — 600-line React component: strategy toggle (Flip/BRRR), property type, max entry price, nation filter, per-factor weights panel (0–10, with reset), sortable council table with rank, score, price, yield, 12m growth, sales, flip rate columns, row drill-down to district table (E/W only), "Send to Sourcing" multi-select action, OGL footer
- `public/data/screener.json` — pre-built data: 360 councils, 4,452 district rows, 0.7 MB (HPI, PIPR, Price Paid)
- `docs/SCREENER_BRIEF.md` — build brief documenting data contract, scoring spec, open items, acceptance checks
- `docs/SECURITY_LOG.md` — security review log (2 entries: data build + UI)
- `docs/build_screener.py` — monthly data build (DuckDB + pandas)
- `docs/requirements-screener.txt` — Python dependencies

**Files modified:**
- `src/App.jsx` — `ScreenerView` already imported; "Area Screener" sidebar tab already present; `addTargetAreas` function and `tab === "screener"` render already wired; no changes needed
- `.gitignore` — `.screener-cache/` already present

**Tests:** 177/177 passing (no new pure-JS maths to unit test; scoring runs in-browser against real data)

**Acceptance checks (all pass):**
- BRRR / Terraced / £190k cap / England: Rochdale (5.87%, £172k), Oldham (6.02%, £184k), Tameside (6.04%, £184k) all appear
- Rochdale drill-down: OL11 (4 flips), OL12 (4 flips), OL16 (8 flips) — all non-zero
- No `dangerouslySetInnerHTML` anywhere in ScreenerView.jsx

**Security:** reviewed 2026-10-03 (data build) and 2026-10-03 (UI) — no outstanding issues. See `docs/SECURITY_LOG.md`.

**Key design decisions:**
- Scoring is browser-side: changing weights never requires a network call
- Missing factors excluded from that area's denominator; area flagged "partial data"
- NI gets no BRRR score (PIPR suppresses NI rents); shown as "No BRRR†" with footnote
- Distance factor hidden until ONS council centroids are added (open item #1 in brief)
- Monthly refresh: `python docs/build_screener.py` → `.\update-dealsdash.bat`

**Data model additions (additive — RULE 14):**
- `settings.screener` — `{ strategy, ptype, maxPrice, nations, flipWeights, brrrWeights }` written by ScreenerView via `applySettings`

---

## P07 — Viewing → Offer → Acceptance Funnel · 10 October 2026

**Files created:**
- `src/lib/appraisal/funnel.js` — pure helpers: `calcFunnelMonth`, `calcFunnelRolling`, `sortStandingOffers`, `calcPaceIndicator`, `isFollowUpDue`
- `src/lib/appraisal/__tests__/p07.test.js` — 17 tests: golden case (25 viewings/6 offers/1 accepted → 0.24/0.17), edge cases, standing offer sort, follow-up due flag, pace indicator

**Files modified:**
- `src/lib/appraisal/index.js` — `export * from "./funnel.js"` added
- `src/data/repo.js` — `agentsColRef`, `agentDocRef`, `saveAgent`, `deleteAgent` added (separate Firestore subcollection so agent history survives settings reset)
- `src/App.jsx`:
  - Import `calcFunnelMonth`, `calcFunnelRolling`, `sortStandingOffers`, `calcPaceIndicator`, `isFollowUpDue` from funnel.js
  - `viewings: []` + `pipelineStage: "Watching"` added to `newLead()` default
  - `agents` state + `agentsReady` gate + `onSnapshot` subscription added
  - `syncAgents` helper added
  - `FunnelView` component — viewing target progress bar, this-month and rolling-3-month funnel stats, standing offers list, pace indicator
  - `AgentsView` component — per-agent stats (viewings/offers/accepted/last-contact), 30-day stale flag, add/edit/delete agents
  - `SourcingView` signature extended: `agents`, `setAgents`, `settings`, `onSettingsChange`
  - View mode toggle extended from 2 tabs (List/Kanban) to 4 tabs (List/Kanban/Funnel/Agents)
  - `LeadCard` signature extended with `agents = []`; viewing log section added (date, type, agent select, offer checkbox + amount, outcome, follow-up date, notes)
  - `DEFAULT_SETTINGS.appraisal.viewingTargetPerMonth = 20` added
  - SourcingView call site updated to pass `agents`, `setAgents`, `settings`, `onSettingsChange`

**Tests:** 177/177 passing (+17 P07 tests)

**Key design decisions:**
- Agents live in `users/{uid}/agents/{agentId}` subcollection, separate from settings — agent history survives a settings reset
- Viewing target default = 20/month, editable inline in FunnelView
- Non-auction offer basis: `estResaleHigh − estRefurb − estLegalFinance` (per P07 spec decision)
- `acceptRate = accepted / offers` — uses offers denominator, not viewings; matches spec golden case (1/6 = 17%)
- Pace indicator is labelled "Illustrative only" — training data is too thin to rely on as a predictor
- FunnelBar uses `round2()` internally via `calcFunnelMonth`/`calcFunnelRolling`; display shows `Math.round(rate * 100)` integer percent

**Data model changes (additive — RULE 14):**
- `lead.viewings: []` — shape per viewing: `{ id, date (YYYY-MM-DD), type ("in_person"|"virtual"), agentId, offerMade, offerAmount, outcome ("none"|"accepted"|"rejected"|"standing"|"withdrawn"), followUpDate (YYYY-MM-DD), notes }`
- `settings.appraisal.viewingTargetPerMonth: 20` — default viewing target per month

---

## P06 — Refurb Survey Benchmarks & Construction-Type Flags · 10 October 2026

**Files created:**
- `src/lib/appraisal/construction.js` — `NON_STANDARD_KEYWORDS` array + `isLikelyNonStandard(wallsDescription)` pure helper
- `src/lib/appraisal/__tests__/p06.test.js` — 16 tests: 6 standard EPC strings → false, 4 non-standard strings → true, 6 edge cases (null, undefined, empty, case-insensitive, cavity not flagged, keyword array non-empty)

**Files modified:**
- `src/lib/appraisal/index.js` — `export * from "./construction.js"` added
- `src/modules/survey/data/rates.js` — 4 kerb-appeal rates added: `paint_ext` (£600), `door_composite_uplift` (£200), `glaze_clean` (£120), `frontage_clear` (£100)
- `src/modules/survey/data/checklist.js` — "Kerb appeal" group added to external zone (before "Grounds & boundaries"): 4 items (exterior paint, front door upgrade with `brrrWarn`, glazing clean, frontage tidy)
- `src/modules/survey/SurveyModule.jsx` — BRRR spec toggle on strategy tab (renders only when `strategy === "brrr"`); uplift ratio field + £1→£3 note on each walkthrough action; `brrrWarn` caution note
- `functions/index.js` — `checkEpcRegister` `.map()` extended to return `wallsDescription`, `builtForm`, `constructionAgeBand`, `propertyType` (handles both kebab-case API JSON and camelCase SDK variants)
- `src/App.jsx` — import `isLikelyNonStandard`; `construction: null` added to `newLead()`; `AreaIntelligencePanel` signature extended with `construction` / `onConstructionChange` props; construction signals section added to EPC results (non-standard banner + per-property walls description list); manual construction confirmation fields (type dropdown, frontage, notes); street notes section (construction mix, frontage mix, good/avoid end, other notes); non-standard confirmed warning banner; "Non-std construction" badge in lead card header
- `src/components/AppraisalV2Tab.jsx` — comparables rows extended with `construction` and `frontage` text fields; `addComp()` default object updated

**Tests:** 160/160 passing (+16 P06 tests)

**Key design decisions:**
- EPC construction detection is advisory only — `isLikelyNonStandard` suggests, user confirms manually via dropdown
- Both kebab-case (`walls-description`) and camelCase (`wallsDescription`) handled in Cloud Function, since MHCLG API behaviour varies across SDK versions
- `brrrWarn` flag marks cosmetic items (composite door, exterior paint) that tenants won't pay for — only surfaced when `survey.strategy === "brrr"` AND `survey.brrrSpec === true`
- Value-add uplift ratio < 3.0 shows caution note "Below £1→£3 rule of thumb — Illustrative"; ≥ 3.0 shows positive note
- `construction: null` is additive (RULE 14); existing leads return `undefined` from Firestore, treated as null throughout
- Non-standard badge in lead card header means the flag persists across all tabs, not just the Risk tab

**Data model changes (additive — RULE 14):**
- `lead.construction: null` added to `newLead()` default — shape: `{ confirmedType, frontage, notes, streetConstructionMix, streetFrontageMix, streetGoodAvoidEnd, streetNotes }`
- `epcCheck.properties[n].wallsDescription`, `.builtForm`, `.constructionAgeBand`, `.propertyType` — new fields on EPC results (existing cached results missing these fields degrade gracefully to null)
- `valuation.comparables[n].construction`, `.frontage` — new optional fields on appraisal comparables

---

## P05 — Auction Assessment v2 · 10 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/lib/appraisal/auction.js` — pure helpers: `mapLegalPackCostLines`, `auctionFlipWalkAway` (extracted so they can be unit-tested without jsdom)
- `src/components/AuctionAssessmentV2.jsx` — ~380-line React component for pre-bid auction assessment
- `src/lib/appraisal/__tests__/p05.test.js` — 10 tests: Daniel flip golden case (3), buyer's premium impact (2), legal pack fixture (5)

**Files modified:**
- `src/App.jsx` — import `AuctionAssessmentV2`; `auctionV2: null` added to `newLead()`; wired into `LeadCard` after `<TriageBlock>` for auction leads
- `src/lib/appraisal/index.js` — added `export * from "./auction.js"`

**Tests:** 144/144 passing (+10 P05 tests)

**Component sections:**
1. Verdict bar — PASS/WARN/FAIL with colour border; "(overridden)" tag when FAIL is bypassed
2. Valuation — worst/mid/best number fields, basis toggle; pre-filled from `lead.estResaleLow`/`lead.estResaleHigh`; override stored in `lead.auctionV2.valuation`
3. Cost lines — derived from lead fields (refurb, buyer's premium, seller fees, legal/finance) + most recent legal pack review fees; null amounts shown as "Unknown" badge (RULE 7)
4. Maximum offer — max bid price, SDLT, break-even sale, target sale; editable profit target %; SDLT illustrative label
5. Walk-away tests — 5 tests: value, costs, profit margin, resilience (−10%), AIP
6. AIP checkbox — stored in `lead.auctionV2.aipRecorded`
7. FAIL override — text reason required; stored in `lead.auctionV2.overrideReason`; shows "Remove override" link when set
8. "Ready to bid" bar — hidden on FAIL unless overridden; triggers bid sheet
9. Bid sheet (collapsible + printable) — max bid, SDLT, break-even sale, worst-case value, total costs, target sale, AIP status, top 3 risks, auction house/lot/completion details, SDLT disclaimer, Print/PDF button

**Data model changes (additive — RULE 14):**
- `lead.auctionV2: null` added to `newLead()` default
- At runtime: `lead.auctionV2 = { valuation:{worst,mid,best,basis,comparables}, profitPct, aipRecorded, overrideReason }`
- All cost lines computed on the fly from existing lead fields — not stored (no new Firestore fields for costs)

**Key design decisions:**
- Cost lines are derived (not stored): lead fields + legal pack review fees = ephemeral computation in `useMemo`
- Auction flip uses a separate `auctionFlipWalkAway()` (5 tests) — not the BRRR-oriented `walkAway()` from P01 (which tests refinance, ICR, cash flow)
- `mapLegalPackCostLines` and `auctionFlipWalkAway` extracted to `src/lib/appraisal/auction.js` (pure JS, no React) for testability — imported by both the component and the test file
- Override mechanism requires a written reason — stored on the lead so it appears in any audit

**Golden cases confirmed in tests:**
- Daniel scenario: worst £120k, refurb £18k, legals £7,600, 15% profit → `flipBudget = 76,400` ✓
- splitBudget(76,400, company, ENG) → price + SDLT = £76,400 ✓
- auctionFlipWalkAway with 3 comps, no null lines, AIP recorded → verdict "pass" ✓
- £1,500 buyer's premium reduces flipBudget by exactly £1,500 ✓
- Legal pack: 3 otherFees (£500, £150, null label) → 3 lines, 2 with amounts, 1 null → sumCosts incomplete ✓

**Gate:** P05 complete. Run one real auction lead end-to-end on the emulator to confirm the bid sheet renders. Await Paul's sign-off before proceeding to P06 (or next agreed phase).

---

## P04 — Funding Sources, Bridging Calculator and Capital Recycling · 10 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/lib/appraisal/__tests__/p04.test.js` — 14 tests: bridging golden case, finance→engine integration, recycling overrun fixture, capital cost

**Files modified:**
- `src/lib/migrations/v2.js` — `emptyV2Block()` adds capital allocation fields (`capitalAllocated`, `capitalDeployedAt`, `capitalExpectedReturnAt`, `capitalReturnedAt`, `useComputedFinance`); `FundingSource` typedef extended with broker/valuation/lenderLegal/admin/extensionRate fields
- `src/components/AppraisalV2Tab.jsx` — bridging calculator panel + finance cost toggle + capital allocation section
- `src/App.jsx` — `PrivateCapitalTracker` component added to `BusinessPlannerView`; imports `recycling`, `capitalCost`

**Tests:** 134/134 passing (+14 P04 tests)

**New sections in AppraisalV2Tab:**
1. **Funding & bridging panel** — bridge source form (LTV%, rate, term, interest mode, arrangement/exit %, fee fields); toggle "use computed finance cost in engine" (reduces max offer by bridge total cost at term); bridging calculator outputs: gross loan, day-one release, finance cost at term, extension cost/month; shortfall warning when day-one release < purchase price + SDLT; redemption table at months 6/9/12/15; Daniel/classroom golden-case note
2. **Private capital allocation** — per-deal fields: allocated £, deployed date, expected return, actual return; computed interest cost; overrun/overdue warning flags

**PrivateCapitalTracker (BusinessPlannerView):**
- Uses `recycling()` from `capital.js` across all deals with `v2.capitalAllocated > 0`
- KPIs: pool size, deployed, idle, turns/year; overrun alert banner
- Cumulative accrued interest (active allocations)
- Allocations table: deal name, allocated, deployed date, expected return, interest cost, status (active/overdue/overrun/returned)
- Pool size and rate editable inline (existing settings fields)

**Golden case confirmed in tests:**
- £75k gross, 1%/month retained ×12, 1%/1% at start, broker £500, valuation £650 → day-one release **£63,350** ✓

**Key design decisions:**
- Bridge gross = `deal.price × ltvPct` (actual purchase price, not max offer — avoids circularity)
- Finance cost is opt-in (`useComputedFinance` toggle); off by default so existing max-offer figures are unchanged until Paul enables it
- Capital allocations stored on `deal.v2` (additive — RULE 14); no new Firestore collection needed

**Gate:** P04 complete. Awaiting Paul's sign-off before proceeding to P05 (Auction Walk-Away).

---

## P03 — Appraisal v2 UI · 10 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/components/AppraisalV2Tab.jsx` — ~500-line React component wiring the P01 engine into the deal detail view

**Files modified:**
- `src/App.jsx` — added `import AppraisalV2Tab`, added `"Appraisal v2"` to `DEAL_TABS`, added render block after Decision Brief tab
- `docs/appraisal-v2/CHANGELOG.md` — this entry

**Tests:** 120/120 passing (no new tests — UI tests require jsdom setup, noted as P03 follow-up)

**Component sections:**
1. Verdict bar — PASS/WARN/FAIL with colour border, lists failing walk-away test IDs
2. Max offer — Flip/BRRR strategy toggle; price, SDLT, budget, total project cost KPIs; SDLT `effectiveFrom` + `verifyAt` notice
3. Valuation — worst/mid/best number fields with segmented basis control; comparables table (add/remove)
4. Cost lines — label, amount (null renders "Unknown" badge — RULE 7), basis select, source, remove
5. Refinance — LTV, refi fees, accepted left in, lender route
6. Rental income — monthly rent, IO mortgage, net cash flow KPIs, ICR result
7. Four measures (RULE 10) — cash released, cash left in, equity, net monthly — always separate
8. Fragility — BRRR: break-even val + headroom + refi surplus; Flip: break-even sale + target sale
9. Stress tests — BRRR only, sorted worst-first, collapsed to 3, expand button
10. Walk-away tests — 5 tests with colour-coded borders
11. v1 comparison — shown when `settings.appraisal.showV1Comparison !== false`
12. Per-deal overrides — collapsible panel for profit%, ICR, min monthly, min headroom, left in, LTV

**Key implementation notes:**
- All cost lines passed as `refurb` to `flipBudget`/`brrrBudget` (P04 will add proper bridge cost modelling)
- Per-deal overrides fall back to global `settings.appraisal` thresholds
- `deal.v2 || {}` guard: component renders safely on pre-migration deals
- SDLT always computed as company buyer, England — `effectiveFrom: 2025-10-31` label shown with Illustrative tag
- Stress tests (BRRR only): 7 scenarios from `runStress`, sorted by `cfResult` ascending

**Gate:** P03 complete. Awaiting Paul's sign-off before proceeding to P04 (Funding & Capital phase).

---

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
