# P06 — Refurb Survey Benchmarks and Construction-Type Flags

**Read first:** `RULES.md`, `AUDIT_FINDINGS.md` (Refurb Survey, EPC, Area Intelligence sections).

## Goal
Feed two training lessons into existing modules: (1) cheap kerb-appeal work and the "£1 spent should add £3" test in the Refurb Survey; (2) construction type at street level, because non-standard construction can value about £20k lower on the same street (Bootle, Norton Street: bay-fronted £120k vs flat-fronted non-standard £100k).

## 1. Refurb Survey — kerb appeal and BRRR spec
- Add a "Kerb appeal" group to the benchmark items, every rate tagged **Illustrative — training figures, replace with mentor rates**:
  | Item | Benchmark |
  | --- | --- |
  | Paint exterior | £400–£800 (size dependent) |
  | Composite front door uplift vs standard | ~£200 |
  | Clean existing double glazing | minimal |
  | Clear weeds / tidy frontage | minimal |
  | Roof, terraced (context only) | Stoke ~£5,000; Liverpool £5,500–£7,000; London £10,000+ |
- Add a "BRRR spec" toggle: when on, flag items exceeding a rental finish (e.g. underfloor heating, premium flooring, staging/furniture) with "Rental spec: tenants won't pay for this".
- **Value-add check** per work item (optional field "expected value uplift"): show uplift ÷ cost; below 3.0 gets "Below £1→£3 rule of thumb (illustrative)". Never block, only flag.
- Keep the existing tap-to-confirm-on-site pattern for anything pre-filled.

## 2. Construction-type flags from EPC
- From the EPC data already fetched, read `walls-description`, `built-form`, `property-type`, `construction-age-band` (confirm exact field names against a **live** Rochdale EPC response via the existing proxy — do not trust older docs).
- Derive `construction.suggestedNonStandard = true` when walls description contains (case-insensitive) any of: "system built", "timber frame", "park home", "cob", "granite or whinstone" (treat as review), "prefab". Show as a **suggestion** with the EPC text quoted; Paul confirms.
- Manual fields: frontage `bay | flat | other`, construction `standard | non-standard | unknown`, notes.
- On a deal, show a warning when non-standard is confirmed: "Non-standard construction: lender appetite and valuation may be lower. Check comparables of the same build."
- Comparables (from P03) gain the same `construction` and `frontage` fields so like-for-like comparisons are possible.

## 3. Area Intelligence — street notes
- Add a lightweight "Street notes" record (street + postcode sector → construction mix, frontage mix, good/avoid end, notes). Used to build Paul's street-by-street map of Rochdale, Oldham and Tameside over time.
- Keep it small: text + enums only (document-size guard from P02 applies).

## Tests
- Unit: keyword detection on 10 real EPC `walls-description` strings fetched from the proxy for Rochdale postcodes (save the strings as test fixtures — fixtures stay out of the build).
- UI: uplift ratio flag appears below 3.0.

## Gate
Stop. Show the Rochdale EPC sample with suggested flags, and the Refurb Survey kerb-appeal group. Update `CHANGELOG.md`. Wait for approval.
