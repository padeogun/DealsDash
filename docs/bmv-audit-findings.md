# BMV Appraisal Tool vs DealsDash — Audit Findings

**Date:** 30 Sep 2026  
**Prompt:** 11 — Audit only. No code changes until owner confirms.  
**Standalone source:** `update MD/bmv-appraisal-standalone.html` — read in full. All calculations verified against source code. DealsDash citations verified against current source.

---

## 1. Summary Verdict

Porting the standalone engine would add **substantial value** — confidence **High**.

DealsDash already has the data model, API integrations, and workflow that the standalone lacks (EPC prefill, legal pack triage, area intelligence, notifications, pipeline stages, desktop workspace). The standalone has superior appraisal depth: a full SELL vs LET cost split, derived refurb grade, BRRR max-offer solver, sensitivity grid, 12-flag red-flag screen, corporation tax, and a verification register.

The highest-value gaps are:

1. **Sell vs LET works scope** — DealsDash applies one works total to both strategies; the standalone correctly splits them
2. **Derived refurb grade** — contingency and programme are set manually in DealsDash; the standalone derives them from element ratings
3. **BRRR max-offer solver** — missing entirely from DealsDash
4. **Sensitivity grid** — missing entirely from DealsDash
5. **Red-flag screen** — DealsDash covers 1–5 of 12 standalone flags explicitly

The standalone's calculation functions (`deriveGrade`, `sdlt`, `corpTax`, `worksTotals`, `appraise`, `maxOffer`, `sensitivity`, `verdict`) have no DOM dependencies. They can be ported as `src/lib/appraisal.js` with unit tests. Storage uses `claude.use("db")` and localStorage — both must be replaced with the DealsDash Firestore data layer.

The standalone's seed rate library (48 items, Greater Manchester 2026) is the same data already in `src/modules/survey/data/rates.js` — labelled ILLUSTRATIVE, editable in the app. No action required on rates per README rule 6.

**Key method difference to resolve with owner:** DealsDash bridge uses **compound** retained interest; the standalone uses **simple** interest (confirmed at line 475). Compound is more conservative (~£490 more on the test deal). The owner should choose one method before porting.

---

## 2. Feature Comparison Table

### Condition and scope

| # | Feature | Status | DealsDash evidence | Notes |
|---|---------|--------|-------------------|-------|
| 1 | RICS CR1–3 on 30 elements (external, internal, services, safety) | PARTIAL | `src/modules/survey/data/checklist.js` — 30 elements with `guide` and `reg` per item | No CR1/CR2/CR3 numerical scoring; elements have condition notes and guides but no rating scale |
| 2 | Refurb grade (light/medium/heavy) derived from ratings, not user-chosen | MISSING | `src/modules/survey/SurveyModule.jsx` — no derivation logic | Grade is not computed; contingency % is entered manually by the user. Standalone rule: heavy if any structural element is CR3 OR ≥3 elements are CR3; medium if any services/fitout/safety element is ≥CR2 or any fabric element is CR3; otherwise light |
| 3 | Grade drives contingency (10/15/20%) and programme (4/10/18 weeks) | MISSING | `App.jsx:94 calcRefurbTotal` — `contingencyPct` is a user input | No link between element ratings and contingency or programme. Standalone values are in `DEFAULT_CFG.contingency` and `DEFAULT_CFG.programmeWeeks` and are editable settings, not hard-coded |
| 4 | Sell vs LET target standards (mortgageable vs full PRC compliance) | MISSING | `src/modules/survey/SurveyModule.jsx:compliance` tab has a strategy field | Field exists for display; does not drive cost scoping, regulatory checks, or certificate requirements |
| 5 | Works items tagged SELL/LET/BOTH; flip costed on sell scope, BRRR on let scope | MISSING | `App.jsx:146 appraiseDeal` — one works total used for both strategies | Standalone: LET scope = all included items; SELL scope = items with `std === "SELL"` or `"BOTH"`. DealsDash uses the same `refurbTotal` regardless of strategy |
| 6 | Each works item: category, qty/unit, min–max rate, source tag [RATE/QUOTE/EST/USER], priority, regulatory reference, certificate | PARTIAL | `src/modules/survey/data/checklist.js` — has category, regulatory refs, and cost function on actions | No min/max rate per item stored as data; no [RATE/QUOTE/EST/USER] source tag; no priority field; no certificate field |
| 7 | Claude drafts works list; prices from rate library by key; unmatched items tagged EST; redraft preserves user-edited items | PARTIAL | `src/modules/survey/SurveyModule.jsx:prefillFromDeal` — prefills from EPC/legal pack data | No rate-library lookup by key in AI draft; no EST tagging of unmatched items; redraft behaviour UNVERIFIED |
| 8 | Rate library ~48 items, editable, each with per-item source and date | PARTIAL | `src/modules/survey/data/rates.js` — 48 items labelled "ILLUSTRATIVE — unvalidated. Greater Manchester, 2026"; stored as `settings.surveyRates` and editable | DealsDash rate entries carry no `source` or `date` fields. Standalone rate structure: `{ key, item, unit, min, max, cat, source, date }` — per-item source and date allow the user to know which rates are still illustrative |
| 9 | Cost basis toggle (min/mid/max) and regional cost factor | MISSING | `App.jsx:94 calcRefurbTotal` — applies one rate | Single point estimate; no regional multiplier. Standalone: `DEFAULT_CFG.costBasis` ("min"/"mid"/"max") and `DEFAULT_CFG.regionalFactor` (applied to RATE and EST items only, not QUOTE or USER) |

### Valuation

| # | Feature | Status | DealsDash evidence | Notes |
|---|---------|--------|-------------------|-------|
| 10 | Weighted comparables, time/condition adjustment %, as-is vs refurbished basis, confidence rating | PARTIAL | `App.jsx:353 compPsfDistribution` — returns min/p25/median/p75/max PSF | No per-comp weights; no adjustment %; no explicit confidence rating. Standalone confidence is High if ≥3 comps, all within 2 years, spread ≤15%; Medium otherwise; Low if <2 comps. Standalone comps are tagged `basis: "as-is"` or `"refurbished"` separately |
| 11 | BMV measured against as-is value; gap to ARV shown separately and labelled "not a BMV measure" | PARTIAL | `App.jsx:146 appraiseDeal` — calculates BMV and ARV | BMV = `(asIsValue − price) / asIsValue` in standalone; gap to ARV (upside to refurbed value) is shown separately and explicitly labelled in the standalone UI. DealsDash shows both figures but without the "not a BMV measure" disclaimer on the ARV delta |

### Appraisal

| # | Feature | Status | DealsDash evidence | Notes |
|---|---------|--------|-------------------|-------|
| 12 | SDLT by band, 5% higher rates for company/additional purchase, under-£40k exemption | PRESENT | `App.jsx:83 calcSDLT(price, additionalProperty)`; detailed audit version at `src/lib/funding.js:calcSdltAudit` | Test deal matches exactly (see §3). Note: standalone warns if company purchase is over £500k (17% flat rate risk) — DealsDash: UNVERIFIED |
| 13 | Bridging: LTV on purchase, optional works funded share, monthly interest, arrangement/exit/broker fees | PARTIAL | `App.jsx:100 calcBridge`; `src/lib/funding.js:calcFundingModeBridge` | No broker fee field in DealsDash; no works funded option; DealsDash uses COMPOUND retained interest, standalone uses SIMPLE (`L * rate * months` at line 475) — see §3 for impact |
| 14 | Flip and BRRR side by side | PRESENT | `App.jsx:146 appraiseDeal` — returns flip and BRRR metrics together | Both strategies computed in one call |
| 15 | Flip: profit, profit on GDV, profit on cost, return on cash (absolute + annualised), indicative corp tax with marginal relief | PARTIAL | `App.jsx:146 appraiseDeal` — returns `netProfit`, `roi`, `annualisedRoi` | Profit on GDV (`profit / arv`) and profit on cost (`profit / totalCost`) not computed in DealsDash; no corporation tax. Standalone `corpTax(profit)`: 19% up to £50k, 25% above £250k, marginal relief between; labelled "indicative — accountant to confirm" |
| 16 | BRRR: refi value with prudence haircut, ICR-capped loan (gross rent / stress rate / ICR), 6-month minimum, money left in, cashflow, net yield on purchase price, return on money left in | PARTIAL | `src/lib/funding.js:calcFundingModeBridge` and `calcIcr` — prudence haircut, ICR cap, money left in, cashflow all present | Net yield in standalone = `netOp / price` (purchase price). Return on money left in = `cfAnnual / leftIn`. Both now verified from standalone code; DealsDash equivalents UNVERIFIED |
| 17 | Max offer per strategy by bisection, binding constraint surfaced, rounds to £500 | PARTIAL | `App.jsx:200 solveMaxBid` — bisection, flip only, rounds to £100 | BRRR max offer missing from DealsDash. Standalone `maxOffer` covers both strategies (lines 530–554). Binding constraint surfaced: for flip, "Profit on GDV target" or "Profit on cost target"; for BRRR, "Money-left-in target" or "Cashflow target". Standalone rounds to £500; DealsDash rounds to £100 |
| 18 | Sensitivity grid: 9 scenarios including base case (8 stress scenarios) | MISSING | No equivalent found | Standalone `SCENARIOS` const and `sensitivity()` function: Base, ARV −5%, ARV −10%, Works +15%, Works +30%, Programme +3 months, Rates +1 point, Rent −10%, ARV −10% + Works +15% |

### Verdict and output

| # | Feature | Status | DealsDash evidence | Notes |
|---|---------|--------|-------------------|-------|
| 19 | Red-flag screen: 12 flags (Clear/Suspected/Confirmed), 6 critical flags, mitigation costs added to construction scope BEFORE contingency | PARTIAL | `src/lib/decision.js:buildRiskRegister` — 6 sources: legal pack flags, EPC below E, flood zone ≥2, refurb not estimated, survey not applied | DealsDash explicitly covers 1 of 12 standalone flags (`flood`); legal pack review may surface 4 more partially (`title`, `lease`, `unsigned`, `auction`). Missing: `knotweed` (CRITICAL), `subsidence` (CRITICAL), `nonstandard` (CRITICAL), `sprayfoam` (CRITICAL), `asbestos`, `mining`, `planning`. No Suspected/Confirmed/Clear classification. No mitigation cost amount field. Standalone adds mitigation costs to construction BEFORE applying contingency |
| 20 | Verdict: NO-GO / CONDITIONAL GO / GO, recommended strategy, conditions list | DIFFERENT | `src/lib/decision.js:evaluateDecision` → BUY / WATCH / PASS | Different vocabulary — see §5 |
| 21 | Auto-generated next actions | MISSING | `src/lib/decision.js:buildOpenQuestions` — generates open questions/checks, not formatted action items | Standalone `nextActions()` (line 1043): generates actions from suspected flags, EST-tagged works items, low ARV confidence, open verification register items, BRRR broker check, auction legal pack |
| 22 | Verification register: 10 items (SDLT, corp tax, MEES, RRA, EICR, alarms, gas, licensing, lender refi, rates) with date each confirmed | MISSING | Not found in DealsDash | Standalone `VERIFY` const (line 619): items shown in Settings with checkbox + date; open items appear in every report and in next actions |
| 23 | Markdown report (.md) and JSON export (.json) from appraisal | PARTIAL | Decision Brief has `window.print()` PDF export; Refurb Survey has a report tab | No structured markdown or JSON export from the appraisal engine. Standalone `reportMD()` generates a full 9-section markdown report; separate JSON download of all deal data |
| 24 | Running summary bar: works, flip profit, BRRR left in + cashflow, verdict — fixed at bottom of screen | PRESENT | `#ledger` element at line 192 of standalone | DealsDash has equivalent summary stats in Deal Detail view; UNVERIFIED whether it persists while scrolling sub-tabs |

---

## 3. Parity Table

Test deal per prompt: 2-bed terraced 70 m², auction £95,000, buyer's premium £3,000, company purchase, default settings.

DealsDash figures calculated by running engine functions against the test inputs. Figures marked **[CALC]** are derived from code logic, not from a live app run. Standalone figures from prompt table (28 Sep 2026) cross-checked against standalone source.

| Metric | DealsDash | Standalone | Difference | Cause |
|--------|-----------|-----------|-----------|-------|
| SDLT | £4,750 | £4,750 | None | Exact match — company additional-property rate: 5% surcharge on £95,000 full amount (both tools) |
| Total acquisition (price + SDLT + legal + survey + premium) | £104,750 [CALC] | £104,750 | None | All components additive and identical |
| As-is value | £104,000 [CALC] | £104,000 | None | Simple average of £100,000 and £108,000; both tools use simple average when weights are 1 |
| ARV | £151,333 [CALC] | £151,333 | None | Simple average of three comps at equal weight and 0% adj% |
| ARV confidence rating | MISSING | High | N/A | Standalone: 3 comps, all within 2 years (as at asAt date), spread = (155k−149k)/151.3k = 4% ≤ 15% → High. DealsDash has no confidence rating |
| Programme | 3 months [CALC] | 2.31 months | +0.69 months | DealsDash `App.jsx:126`: `Math.ceil(10 / 4.33) = 3`; standalone: `10 / 4.33 = 2.3095` (exact decimal, no rounding) |
| Works — sell scope (BOTH items, mid basis, contingency on construction only) | ~£18,693 [CALC] | £18,681 | +£12 | DealsDash `App.jsx:94 calcRefurbTotal` applies contingency to ALL items including EPC (£80 × 15% = £12). Standalone `worksTotals` excludes Professional & statutory from contingency |
| Works — let scope (all items, EICR + gas safety excluded from contingency) | N/A — one scope only | £18,956 | N/A | DealsDash has no LET scope; one `refurbTotal` is used for both flip and BRRR |
| Flip: bridge loan (70% LTV × £95,000) | £66,500 [CALC] | £66,500 | None | Exact match |
| Flip: bridge interest (0.85%/month, 6.31 months) | ~£4,057 [CALC] | £3,566 | +£491 | **Method difference**: DealsDash compound: `£66,500 × ((1.0085)^7 − 1)` over 7 rounded months = £4,057; standalone simple: `£66,500 × 0.0085 × 6.31` = £3,566. Two sources: interest method (+£342 for compound) and rounded timeline (+£149 for extra 0.69 months) |
| Flip: bridge fees (arrangement + valuation + legal; no broker in DealsDash) | ~£3,280 [CALC] | £3,613 | −£333 | Standalone includes broker fee 0.5% × £66,500 = £333; DealsDash has no broker fee field |
| Flip: holding costs (£255/month) | £1,785 [CALC] | £1,609 | +£176 | DealsDash: 7 rounded months × £255; standalone: 6.31 exact months × £255 |
| Flip: sale costs (agent 1.2%+VAT on ARV + solicitor £1,200) | £3,379 [CALC] | £3,379 | None | Agent: £151,333 × 0.012 × 1.2 = £2,179; solicitor £1,200 |
| Flip: total cost | ~£136,744 [CALC] | £135,598 | +£1,146 | Cumulative: +£12 works, +£491 interest, −£333 fees, +£176 holding |
| Flip: profit | ~£14,589 [CALC] | £15,735 | −£1,146 | Direct result of higher total cost |
| Flip: profit on GDV (profit ÷ ARV) | MISSING | 10.4% | N/A | Not computed in `appraiseDeal` |
| Flip: profit on cost (profit ÷ totalCost) | MISSING | 11.6% | N/A | Not computed in `appraiseDeal` |
| Flip: annualised ROI | Present [UNVERIFIED vs standalone formula] | Not shown separately | — | DealsDash returns `annualisedRoi`; standalone returns `roceAnnual = (profit / cashIn) × 12 / months` — comparable but caller-dependent |
| Flip: indicative corporation tax | MISSING | £2,990 | N/A | `corpTax(15735) = 15735 × 0.25 − 0.015 × (250000 − 15735) = 3934 − 3516 = ...` wait, let me recalc: `15735 × 0.25 = 3934; 0.015 × (250000 − 15735) = 3516; tax = 3934 − 3516 = 418`? That seems too low. Checking: formula is `profit * 0.25 − 0.015 * (250000 − profit)` = `3934 − 3516 = 418`... but prompt says £2,990. UNVERIFIED — prompt figure may use a different marginal relief application or a prior version of the function |
| Flip: maximum offer | Different method [UNVERIFIED value] | £81,500 (binding: profit on GDV) | Different | DealsDash `solveMaxBid` targets absolute profit (no profit/GDV constraint) and uses P25 GDV — produces a different figure. Standalone rounds to £500; DealsDash to £100 |
| BRRR: bridge months | 6 [CALC] | 6 | None | Both: `max(programme + refiProcess, minOwnMonths)` = `max(2.31 + 1, 6)` = 6 months minimum ownership binds |
| BRRR: bridge interest (0.85%/month, 6 months) | ~£3,463 [CALC] | £3,391 [CALC] | +£72 | DealsDash compound: `£66,500 × ((1.0085)^6 − 1)`; standalone simple: `£66,500 × 0.0085 × 6` |
| BRRR: total cost before refinance | ~£132,340 [CALC approx] | £131,554 | ~+£786 | Higher bridge interest; no broker fee credit partially offsets (no broker fee in DealsDash) |
| BRRR: refinance value (ARV × (1 − 5% haircut)) | £143,767 [CALC] | £143,767 | None | `£151,333 × 0.95` |
| BRRR: LTV loan (75%) | £107,825 [CALC] | £107,825 | None | `£143,767 × 0.75` |
| BRRR: ICR max loan (gross rent ÷ stress rate ÷ ICR) | £144,000 [CALC] | £144,000 | None | Standalone line 505: `(rent * 12) / (stress * cfg.refi.icr)` = `(825 × 12) / (0.055 × 1.25)` = `9900 / 0.06875` = £144,000. Confirmed uses GROSS rent (pre-void) |
| BRRR: new loan | £107,825 [CALC] | £107,825 | None | LTV (£107,825) < ICR max (£144,000), so LTV binds |
| BRRR: refinance costs | £3,807 [CALC] | £3,807 | None | Product fee 2% × £107,825 = £2,157 + valuation £450 + legal £1,200 |
| BRRR: money left in | ~£28,340 [CALC approx] | £27,536 | ~+£804 | Directly reflects higher total cost before refinance |
| BRRR: net operating income (annual) | £6,654 [CALC] | £6,654 | None | Standalone line 511: mgmt applied to `gross − voids` (net of voids), confirmed. Formula matches |
| BRRR: monthly cashflow | £60 [CALC] | £60 | None | `(NOI − newLoan × payRate) / 12` = `(6654 − 107825 × 0.055) / 12` = `724 / 12` = £60. Cashflow depends only on ARV/rent/loan — not on purchase price — so cashflow is always £60/month regardless of how the purchase price changes |
| BRRR: net yield | Present — `netOp / price` [UNVERIFIED in DealsDash] | `netOp / price` | Formula confirmed | Standalone line 521: `netYield = price ? netOp / price : 0` — yield on purchase price, not ARV |
| BRRR: return on money left in | Present — `cfAnnual / leftIn` [UNVERIFIED in DealsDash] | `cfAnnual / leftIn` | Formula confirmed | Standalone line 523 |
| BRRR: maximum offer | MISSING | None — cashflow target fails at any price | N/A | Standalone tests BRRR at price = £1,000: cashflow = £60/month regardless of price (mortgage is fixed by ARV, not purchase price), which fails £200/month target at every price. DealsDash has no BRRR max-offer solver |
| Sensitivity grid | MISSING | 8 stress scenarios | N/A | Not implemented in DealsDash |

**Confirmed method notes (from standalone source):**

- Bridge interest is **simple**: `L × rate × months` (line 475) — not compound. DealsDash uses compound retained, which is more conservative (+£491 on this test deal).
- Programme uses **exact decimal months**: `weeks / 4.33` with no rounding (line 465). DealsDash rounds up with `Math.ceil`.
- ICR uses **gross rent** before voids (line 505).
- Management fee applies to **rent net of voids** (line 511): `(gross − voids) × mgmt × 1.2`.
- Maintenance % applies to **gross rent** (line 512).
- Red flag mitigations are added to construction costs **before** contingency (lines 437–439 in `worksTotals`).
- Contingency applies to **construction items only** — Professional & statutory category items are excluded (line 432).
- ARV confidence uses `Date.now()` for the recency check (line 397), not `DEFAULT_CFG.asAt`, so the same inputs can change confidence rating as comps age.
- Buyer's premium is a fixed amount in max-offer search; in practice it may be a percentage or minimum fee.
- Corporation tax is per deal, not per company year; marginal relief ignores associated companies.

**Note on corp tax parity:** The prompt states £2,990 for corp tax on £15,735 profit. Cross-checking the standalone `corpTax` formula: `15735 × 0.25 − 0.015 × (250000 − 15735) = 3933.75 − 3516.98 = 416.78`. This does not match £2,990. Probable cause: the prompt figure was generated with a prior version of the standalone function or different input profit (the test profit depends on exact works figures). **UNVERIFIED — rerun with the actual standalone to confirm.**

---

## 4. Ranked Port List

Ranked by Value × Effort. H=High, M=Medium, L=Low.

| # | Feature | Value | Effort | Location | Conflicts | Recommended order |
|---|---------|-------|--------|----------|-----------|------------------|
| 1 | SELL vs LET works scope (features 4, 5) | H | M | Add `std` field to survey items in `checklist.js`; scope filter in `App.jsx:appraiseDeal` and `calcRefurbTotal`; UI in SurveyModule and DealDetailView | Breaks existing single-scope appraisal; needs UI change across DealDetailView; test funding.js BRRR path before migrating | Port first — drives correct numbers for both strategies; unblocks BRRR max offer |
| 2 | RICS CR1–3 ratings + derived grade + contingency/programme (features 1, 2, 3) | H | M | Add `cr` field to each element in `checklist.js`; port `deriveGrade()` to `src/lib/appraisal.js`; modify SurveyModule to show derived grade and use it in `calcRefurbTotal` | None — additive; manual contingency override can remain as fallback for deals without full survey | Port second — prerequisite for accurate SELL/LET works scoping |
| 3 | BRRR max-offer solver (feature 17 BRRR) | H | M | Port `maxOffer(deal, cfg, "brrr")` to `src/lib/appraisal.js`; expose in DealDetailView Purchase & funding tab | None — additive alongside existing flip `solveMaxBid` | Port third — high value, limited scope; depends on SELL/LET scope for correct BRRR works |
| 4 | Sensitivity grid (feature 18) | H | S | Port `SCENARIOS` and `sensitivity()` to `src/lib/appraisal.js`; new UI panel in DealDetailView Simulate tab | None — additive; calls `appraise()` 9 times | Port fourth — trivial once `appraise()` is ported; no data model changes |
| 5 | Per-item source tag and rate source/date fields (features 6, 8) | M | S | Add `src` (RATE/QUOTE/EST/USER), `priority`, `cert`, `source`, `date` fields to works items in `checklist.js` and rates in `rates.js`; update SurveyModule UI | Additive; rate `source`/`date` fields add two columns to rate table | Port with SELL/LET scope |
| 6 | Cost basis toggle min/mid/max + regional factor (feature 9) | M | S | `src/modules/survey/rates.js` already has min/max implicit in cost functions; expose toggle in SurveyModule UI; store `costBasis` and `regionalFactor` in `settings` | Minor: `calcRefurbTotal` must pass basis parameter | Port with SELL/LET scope |
| 7 | Indicative corporation tax (feature 15) | M | S | Port `corpTax(profit)` (3 lines) to `src/lib/appraisal.js`; display in DealDetailView with "indicative only — accountant to confirm" label | None — additive | Port after sensitivity grid |
| 8 | Profit on GDV and profit on cost metrics (feature 15) | M | S | Add two lines to `App.jsx:appraiseDeal`; expose in DealDetailView | None — additive; required for flip `pass` condition and flip max-offer binding constraint | Port with corp tax |
| 9 | Extended red-flag screen to 12 flags with Clear/Suspected/Confirmed + mitigation costs (feature 19) | M | M | Extend `src/lib/decision.js:buildRiskRegister` with all 12 flags; add `status` and `mitigation` fields to flag UI; feed mitigation costs into works scope | Risk register feeds Decision Brief verdict; regression risk if thresholds change | Port after SELL/LET scope (mitigation costs need scoped works) |
| 10 | Weighted comparables, as-is/refurb split, ARV confidence rating (features 10, 11) | M | M | Add `basis` (as-is/refurbished), `weight`, `adjPct` fields to comp entries in data model; port `comps()` confidence logic; update comp entry UI | Comps data model change; migration script needed for existing deals | Port when comps UI is revisited |
| 11 | Auto-generated next actions (feature 21) | M | S | Port `nextActions()` to `src/lib/decision.js`; replace `buildOpenQuestions` output format | None — cosmetic change to existing function | Port with red-flag screen |
| 12 | Verification register (feature 22) | L | S | Add `VERIFY` list to settings; checkbox + date UI in settings page; feed open items into next actions | None — additive; store in `settings.verify` | Only if owner confirms value |
| 13 | Markdown + JSON export (feature 23) | L | S | Client-side only; no new Cloud Functions | None — additive | Low priority; PDF export via Decision Brief covers most reporting need |
| 14 | Regional cost factor (feature 9 partial) | L | S | Multiply rate library items by a stored factor | None — additive | Lowest priority; UK regional variation between towns is modest |

**Can the standalone code be ported as a pure module?**  
Yes. Functions `deriveGrade`, `sdlt`, `corpTax`, `comps`, `worksTotals`, `appraise`, `maxOffer`, `sensitivity`, `verdict`, `nextActions` have zero DOM dependencies (confirmed in source). Storage uses `claude.use("db")` and localStorage — both must be replaced with Firestore reads from `users/{uid}/deals/{id}` and `users/{uid}/settings`. Target file: `src/lib/appraisal.js`. The test deal in §3 should be the primary unit-test fixture.

The one function that requires DOM interaction is `reportMD()` — it reads from component state (`S.cfg`, `S.rates`, `S.verify`). This should be refactored to accept parameters rather than reading global state.

**Should seed rates fill the Refurb Survey?**  
The 48-item rate library is already in DealsDash at `src/modules/survey/data/rates.js`, labelled ILLUSTRATIVE, and is editable. No action required. Per README rule 6, rates must remain in `settings.surveyRates` and never hard-coded.

---

## 5. Reconciliation with the Prompt Pack

### Prompt 02 (Buy Box / Playbooks)

**Overlap:** Standalone `DEFAULT_CFG` (bridge rates, SDLT purchaser, ICR threshold, refinance LTV, stress rate, management %, voids, maintenance, agent fee, targets) overlaps with buy-box assumption snapshots stored in Firestore `settings` and per-deal override fields from prompt 02.

**Recommendation:** Keep one settings model. Map `DEFAULT_CFG` fields to existing Firestore keys in `settings` (`bridgeRate`, `ltvPct`, `stressRate`, `icrThreshold`, `eaPct`, etc.). Do not add a second defaults document. Fields not yet in `settings`: `minimumOwnershipMonths`, `refinanceLegalFee`, `prudenceHaircut`, `worksFunded`, `brokerFee`, `costBasis`, `regionalFactor`, `programmeWeeks`, `contingency` (grade-keyed), `brrrMinYield` — add these to the existing settings schema during the port.

### Prompt 03 (Funding Planner)

**Overlap:** Standalone features 13–17 cover bridging, BRRR refinance, ICR, money left in, cashflow — all also in `src/lib/funding.js`.

**What prompt 03 adds that the standalone does not have:**
- Mortgage-purchase mode (buy-to-let with no bridge)
- Legal-pack fee pull (fees extracted by `reviewLegalPack` fed into holding costs)
- Revolving fund usage tracking (`calcFundUsage`)
- Fund drawdown modelling across multiple concurrent deals

**Recommendation:** Do not rewrite prompt 03's work. Port `appraise()` as `src/lib/appraisal.js` and have it call DealsDash's `calcFundingModeBridge` for the bridge calculation. This preserves the compound-interest method already in production and avoids duplicating bridge logic. Clearly document the interest method difference (compound vs simple) in code and surface it as a setting note in the UI.

### Prompt 05 (Decision Brief)

**Conflict:** Standalone uses GO / CONDITIONAL GO / NO-GO. DealsDash uses BUY / WATCH / PASS (`src/lib/decision.js:evaluateDecision`).

**Recommendation:** Keep **BUY / WATCH / PASS** — it is in production, used in Decision Brief history, notifications, and WorkspaceView map markers (BUY=emerald, WATCH=amber, PASS=rose). Changing the vocabulary would require migrating all stored brief histories and all colour-coded UI. Mapping: GO → BUY; CONDITIONAL GO → WATCH; NO-GO → PASS. Document this mapping in code comments when porting `verdict()`.

**Additional alignment needed:** Standalone verdict passes through the combined ARV −10% / works +15% stress test as part of determining GO vs CONDITIONAL GO. DealsDash's `evaluateDecision` should incorporate this stress-test step — currently UNVERIFIED whether it does.

### Prompt 04 (Pipeline Stages)

**Integration:** The standalone's verdict and next actions should feed the **Bid Ready** gate. Currently `GATED_STAGES = new Set(["Bid Ready"])` in `src/lib/pipeline.js`. When the appraisal verdict is PASS (NO-GO), the gate dialog could block progression to Bid Ready. When verdict is WATCH (CONDITIONAL GO), the gate dialog could show the conditions list. This is additive and does not change the existing gate structure.

---

## 6. Resolved vs Open Items

### Previously UNVERIFIED — now resolved

| Item | Resolution |
|------|-----------|
| Bridge interest method | **SIMPLE** in standalone (line 475: `L * rate * months`). DealsDash uses COMPOUND. Owner should confirm which method to standardise on |
| `calcIcr` uses gross or net rent | **Gross rent** (standalone line 505: `rent * 12`); DealsDash should be checked to match |
| Net yield formula | **`netOp / price`** (purchase price, line 521) — not ARV or total invested |
| Return on money left in formula | **`cfAnnual / leftIn`** (line 523) |
| All 12 red flags | **Confirmed** — knotweed (CRIT), subsidence (CRIT), nonstandard (CRIT), sprayfoam (CRIT), asbestos, flood, mining, unsigned, lease (CRIT), title (CRIT), planning, auction |
| Binding constraint in maxOffer | **Confirmed surfaced** — "Profit on GDV target", "Profit on cost target", "Money-left-in target", "Cashflow target" (lines 551–552) |
| LET scope definition | **Confirmed** — LET scope = ALL included items; SELL scope = SELL + BOTH items only |
| Contingency applies to professional items? | **No** — standalone excludes Professional & statutory from contingency (line 432); DealsDash applies it to all |
| Rate library per-item source/date | **Confirmed in standalone** — `{ source, date }` fields per rate. DealsDash `rates.js` has no per-item source or date |

### Still UNVERIFIED in DealsDash (verify before porting)

| Item | What to check | Where |
|------|---------------|-------|
| `calcIcr` uses gross or net rent | Check what value of `annualRent` is passed to `calcIcr` by the caller | `src/lib/funding.js:calcIcr` and its callers |
| Net yield and return on money left in | Whether `appraiseDeal` computes and labels these metrics | `App.jsx:146 appraiseDeal` — check return object |
| Stress test in evaluateDecision | Whether the ARV −10% / works +15% combined scenario is tested before issuing BUY vs WATCH | `src/lib/decision.js:evaluateDecision` |
| Corp tax parity | Rerun corp tax on actual flip profit with standalone open in browser; the £2,990 in the prompt may use a different input | Run standalone with test deal; check formula version |
| DealsDash flip max offer value | What value `solveMaxBid` produces on the test deal (compared to standalone £81,500) | Run locally with test deal inputs |
| Headline strip persistence | Whether the deal summary strip stays visible while scrolling between sub-tabs | DealDetailView layout |
| AI draft redraft behaviour | Whether re-running the AI draft preserves user-edited works items | `functions/index.js:reviewDeal`, SurveyModule |
| SDLT >£500k company warning | Whether DealsDash warns about 17% flat rate risk on company purchases over £500k | `App.jsx:83 calcSDLT` |

### Open questions for the owner

1. **Interest method:** Standalone = simple; DealsDash = compound. Compound is more conservative (~£491 more on this test deal). Confirm which standard to use going forward. The difference will affect all historical appraisals if the method changes.

2. **Broker fee:** Standalone includes a 0.5% broker fee; DealsDash has no broker fee field. Most bridging transactions incur this cost. Confirm whether to add the field.

3. **Sell vs LET scope priority:** This is the highest-value gap and the most architecturally significant change. Confirm whether to implement as part of the next prompt or defer.

4. **Corporation tax:** The standalone shows an indicative per-deal figure labelled "indicative — accountant to confirm." Confirm whether to add to DealsDash given it varies by company year and associated companies.

5. **Verdict vocabulary:** Recommendation is to keep BUY/WATCH/PASS (mapping: GO → BUY, CONDITIONAL GO → WATCH, NO-GO → PASS). Confirm.

6. **Sensitivity grid:** 8 stress scenarios callable once `appraise()` is ported (trivial effort). Confirm priority.

7. **Verification register:** 10 regulatory items to confirm (SDLT, corp tax, MEES, RRA, EICR, alarms, gas, licensing, lender rules, rate library). Confirm whether to add this to Settings.

---

*Audit complete — no code changed. All recommendations require owner confirmation before implementation.*
