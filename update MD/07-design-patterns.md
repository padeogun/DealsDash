# 07 — Design Patterns: Badges, Progressive Disclosure, "Unscored" Rule, Attribution Footer

Apply alongside prompts 02–06. Tokens only (VIXIV Design System v1.0); no hard-coded colours.

## 1. Badge / Pill primitive
Create `src/components/Badge.jsx` (candidate to upstream into the design system).
- Variants: `neutral`, `positive`, `caution` (Negotiate gold), `risk` (Brick), `info` (Navy/Ice).
- Sizes: `sm` (cards), `md` (headers). Optional lucide icon. Always includes text (not colour alone) for accessibility; minimum WCAG AA contrast in light and dark.
- Standard badges to implement: `Fits buy box` / `Outside buy box`, `No money left in`, `ICR pass/fail`, `Leasehold <n> yrs`, `Article 4`, `Flood zone <n>`, `IMD <n>/10`, `Relisted ×<n>` (only where source data exists), `EPC <band>`, `Illustrative`.
- A card shows at most 4 badges; overflow collapses to "+n".

## 2. Progressive disclosure on deal and lead views
Order every deal detail view as layers:
1. **Headline strip** — one decisive number for the strategy (Profit for flip / Money left in for BRRR), cash required, recommendation badge (05), 2–4 key badges.
2. **Max offer breakdown** — GDV → costs → max bid → walk-away, as a short `Table`.
3. **Collapsed sections** — Funding (03), Area (06), Legal pack, Refurb survey, Comparables. Collapsed by default on mobile; remember expand state per user in settings.
4. **Full pop-out** — funding planner and survey open in a full-screen panel on mobile.
Target: the decision-relevant answer visible without scrolling on a phone.

## 3. "Unscored rather than guessed"
Global rule: if a metric lacks sufficient data, display `Not available` or `Unscored — <reason>` with a neutral badge. Never substitute a default or an estimate silently. Where an estimate is used deliberately, mark it `Illustrative` with its source. Add a small helper `displayMetric(metric)` that enforces this.

## 4. Assumption labelling
Every value with `isIllustrative: true` shows a subtle marker and a tap/hover note: source + last verified date. A settings page lists all illustrative assumptions still in use ("7 assumptions still placeholders").

## 5. Data source attribution footer
Add a footer (app-wide, and on every brief) naming sources actually used, e.g.:
HM Land Registry (Price Paid Data), MHCLG EPC Register, Environment Agency (flood), Police.uk (crime), MHCLG Indices of Deprivation, postcodes.io / ONS.
Include: "Contains public sector information licensed under the Open Government Licence v3.0." Build it from a config list so sources are added once.

## Acceptance criteria
- Badge used everywhere flags appear; no ad-hoc coloured spans remain.
- Deal view layered as above; headline visible on a 390 px-wide screen without scrolling.
- No silent defaults for missing data (spot-check 5 fields).
- Footer lists sources and the OGL statement.
