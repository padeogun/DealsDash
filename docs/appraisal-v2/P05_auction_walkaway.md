# P05 — Auction Assessment on the v2 Engine

**Read first:** `RULES.md`, `AUDIT_FINDINGS.md` (Auction Assessment and solver sections), `src/lib/appraisal/`.

## Goal
Make Auction Assessment use the same engine as Deals, so a lead that passes the 8 gating questions gets a v2 max bid and a walk-away verdict before Paul registers to bid.

## Steps
1. **Solver.** Point the existing max-bid bisection solver at `src/lib/appraisal/solve.js` (or have v2 wrap it, per the P01 decision). Auction-specific costs stay in: buyer's premium, auction admin fee, legal pack fees extracted by Legal Pack Review, and the 28-day completion finance assumption. Keep the existing strategy profile.
2. **Legal pack → cost lines.** Map the structured fees Legal Pack Review already extracts into `deal.v2.costLines` with basis `quote` and the source "Legal pack (page X)". Unmapped fees appear as `null` lines for Paul to confirm — never dropped.
3. **Flow.** After the 8 gating questions: valuation triad → cost lines (pre-filled) → funding (bridge default for auction) → max bid → stress tests → **walk-away verdict**. A "Fail" shows the reasons and hides the "Ready to bid" action until Paul overrides with a typed reason (stored on the deal).
4. **Bid sheet.** One printable/mobile summary: max bid, walk-away bid (break-even), verdict, top 3 risks, day-one bridge release, and the AIP status.
5. **Bridging AIP gate.** If no bridge AIP is recorded on the deal, show a warning on the bid sheet ("Agreement in Principle not recorded").

## Tests
- Golden: an auction lead set up as the Daniel flip (GDV £180k, etc.) with zero auction fees must give the same £105,523.81 max price as Deals.
- Adding a £1,500 buyer's premium must lower the max bid by about £1,500 / 1.05 (higher-rates SDLT at 5%) — assert within £2.
- Legal pack fixture with three fees, one unmappable → two quote lines + one null line.

## Gate
Stop. Run one real auction lead end to end on the emulator and show the bid sheet. Update `CHANGELOG.md`. Wait for approval.
