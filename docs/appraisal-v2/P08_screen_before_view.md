# P08 — Screen Before You View (experimental, off by default)

**Read first:** `RULES.md`, `AUDIT_FINDINGS.md`, P01 engine, P06 construction fields.

## Goal
Reduce wasted viewings by ranking listings on data before Paul leaves the house: estimate worst/mid/best value from Land Registry sold prices of like-for-like houses, run the v2 engine, and rank by how far the asking price sits above the max offer. **Ships behind a feature flag, and stays off until a backtest proves its accuracy.**

## 1. Listing intake (no scraping)
- Manual entry form (address, postcode, asking price, beds, type, link) and **CSV import** (e.g. from EIG exports). Validate and sanitise every CSV field (strip leading `= + - @` to prevent formula injection on later export; enforce numeric types).

## 2. Comparable valuation (`src/lib/screening/comparables.js`)
- Source: existing Land Registry Price Paid / SPARQL integration.
- Match: same postcode sector (widen to district if < 5 results), same property type (T/S/D/F), sold in the last 24 months, optionally same construction/frontage (P06) and EPC floor area ±15% where available.
- Time-adjust prices with a simple local index if one is already available; otherwise none (state which).
- Output: worst = 25th percentile, mid = median, best = 75th percentile, n, date range, and a confidence label (`low` if n < 5).
- Rent: manual or CSV field only in v2 (no rent API assumed).

## 3. Ranking
- For each listing, run `flipMaxOffer` and `brrrMaxOffer` on the comparable triad with default cost assumptions (all marked `benchmark`).
- Score = (max offer − asking) ÷ asking. Show the top 10 with: gap %, strategy that fits best, comparables n, confidence.
- Action buttons: "Book viewing", "Send offer subject to inspection" (opens a template note — no auto-sending), "Dismiss".

## 4. Backtest gate (must pass before the flag can be switched on)
- Take 20–30 **known completed sales** in Rochdale/Oldham/Tameside (Paul supplies addresses or the tool samples from Land Registry), hide each sale, predict its value from comparables sold *before* that date, and record the error.
- Report median absolute % error and the share within ±10%.
- **Enable condition (default, editable):** median absolute error ≤ 7.5% and ≥ 70% within ±10%. If not met, the feature stays off and the report says why (e.g. too few comparables, mixed construction).

## Tests
- Percentile maths, sector widening, CSV sanitisation, backtest harness on a small fixture.

## Gate
Stop. Present the backtest report and the ranking on a sample of current listings. **Paul decides whether to switch the flag on.** Update `CHANGELOG.md`.

*Confidence in this feature's usefulness before backtest: ~80%. That is why it is gated.*
