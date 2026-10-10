# DealsDash — National Area Screener: build brief for Claude Code

**Status (3 Oct 2026):** data layer built and verified against live sources. The UI module, scoring, and wiring into `App.jsx` remain to be done in the repo.
**Owner:** Paul (VIXIV LTD). Single-user app.

## 0. Ground rules for this build

- Make targeted edits to existing files (`str_replace`-style). Do not regenerate `App.jsx` wholesale.
- Every new or changed code block gets in-line comments.
- Use the existing VIXIV Design System components (`Table`, `Stat`, `Segmented`, `NumberField`, `Tabs`, `Note`) and tokens. Do not hand-roll equivalents.
- Before declaring done, run the `security-reviewer` subagent (`.claude/agents/security-reviewer.md`) and append its findings and fixes to `SECURITY_LOG.md`.
- Verify against the real `public/data/screener.json`, not mocks. Mocks stay out of the deliverable.
- Ask Paul before zipping or deploying.

## 1. What already exists (delivered with this brief)

| Path | Purpose |
|---|---|
| `scripts/build_screener.py` | Monthly data build (DuckDB + pandas). Writes `public/data/screener.json`. |
| `scripts/requirements-screener.txt` | Python dependencies |
| `public/data/screener.json` | First real build: 360 councils, 4,452 district rows, 0.7 MB |
| `.claude/agents/security-reviewer.md` | Security review subagent |
| `SECURITY_LOG.md` | Running log of security findings and changes |

Add `.screener-cache/` to `.gitignore`. The cache holds about 400 MB of raw downloads.

**Monthly refresh:** `pip install -r scripts/requirements-screener.txt` (once), then `python scripts/build_screener.py`, then `.\update-dealsdash.bat`. Run it after the ONS/HPI mid-month release.

## 2. Data contract (`screener.json`)

```jsonc
{
  "meta": { "built", "hpiThrough", "piprThrough", "piprRelease", "ppdThrough", "notes": [], "licence" },
  "areas": [{            // one per council, whole UK (E06/E07/E08/E09/W06/S12/N09)
    "code", "name", "nation",
    "priceAll",          // HPI average, all types (only price available for NI)
    "priceT", "priceS",  // HPI mix-adjusted terraced / semi price
    "growth12T", "growth12S",  // % 12-month change
    "growth60T",         // % 5-year change, terraced index
    "sales12m", "salesThrough",  // HPI volumes lag ~2 months
    "rentT", "rentS",    // PIPR £ pcm terraced / semi
    "rentGrowth12",      // PIPR % annual change, all types
    "rentSource",        // "LA" | "BRMA:<name>" (Scotland) | null (NI → no BRRR score)
    "yieldT", "yieldS"   // gross yield as a decimal (0.0587 = 5.87%)
  }],
  "districts": [{        // England & Wales only, trailing 24 months
    "outcode", "ptype",  // "T" | "S"
    "la_code",           // joins to areas.code
    "median_price", "sales",       // category A (open-market) sales only
    "flips", "flip_uplift_pct", "flip_gain_gbp"  // repeat sales 3–24 months apart, ≥15% uplift
  }]
}
```

Sanity values from the first build (terraced): Rochdale £171,984, yield 5.87%; Oldham 6.02%; Tameside 6.04%. UK median terraced yield is 5.3%, ranging from 2.2% to 10.1%.

## 3. Module to build: `ScreenerView`

Add it as a new sidebar tab, following the same pattern used for `SourcingView`.

**Controls (all persisted to `users/{uid}/appData/main` → `settings.screener`):**
- **Strategy:** a `Segmented` toggle between Flip and BRRR. Each strategy has its own score; there is no blended score.
- **Property type:** Terraced, Semi, or Both. "Both" takes the better of the two per area.
- **Max entry price:** a `NumberField`, editable, with no hard-coded default beyond a placeholder. Areas whose relevant price is above it are filtered out, not penalised.
- **Nations filter:** England, Wales, Scotland, Northern Ireland.
- **Base location** for the distance factor: a postcode or council chosen from the list. Default to Rochdale (E08000005).
- **Weights panel:** one `NumberField` (0–10) per factor, per strategy, plus a "Reset to defaults" button. Normalise the weights at runtime, so they don't need to sum to anything.

**Scoring (computed in the browser, so editing weights never needs a rebuild):**
1. Convert each factor to a 0–100 percentile rank across the areas that are currently visible. "Lower is better" factors are inverted.
2. Score = Σ(weight × rank) / Σ(weights). Show the score to 0 decimal places.
3. A missing factor is excluded from that area's sum, and the area is flagged as "partial data".

| Factor | Source field | Flip default weight | BRRR default weight |
|---|---|---|---|
| Gross yield | `yieldT`/`yieldS` | 0 | 10 |
| Rent growth | `rentGrowth12` | 0 | 4 |
| Price momentum (12m) | `growth12T`/`growth12S` | 6 | 3 |
| 5-year growth | `growth60T` | 3 | 5 |
| Liquidity | `sales12m` | 6 | 5 |
| Flip evidence | Σ district `flips` ÷ Σ `sales` per council | 8 | 0 |
| Flip uplift | median of district `flip_uplift_pct` | 6 | 0 |
| Distance from base | haversine, lower is better | 4 | 4 |

The default weights are a starting point and are **unvalidated**. Label them that way in the UI.

**Table columns:** rank, council, nation, score, price, yield, 12m growth, sales, flip rate, distance, and a "partial data" badge. The table is sortable on every column.

**Drill-down** (row click, England & Wales only): a district table for that council showing outcode, type, median price, sales, flips, and median uplift and gain. For Scottish and NI rows, show a `Note` explaining why there's no drill-down.

**"Send to Sourcing" action:** add the selected councils and districts to a `targetAreas` array in the Sourcing Pipeline state. This array is used later to filter the AI research pass and EIG searches. Don't change existing lead data.

**Footer:** `meta.notes`, the data-through dates, and the OGL licence line. The licence line is required by the licence.

## 4. Open items (surface these in the UI, don't hide them)

1. **Distance needs council centroids.** Extend `build_screener.py` to add `lat`/`lon` per area from ONS Open Geography local authority district centroids, joined by `code`. Find the current release, curl-test it, and add its host to `ALLOWED_HOSTS`. Until then, hide the distance factor.
2. **Scottish rents are mapped by name.** Councils are mapped to Broad Rental Market Areas by name, not from an official lookup. Moray is the least certain. Replace the mapping with the Scottish Government's BRMA lookup when it's sourced.
3. **Northern Ireland:** PIPR suppresses NI rents, and HPI gives no type-level prices for NI. NI therefore gets a Flip score from `priceAll`, growth and liquidity only, and no BRRR score.
4. **Liquidity favours large councils.** `sales12m` is a raw count. A per-dwelling rate would need ONS dwelling-stock data, which is a candidate for a later build.
5. **Flip evidence is a lower bound.** It only catches flips where both sales fall inside the 33-month Price Paid window (the build loads 3 years). It also can't confirm that a refurb happened. A later step could match against EPC lodgements, using the existing EPC proxy.

## 5. Acceptance checks

- With weights left at defaults, BRRR, Terraced, a £190k cap, and England only, Rochdale, Oldham and Tameside appear with the yields listed in section 2.
- Changing a weight re-ranks the table instantly, with no network calls.
- The Rochdale drill-down shows OL11, OL12 and OL16 with non-zero flip counts.
- No area or district name is rendered through `dangerouslySetInnerHTML`.
- The production build passes, and the `security-reviewer` subagent has run and been logged.
