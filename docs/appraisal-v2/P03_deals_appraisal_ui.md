# P03 — Deals Appraisal UI (v2)

**Read first:** `RULES.md`, `AUDIT_FINDINGS.md`, `DECISIONS.md`, `src/lib/appraisal/` (P01).

## Goal
Surface the v2 engine inside the existing Deals appraisal screen using the VIXIV Design System. The screen should answer, at a glance: **what is my maximum offer, how fragile is this deal, and do I walk away?**

## Layout (top to bottom on the deal screen; reuse existing tabs if present)

1. **Verdict bar** (LiveBar or equivalent): overall walk-away verdict (Pass / Warn / Fail) with the failing test names. Colour from tokens; never colour alone — include the word.
2. **Maximum offer** (Stat): max purchase price, SDLT, and the budget it came from. Toggle Flip / BRRR. Under it, one line: "Stacked on worst-case value £X. Profit target £Y taken first." (or "Accepted cash left in £Z").
3. **Valuation triad** (three NumberFields: Best, Mid, Worst + basis Segmented control, default Worst). Comparables list (address, price, date, type, source link) — add/remove rows. Warn when fewer than 3 comparables.
4. **Cost lines** (Table): each line with amount, basis (quote / estimate / benchmark / illustrative) and source. Blank = "Unknown" badge, not £0. Show a running "Incomplete — N unknown" note when any are null.
5. **Four measures** (Stat row, four separate tiles, never summed): Cash released on refinance · Cash left in · Equity · Net monthly cash flow (before tax). Tooltip: "Refinance money is borrowing, not profit."
6. **Fragility**: break-even valuation and headroom %; for flips, break-even sale price and target sale price.
7. **Stress tests** (Table): the 7 scenarios × key output, with ok/warn/fail per row. Collapsed by default to the worst three rows, expandable.
8. **Walk-away tests** (Item list): the five tests with status and reasons.
9. **v1 comparison** (only when `settings.showV1Comparison`): v1 max bid vs v2 max offer, with the difference.

## Behaviour
- Recalculate live on input (debounced ~250 ms); cache results to `deal.v2.results` with `engineVersion` and `computedAt` on save.
- Every illustrative default shows a small "Illustrative — verify" Note linking to Settings.
- SDLT shows its table `effectiveFrom` and a "Verify at GOV.UK" link.
- Mobile-friendly: single column under 640 px (Paul uses it on site).
- Settings screen: a new "Appraisal thresholds" section editing `settings.appraisal`, each field with an inline explanation.

## Tests
- Component tests for: null cost line renders "Unknown" and blocks Pass; basis toggle changes max offer; four measures render separately.
- Emulator walkthrough: open three real Rochdale deals, record screenshots of each section.
- Re-enter the golden cases as test deals (Flip £180k; BRRR £300k) and confirm the UI shows £110,800 / £200,000 budgets and the split prices from P01.

## Gate
Stop. Provide screenshots (desktop + mobile width), the golden-case UI check, and any UX questions. Update `CHANGELOG.md`. Wait for approval.
