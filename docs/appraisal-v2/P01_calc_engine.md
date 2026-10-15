# P01 — Pure Calculation Engine (tests first)

**Read first:** `RULES.md`, `AUDIT_FINDINGS.md`, `DECISIONS.md` (all in `docs/appraisal-v2/`).

## Goal
Build `src/lib/appraisal/` as pure JavaScript functions (no React, no Firebase imports) that reproduce every golden case, plus the stress-test and walk-away evaluators. UI is **not** touched in this phase.

## 0. Test runner
If the audit found no runner and Paul approved Vitest, install `vitest` as a dev dependency and add `"test": "vitest run"` to `package.json`. Tests live in `src/lib/appraisal/__tests__/` and must be excluded from the production bundle.

## 1. Write the golden tests FIRST (they must fail before implementation)

`__tests__/golden.test.js` — use `toBeCloseTo(x, 2)` for money:

| Test | Call | Expected |
| --- | --- | --- |
| Flip purchase+SDLT budget | `flipBudget({ gdv:180000, profitPct:0.15, refurb:25000, legals:3000, saleCosts:200, finance:12000, holding:2000 })` | `110800` |
| Flip price split (company, higher rates) | `splitBudget(110800, { buyer:'company', nation:'ENG' })` | `{ price:105523.81, sdlt:5276.19 }` |
| BRRR budget, £20k left in | `brrrBudget({ endValue:300000, ltv:0.75, acceptedLeftIn:20000, refurb:20000, legals:2000, finance:22500, holding:500 })` | `200000` |
| BRRR budget, all money out | same with `acceptedLeftIn:0` | `180000` |
| BRRR price split | `splitBudget(200000, { buyer:'company', nation:'ENG' })` | `{ price:189252.34, sdlt:10747.66 }` |
| Bridge day-one release | `bridgeRelease({ gross:75000, monthlyRate:0.01, termMonths:12, interestMode:'retained', entryFeePct:0.01, exitFeePct:0.01, exitFeeTiming:'start', brokerFee:500, valuationFee:650 })` | `63350` |
| Katie break-even | `breakEvenValuation({ totalCost:201500, ltv:0.75, refiFees:0, acceptedLeftIn:0 })` | `268666.67` |
| Katie headroom | `headroomPct(270000, 268666.67)` | `≈ 0.0049` |
| Katie sensitivity | `refiPosition({ value:v, ltv:0.75, totalCost:201500 })` for 280k…240k | `8500, 1000, -6500, -14000, -21500` |
| Sean surplus | `refiPosition({ value:85000, ltv:0.75, totalCost:51500 })` | `12250` |
| Null propagation | `flipBudget({ ...flip, legals:null })` | `{ status:'incomplete', missing:['legals'] }` |
| Nation guard | `sdlt(150000, { nation:'SCT' })` | `{ status:'unsupported', reason:'LBTT not implemented' }` |
| FTB guard | `sdlt(150000, { buyer:'individual', firstTimeBuyer:true })` | relief **not** applied; returns a `warning` |

## 2. Modules and formulas

Every function: JSDoc + inline comments stating the formula in words.

- **`costs.js`** — `CostLine { key, label, amount: number|null, basis: 'quote'|'estimate'|'benchmark'|'illustrative', source? }`. `sumCosts(lines)` returns `{ total, status:'complete'|'incomplete', missing:[] }`.
- **`valuation.js`** — `{ best, mid, worst, basis:'worst'|'mid'|'best', comparables:[{address, price, date, type, source}] }`. `basisValue(v)` returns the chosen value (default worst). If only one value is entered, set all three to it and flag `singlePoint:true`.
- **`sdlt.js`** — data-driven bands: `SDLT_TABLES = [{ id, nation:'ENG', effectiveFrom:'2025-04-01', verifyAt:'https://www.gov.uk/stamp-duty-land-tax/residential-property-rates', standard:[...], higherRatesSurcharge:0.05, ... }]`. Higher rates apply to companies and additional dwellings. Use bands as at June 2026 (standard 0% to £125k, 2% to £250k, 5% to £925k, 10% to £1.5m, 12% above; surcharge +5%; purchases under £40k exempt from the surcharge) and **mark the table "verify at GOV.UK before use"**. Mixed-use/non-residential band table included but flagged. Scotland/Wales → `unsupported`.
- **`solve.js`** — `maxPrice(constraintFn, { lo, hi, tol:1 })` by bisection. **Wrap the existing solver if the audit shows it is equivalent; otherwise implement here and have the old one call it.** `splitBudget(budget, buyer)` = max price P where `P + sdlt(P) ≤ budget`.
- **`flip.js`**
  - `flipBudget` = GDV_basis − profit − refurb − legals(buy+sell) − saleCosts − finance − holding. Profit = `profitPct × GDV_basis` or a fixed £ if given.
  - `flipMaxOffer(deal)` = `splitBudget(flipBudget)` — but if finance or fees depend on price (e.g. bridge % of loan, loan as % of price), solve directly with `maxPrice` on the constraint `profit(P) ≥ target`.
  - `flipBreakEvenSale(deal, P)` = sale price where profit = 0, and `flipTargetSale` where profit = target.
- **`brrr.js`**
  - `totalProjectCost(P)` = P + SDLT(P) + legals + refurb + finance costs (interest + fees, **not** loan principal) + holding + other.
  - `grossRefi` = value_basis × LTV; `netRefi` = grossRefi − refinance fees.
  - `cashLeftIn(P)` = totalProjectCost(P) − netRefi. (Negative = cash surplus out.)
  - `brrrBudget` = netRefi + acceptedLeftIn − (refurb + legals + finance + holding + other) → purchase+SDLT budget.
  - `brrrMaxOffer` = max P with `cashLeftIn(P) ≤ acceptedLeftIn`.
  - `breakEvenValuation` = (totalCost + refiFees − acceptedLeftIn) / LTV. `headroomPct` = (value − breakEven) / value.
  - `refiPosition` = value × LTV − totalCost (simple gross comparison, labelled as such).
- **`bridging.js`** — inputs: gross, monthlyRate, termMonths, interestMode `retained|rolled|serviced`, entry/exit fee % and timing (`start|redemption`), broker, valuation, lender legal, admin, `refundUnusedRetained` boolean, extensionRate. Outputs: `dayOneRelease`, `totalCostAt(month)`, `redemptionAt(month)`, `extensionCostPerMonth`, `monthlyServicing`.
- **`capital.js`** — private loan (default 8% simple, 12-month bullet): `capitalCost(allocated, months, rate)`. `recycling(pool, deals)` → deployed, returned, idle, turns/year, projected balance at term end, overrun flag vs extension cap (default 3 months).
- **`cashflow.js`** — `netMonthly = rent − mortgage − rent×(mgmt+maint+voids) − insurance − other`. `icrPass = rent ≥ icr × loan × stressRate / 12`. Mortgage supports interest-only and repayment.
- **`stress.js`** — 7 scenarios, all parameters from settings with illustrative defaults:
  1. Valuation −5%, −10%, −15%
  2. LTV lowered (default 70%)
  3. Refurb +10%, +20%
  4. Rent −5%, −10%
  5. Void: N months with no rent (default 2)
  6. Rate +2 percentage points at refinance
  7. Delayed exit: +3 months of finance and holding
  Output per scenario: flip profit **or** BRRR cash left in, net monthly cash flow, ICR pass, bridge-redemption covered (yes/no), and `severity: ok|warn|fail`.
- **`walkaway.js`** — five tests, each `{ id, status:'pass'|'warn'|'fail', reasons:[] }`:
  1. **Value** — basis is worst; ≥ 3 comparables recorded (else warn); single-point value → warn.
  2. **Costs** — no `null` cost lines (any null → fail, list them).
  3. **Refinance** — lender route recorded; headroom ≥ threshold (default 5%) else warn; < 0 → fail.
  4. **Cash flow** — net monthly ≥ minimum (default £150) and ICR passes.
  5. **Resilience** — under −10% value AND +10% refurb AND +3 months delay, bridge still repaid from refinance + declared cash reserve, and flip profit ≥ 0.
  Overall verdict = worst of the five. Every threshold read from settings.

## 3. Additional tests
- Each formula: one hand-checked case + edge cases (zero LTV, negative headroom, SDLT band boundaries at £125,000/£250,000/£40,000).
- Property test: `splitBudget(b).price + sdlt(price) ≤ b` and within £1 of b, for 200 random budgets.
- Walk-away: one fixture per status (pass/warn/fail) per test.

## Gate
Stop. Show: `npm test` output (all green), a table of every golden case with expected vs actual, coverage for `src/lib/appraisal/`, and any place where the **existing** engine disagrees with v2 (with the numbers). Ask Paul which to trust before P02. Update `CHANGELOG.md`.
