# P04 — Funding Sources, Bridging Calculator and Capital Recycling

**Read first:** `RULES.md`, `DECISIONS.md`, `src/lib/appraisal/bridging.js` and `capital.js`.

## Goal
Model how each deal is funded, show the real cash a bridge releases, cost the £50k family-and-friends capital per deal, and track how fast that capital recycles in the Business Planner.

## 1. Funding sources on a deal
Under the deal's appraisal, a "Funding" panel where Paul adds one or more sources:

| Type | Fields | Feeds |
| --- | --- | --- |
| Bridge | gross, monthly rate, term, interest mode (retained/rolled/serviced), entry & exit fee % + timing, broker, valuation, lender legal, admin, refund-unused-retained, extension rate | finance cost line; day-one release |
| Buy-to-let mortgage (purchase) | LTV, rate, product fee, interest-only/repayment | finance cost; monthly mortgage |
| Private loan (family & friends pool) | amount allocated, rate (default 8%), months | finance cost line via `capitalCost` |
| Cash | amount | — |
| Joint venture | partner, contribution, profit share % | profit split shown separately |

The finance cost line in the appraisal is **computed** from these sources (marked basis `computed`), replacing a manual figure only when Paul switches it on.

## 2. Bridging calculator panel
- Outputs: **Day-one release**, shortfall vs purchase + SDLT + fees (cash Paul must bring), redemption amount at planned exit month, cost of each extra month, and a mini table of redemption at months 6 / 9 / 12 / 15.
- Warning when day-one release < required completion funds.
- Golden check in UI: £75k, 1%/month retained ×12, 1%/1% at start, broker £500, valuation £650 → **£63,350**.
- Note shown: "Daniel's actual quote was £850/month; the classroom example used 1% (£750). Always use the lender's own illustration."
- "Add to AIP checklist" button: copies the inputs and the release figure into the existing Bridging Finance Brief/notes area if one exists (ask Paul where that lives).

## 3. Capital recycling tracker (Business Planner)
- Pool: £50,000 (from settings), rate 8% simple, 12-month bullet, 3-month extension cap.
- Allocations list: deal, amount, date out, expected return date (from deal plan), actual return date, cash left in at refinance/sale.
- Outputs: deployed now, idle now, cumulative interest accrued, turns so far, projected turns by term end, **projected ability to repay principal + interest at term end**, overrun flag if any deal's return falls beyond term + extension cap.
- Chart (if a chart component exists; otherwise a table): capital deployed vs idle by month.
- Label: "Projection — illustrative, depends on deal exits".

## Tests
- Unit tests already in P01 for maths; add integration tests: funding sources → finance cost line → appraisal max offer changes accordingly.
- Recycling fixture: two sequential deals of £45k each; second returns 2 months after term → overrun flag on.

## Gate
Stop. Screenshots of the funding panel, bridging panel with the golden figure, and the planner tracker. Update `CHANGELOG.md`. Wait for approval.
