# 02 — Buy Box ("Playbook"): saved strategy + assumptions that flow everywhere

## Goal
Turn the existing Auction Assessment **strategy profile** into one or more saved **buy boxes**. A buy box bundles (a) filters, (b) scenario assumptions and (c) report defaults. Assumptions are set once and flow automatically into every appraisal, the funding planner (03) and the decision brief (05), instead of being re-entered per deal.

Inspired by Estately "Playbooks". DealsDash difference: every assumption is visible, sourced and dated.

## Before you start
- Read the current strategy profile implementation and list every field it holds and where each is consumed.
- List every place in the appraisal engine where an assumption is typed in per deal (e.g. refurb contingency %, bridging rate, void rate, selling costs). These become buy-box defaults.

## Data model
`users/{uid}/buyBoxes/{buyBoxId}`
```js
{
  name: "Rochdale Flip — terraces",
  strategy: "flip" | "brrr" | "hybrid",
  isDefault: true,
  filters: {
    postcodeDistricts: ["OL11","OL12","OL16"],
    propertyTypes: ["terraced","semi-detached"],
    priceMin: 0, priceMax: 0,
    bedroomsMin: 2,
    tenure: ["freehold"],            // leasehold allowed only if leaseYearsMin met
    leaseYearsMin: 90,
    epcMin: null,                    // e.g. "E"
    excludeArticle4: true,
    maxFloodZone: 1
  },
  assumptions: {                     // each item: { value, unit, source, lastVerified, isIllustrative }
    refurbContingencyPct, sellingCostsPct, legalFeesBuy, legalFeesSell,
    bridgeLtvPct, bridgeMonthlyRatePct, bridgeArrangementFeePct, bridgeExitFeePct, bridgeTermMonths,
    worksMonths, marketingMonths,
    refiLtvPct, mortgageRatePct, mortgageProductFeePct, icrStressRatePct, icrThresholdPct,
    voidPct, managementPct, maintenancePct,
    targetProfitOnCostPct, targetProfitMinGBP, targetNetYieldPct, maxMoneyLeftInGBP
  },
  reportDefaults: {
    decisionRules: { buy: {...}, watch: {...} },   // see prompt 05
    includeSections: ["valuation","funding","risks","comparables","openQuestions"]
  },
  updatedAt
}
```
Each assumption object carries `{ value, unit, source, lastVerified, isIllustrative }`. Defaults ship with `isIllustrative: true` and `source: "Placeholder — confirm with broker/mentor"`.

## Behaviour
1. **Buy Box screen** (new tab or within Settings): list, create, duplicate, edit, set default. Edit in a side drawer grouped as Filters / Assumptions / Report defaults, using `NumberField`, `Segmented`, `Note`.
2. **Live match count:** while editing filters, show how many existing leads/deals match (from Firestore summary fields), updating as values change.
3. **Deal binding:** every deal stores `buyBoxId` and a **snapshot** of the assumptions used. Changing the buy box later does **not** silently change old deals; show "Buy box updated since this appraisal — re-apply?" with a diff.
4. **Per-deal override:** any assumption can be overridden on a deal; overridden values show a small "overridden" marker and the buy-box value on hover/tap.
5. **Match check:** lead and deal cards show "Fits buy box" / "Outside buy box: <reasons>" (e.g. "Leasehold 72 yrs < 90").
6. **Migration:** create one default buy box from the current strategy profile values so nothing is lost.

## Editable defaults — no hard-coded figures
All default figures live in Firestore and are edited in the app. Code holds **no numeric business assumptions**.

1. **Defaults document:** `users/{uid}/settings/assumptionDefaults` holds every assumption as `{ value, unit, source, lastVerified, isIllustrative }`. New buy boxes copy from here.
2. **First-run seed only:** a one-off seed file (`src/data/seedDefaults.js`) writes the values below into the defaults document **only if it doesn't exist**. After that the app never reads the seed file again. Label it clearly in code as seed data.
3. **Assumptions screen** (Settings → Assumptions): list every default grouped as Acquisition, Bridging, Refinance/ICR, Rental, Exit, Fund, Decision thresholds. Each row is an editable `NumberField` plus editable source text, a "Mark as verified" button (sets `lastVerified` to today and `isIllustrative: false`), and a Reset-to-seed option with confirmation.
4. **Change history:** each edit writes `settings/assumptionDefaults/history/{id}` with old value, new value, date and note, so you can see when a rate changed and why.
5. **Placeholder counter:** show "N assumptions still placeholders" on the Assumptions screen and dashboard until all are verified.
6. **Fund settings are editable too:** fund size (£50,000), lender rate (8%), term (12 months) and extension cap (3 months) live in this document, not in code.

Seed values (ALL illustrative; owner to replace): bridge LTV 70%, 0.85%/month, arrangement 2%, exit 1%, term 12 months; works 3 months; marketing 3 months; refi LTV 75%; ICR 125% at 5.5% stress (limited company); selling costs 2.5%; contingency 10%; fund £50,000 at 8% for 12 months, extension cap 3 months.

## Acceptance criteria
- Existing strategy profile values preserved as the default buy box.
- New deal appraisal pre-fills from the default buy box; overrides are marked.
- Old deals keep their snapshot until re-applied by the owner.
- Every assumption displays source + last-verified date.
- No numeric business assumption appears in component or calculation code; a search for the seed values (e.g. `0.85`, `50000`) finds them only in `seedDefaults.js` and tests.
- Editing a default on the Assumptions screen changes new appraisals immediately, without a redeploy.

## Out of scope
Alerts (email/WhatsApp) — DealsDash does not index auctions (see prompt 08).
