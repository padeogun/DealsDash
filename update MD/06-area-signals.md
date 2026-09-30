# 06 — Area Signals: IMD Deprivation Decile + Price Momentum Pills

## Goal
Add two quick-read area signals to every lead/deal, shown as colour-banded pills beside the existing crime and flood data:
1. **IMD decile** (Index of Multiple Deprivation) for the property's LSOA — a strong sense-check for voids, possession risk and lender appetite.
2. **Price momentum**: postcode-district median sold price, year-on-year change and a 10-year sparkline by property type, from HM Land Registry Price Paid Data.

## Before you start
- **Check for the latest English Indices of Deprivation release** on gov.uk (a release newer than 2019 may exist). Use the latest; record release year in the data and UI.
- Curl-test postcodes.io for a Rochdale postcode and confirm it returns the LSOA code field used by the chosen IMD release (LSOA boundaries changed between 2011 and 2021 — match the release).
- Review the existing Land Registry Price Paid / SPARQL code and reuse it.

## IMD implementation
- Download the official file (LSOA code → IMD decile). Ship a compact JSON limited to target local authorities first (Rochdale, Oldham, Tameside, Kirklees, Calderdale), with a script `scripts/build-imd.js` to regenerate or expand to all of England.
- Lookup: postcode → postcodes.io → LSOA code → decile. Cache on the lead/deal document (`area.imd = { decile, lsoa, release }`).
- Pill: "IMD 3/10" colour-banded (decile 1–3 brick/red tint, 4–7 neutral/gold, 8–10 green tint — token-based). Tooltip/tap text: "1 = most deprived 10% in England. Release: <year>."
- Wales/Scotland: show "IMD not available for this nation" rather than guessing.

## Price momentum implementation
- For each postcode district in the buy box plus any district with a lead/deal: compute from Price Paid Data by property type — median sold price over last 12 months, YoY % change vs prior 12 months, annual medians for 10 years, transaction count.
- Run in a scheduled Cloud Function **monthly** (Land Registry updates monthly) and store in `users/{uid}/marketStats/{district}` (or a shared collection if the owner prefers). Do not query SPARQL on every page view.
- **Momentum decile:** rank YoY change across the districts DealsDash tracks and label it clearly as "relative to your tracked areas", not national.
- Pill: "OL11 terraced £128k +4.2% YoY". Detail view: sparkline (use a lightweight existing chart lib if present; otherwise propose `recharts`) and transaction count; warn "Low volume — treat with caution" when fewer than 10 sales in 12 months.
- Attribution: "Contains HM Land Registry data © Crown copyright and database right. Licensed under the Open Government Licence v3.0."

## Verification
- Test with real postcodes in OL11, OL12, OL16, OL1 (Oldham), SK15 (Tameside); report deciles and medians in the summary.
- Compare one district's median against a manual Land Registry search.

## Acceptance criteria
- Both pills render on lead cards, deal pages and the decision brief risk register.
- No SPARQL call on page load; data refreshes monthly.
- Release year and data sources displayed.
- Missing data shows "Not available" (see 07 "unscored" rule), never a guessed value.
