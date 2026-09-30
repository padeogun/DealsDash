# 03 — Funding Planner (cash / bridging / mortgage) with "Money Left In" headline

## Goal
Add a Funding Planner to every deal appraisal that models how the deal cash-flows under three funding modes and headlines **cash left in the deal after refinance**, plus an **ICR stress test**. Add a VIXIV-specific layer: how much of the **£50k revolving lender fund** the deal ties up, and for how long.

Inspired by Estately's funding planner. DealsDash differences: fees come from the deal's own legal pack extraction, and the fund-usage view.

## Before you start
- Find the existing SDLT calculation (if any) and the legal pack fee extraction output schema. Reuse both — do not re-implement.
- Confirm where purchase price, GDV/end value, refurb budget and rent live in the appraisal.

## Inputs (pre-filled from buy box (02), overridable per deal)
Purchase price; GDV (post-works value); refurb budget (from Refurb Survey if attached, else appraisal); monthly rent (BRRR); SDLT (existing function); buyer's premium, seller's legal costs and other pack fees (from Legal Pack Review extraction — list each with its source clause); legal fees; survey/valuation; bridging terms (LTV, monthly rate, arrangement %, exit %, term, interest retained vs serviced); works months; marketing/sale months; refinance LTV, mortgage rate, product fee; ICR stress rate and threshold; selling costs %.

## Modes and calculations
Write all maths as pure functions in `src/lib/funding.js` with unit tests (Vitest if present; otherwise propose). Every output returns `{ value, formula, inputsUsed }` so the decision brief can show an audit trail.

**Cash purchase**
- Total cash in = price + SDLT + pack fees + legal + survey + refurb + holding costs.

**Bridging**
- Bridge loan = bridgeLtv × purchase price (allow toggle: % of purchase or of valuation).
- Arrangement fee = % × loan; exit fee = % × loan.
- Interest = loan × monthly rate × months held (works + marketing or refinance lead time); retained interest adds to the loan, serviced interest adds to monthly cash out — support both.
- Cash in = (price − bridge loan) + SDLT + fees + refurb + arrangement fee (if not added to loan) + serviced interest.
- **Flip exit:** net sale = GDV × (1 − selling costs%); profit = net sale − bridge redemption (loan + retained interest + exit fee) − cash in.
- **BRRR exit:** refi loan = refiLtv × GDV; after redeeming the bridge, **money left in = max(0, cash in − (refi loan − bridge redemption − mortgage product fee))**; if refi loan exceeds all costs show "cash released".

**Mortgage (purchase with BTL mortgage)**
- Loan = LTV × price; cash in = deposit + SDLT + fees + refurb.

**ICR stress test (BRRR / mortgage)**
- ICR = annual rent ÷ (loan × stress rate). Pass/fail at the buy-box threshold (default 125%, illustrative) and show the 145% line for reference. Show the maximum loan the rent supports at that ICR and whether it limits the refinance.

**Fund usage (VIXIV layer)**
- Input: amount of the £50k fund allocated to this deal (default = cash in, capped at fund available).
- Days tied up = purchase date → expected exit/refinance date (from pipeline dates or assumptions).
- Fund cost to this deal = allocation × 8% × days ÷ 365 (8% and £50k are settings, not hard-coded).
- Headline: "Ties up £X of the fund for N days (cost £Y)". Warn if expected exit exceeds the 12-month term or would need the 3-month extension.

## UI (progressive disclosure — see 07)
1. **Headline strip** (`Stat`): Money left in (or Profit for flip) · Cash required · ICR pass/fail badge · Fund tied up (days).
2. Badge "No money left in" when money left in = 0.
3. Collapsed "Funding" section → `Segmented` Cash / Bridging / Mortgage → sliders + `NumberField`s → itemised cost `Table` with each line's source (buy box, legal pack clause, survey, manual).
4. Warning `Note`s when an input differs from the deal's own data (e.g. slider refurb ≠ survey total) or when assumptions are illustrative.
5. Side-by-side compare Flip vs BRRR exit for the same deal (two columns).

## Regulatory / accuracy flags (must appear in UI)
- SDLT: show the rate table used, its effective date and "Verify current rates with HMRC before relying on this."
- Lender criteria (LTV, ICR, stress rate) vary by lender: "Illustrative — confirm with your broker."
- Not financial advice; not a lending offer.

## Verification
- Unit tests covering: zero-refurb, retained vs serviced interest, BRRR full release, BRRR money left in, ICR fail limiting refi, fund term overrun warning.
- Hand-check one worked example in the summary with every line shown.

## Acceptance criteria
- All three modes calculate; totals reconcile line-by-line in the table.
- Pack fees pulled automatically when a legal pack review exists, each with its clause reference.
- Fund usage shows days, cost and term-overrun warning.
- No hard-coded rates outside the buy box/settings.
