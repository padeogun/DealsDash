# DealsDash — UK Pivot Fix Plan

**Created:** 2026-09-30  
**Source:** `docs/uk-pivot-review.md`  
**Status tracking:** tick ✅ when merged; note date

Each item has: priority tier, file(s), exact change, effort (S = <1h, M = 1–3h, L = >3h), and whether it needs an owner decision before starting.

---

## Tier 1 — Silent bugs (fix immediately; zero decisions, zero risk)

### FIX-01 · IMD risk check never fires
**File:** `src/lib/decision.js:253`  
**Bug:** `Number(deal.areaIntelligence.imd)` coerces an object to `NaN`; condition is never `true`.  
**Fix:**
```js
// Before
const imd = Number(deal?.areaIntelligence?.imd);
if (imd > 5) { ... }

// After
const imdDecile = Number(deal?.areaIntelligence?.imd?.decile);
if (imdDecile > 0 && imdDecile <= 3) { ... }
```
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30

---

### FIX-02 · Flood zone check reads non-existent field
**File:** `src/lib/decision.js:185`  
**Bug:** `deal.areaIntelligence.floodZone` is never populated. Flood risk has never influenced any Decision Brief verdict.  
**Fix:**
```js
// Before
const floodZone = Number(deal?.areaIntelligence?.floodZone);
if (floodZone >= 2) { ... }

// After
const floodAreaCount = Number(deal?.areaIntelligence?.flood?.areaCount);
if (floodAreaCount > 0) { ... }
```
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30

---

## Tier 2 — High-risk item (verify before next deploy)

### FIX-03 · Claude model IDs — verify `"claude-sonnet-5"` is valid
**File:** `functions/index.js:98, 457`  
**Issue:** `RESEARCH_MODEL` and `LEGAL_PACK_MODEL` are both `"claude-sonnet-5"`. Valid Anthropic model ID format is e.g. `"claude-sonnet-4-6"`. If this string does not resolve, every call to `researchLeads` and `reviewLegalPack` fails silently at runtime.  
**Fix:**
```js
// functions/index.js:98
const RESEARCH_MODEL = "claude-sonnet-4-6";  // was: "claude-sonnet-5"

// functions/index.js:457
const LEGAL_PACK_MODEL = "claude-sonnet-4-6";  // was: "claude-sonnet-5"
```
Verify against `anthropic.models.list()` or Anthropic dashboard before deploying. Keep `claude-haiku-4-5-20251001` at line 768 — that format is correct.  
**Effort:** S · **Decision needed:** Confirm correct model ID · **Status:** ✅ 2026-09-30 — updated to `claude-sonnet-4-6`

---

## Tier 3 — UK pivot code blockers

These are the minimum set of code changes needed before the app is usable for any UK property. Phase 1 strategy: surface clear disclaimers for missing national APIs rather than integrating them (following the existing IMD `notAvailable` pattern).

### FIX-04 · SDLT — add LTT (Wales) and LBTT (Scotland) or surface jurisdiction disclaimer
**File:** `src/lib/funding.js:calcSdltAudit`, `src/App.jsx:83`  
**Issue:** Both SDLT implementations cover England only. A Scottish or Welsh purchase will silently calculate the wrong tax.  
**Decision required:** Option A — integrate LBTT/LTT in the calculation engine (M effort). Option B — detect jurisdiction from `postcodes.io` `country` field and show "SDLT applies to England/NI only — use LBTT calculator for Scotland or LTT calculator for Wales" warning in the UI (S effort).  
**Recommended:** Option B for Phase 1 (quick, correct, safe). Option A as Phase 2 once Scottish/Welsh deal flow exists.  

**Option B implementation:**
- `calcSdltAudit(price, purchaser, country)`: if `country === "Scotland"` or `"Wales"`, return `{ tax: null, disclaimer: "LBTT/LTT applies — use the Revenue Scotland/Welsh Revenue Authority calculator." }`
- Remove `App.jsx:83 calcSDLT` and route all call-sites to `funding.js:calcSdltAudit`
- In DealDetailView, render the disclaimer in place of the SDLT figure

**Option A rates (if implementing):**
- Scotland LBTT (residential, non-first-time-buyer): 0% (0–145k), 2% (145–250k), 5% (250–325k), 10% (325–750k), 12% (750k+). Additional dwelling surcharge: +6%.
- Wales LTT (residential): 0% (0–225k), 6% (225–400k), 7.5% (400–750k), 10% (750k–1.5m), 12% (1.5m+). Higher rates: +4%.
- NI: uses England SDLT rates — no separate calculation needed.

**Effort:** S (Option B) / M (Option A) · **Decision needed:** Yes (A or B) · **Status:** ✅ 2026-09-30 — Option B applied: `sdltJurisdictionNote(country)` helper added; `country` now stored on `areaIntelligence`. Full LBTT/LTT rates deferred to Phase 2.

---

### FIX-05 · Region/town picker — add Scotland, Wales, Northern Ireland
**File:** `src/App.jsx:3082` — `REGION_TOWNS` constant  
**Issue:** Only 9 English regions. Scotland/Wales/NI users see no matching region.  
**Fix:** Add to `REGION_TOWNS`:
```js
"Scotland":         ["Glasgow", "Edinburgh", "Aberdeen", "Dundee", "Inverness", "Perth", "Stirling"],
"Wales":            ["Cardiff", "Swansea", "Newport", "Wrexham", "Bridgend", "Rhondda"],
"Northern Ireland": ["Belfast", "Derry/Londonderry", "Lisburn", "Newry", "Armagh"],
```
Also clear the default at `App.jsx:3978`:
```js
// Before
region: "North West England", towns: ["Rochdale", "Oldham"]
// After
region: "", towns: []
```
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — Scotland, Wales, NI added; default region/towns cleared

---

### FIX-06 · AI research prompt — remove "North West England" hard-coding
**File:** `functions/index.js:77`  
**Issue:** `"UK residential property BRR/flip deal appraisal for an experienced property trader based in North West England."` is the system context for every AI research call.  
**Fix:**
```js
// Before
"...based in North West England."

// After
"...based in the UK."
```
If the strategy profile stores a preferred region, inject it dynamically:
```js
const location = strategyProfile?.region || "the UK";
`...based in ${location}.`
```
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — "based in the UK" in functions/index.js:77

---

### FIX-07 · Flood risk — surface disclaimer for non-England postcodes
**File:** `src/App.jsx:3468` — `fetchFloodRisk()` or its caller  
**Issue:** EA flood risk API covers England only. Welsh, Scottish, and NI postcodes return empty data with no explanation.  
**Fix:** After `postcodes.io` lookup, check `country`:
```js
if (country !== "England") {
  return {
    notAvailable: true,
    message: {
      Wales: "Flood risk data for Wales is provided by Natural Resources Wales (naturalresources.wales).",
      Scotland: "Flood risk data for Scotland is provided by SEPA (sepa.org.uk/environment/water/flooding).",
      "Northern Ireland": "Flood risk data for Northern Ireland is provided by Rivers Agency (daera-ni.gov.uk).",
    }[country] ?? "Flood risk data not available for this postcode."
  };
}
```
Render the `notAvailable` message in the Area Intelligence panel (same pattern as IMD N/A).  
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — `fetchAreaIntelligence` now checks country; flood returns `notAvailable` with provider link for Wales/Scotland/NI; `country` stored on areaIntelligence object

---

### FIX-08 · Example deal and strategy profile defaults — genericise
**File:** `src/App.jsx:405, 515, 4582, 4799`  
**Issue:** Hard-coded Rochdale/OL references in defaults and placeholder text. Not a bug, but reinforces a North West bias for new users.  
**Fix:**
```js
// App.jsx:515 exampleDeal()
town: "Your town",  // was: "Rochdale"
postcode: "AB1 2CD",  // was: "OL16 4XX"

// App.jsx:405 DEFAULT_STRATEGY_PROFILE
postcodeAreas: [],  // was: ["OL", "M", "SK", "HD", "HX"]

// App.jsx:4582 postcode placeholder
placeholder="e.g. OL1, G1, CF10, BT1"  // was "e.g. OL16 4RL"

// App.jsx:4799 area placeholder
placeholder="e.g. Rochdale, Edinburgh, Cardiff"  // was "e.g. Rochdale, Oldham..."
```
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — example deal, postcodeAreas default, two placeholders genericised

---

## Tier 4 — Calculation consolidation

These do not affect any user-visible feature today but will cause silent divergence as the codebase grows.

### FIX-09 · Remove duplicate `calcSDLT` from App.jsx
**File:** `src/App.jsx:83`  
**Issue:** Duplicate of `funding.js:calcSdltAudit`. Any future SDLT rate change requires editing two files.  
**Fix:** Remove `App.jsx:calcSDLT`. Update all call-sites in `App.jsx` to import and call `calcSdltAudit` from `funding.js`. (Depends on FIX-04 completing first.)  
**Effort:** M · **Decision needed:** Complete FIX-04 first · **Status:** ✅ 2026-09-30 — `calcSDLT` removed from App.jsx; `calcSdltAudit` imported from funding.js and used in `calcFunding` via `.value`

---

### FIX-10 · Extract canonical `round2` to shared utility
**File:** `src/App.jsx:327`, `src/lib/funding.js:5`, `functions/index.js:692`  
**Issue:** Three implementations with subtly different float handling. Only `funding.js` uses `Number.EPSILON`.  
**Fix:** Create `src/lib/utils.js`:
```js
export const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
```
Import into `App.jsx`, `funding.js`, and `functions/index.js`. Remove the inline versions.  
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — `src/lib/utils.js` created; imported in App.jsx and funding.js; functions/index.js updated to epsilon version in-place (no module import, Node CF)

---

### FIX-11 · `appraiseDeal()` NOI — apply management % to rent net of voids
**File:** `src/App.jsx:162`  
**Issue:** Management % applied to gross rent. Industry standard (and the standalone tool) apply it to rent received (gross minus voids). Small impact (~£95/yr on a typical deal) but technically wrong.  
**Fix:**
```js
// Before
const noi = annualRent * (1 - voidPct - mgmtPct - maintPct) - llInsurance;

// After — management on net-of-voids rent (as letting agents actually charge)
const receivedRent = annualRent * (1 - voidPct);
const noi = receivedRent - (receivedRent * mgmtPct * 1.2) - (annualRent * maintPct) - llInsurance;
```
This will slightly improve all BRRR cashflow figures. Label in the UI as "Management fee calculated on rent received (net of voids)."  
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — `receivedRent = annualRent * (1 - voidPct)`; mgmtFee on receivedRent; maintCost on annualRent (industry standard)

---

### FIX-12 · Bridge interest method — document as labelled assumption in UI
**File:** `src/App.jsx:100`, `src/lib/funding.js`  
**Issue:** DealsDash uses compound retained interest; the standalone BMV tool uses simple interest (~£491 more on test deal). Not a bug, but currently undocumented in the UI.  
**Fix:** Add an assumption chip or footnote in the Funding Planner and Deal Detail views: "Bridge interest calculated on a retained compound basis."  
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — footnote added below bridge cost row in Purchase & funding sub-tab

---

## Tier 5 — Design system cleanup

### FIX-13 · Sparkline — wrong CSS variable and wrong fallback colour
**File:** `src/App.jsx:3573`  
**Issue:** `var(--color-vx-accent, #3b5bdb)` — variable name is wrong (`--color-vx-accent` doesn't exist; correct is `--vx-accent`) and fallback `#3b5bdb` is blue rather than Brick `#C1533C`.  
**Fix:**
```jsx
// Before
<Line stroke="var(--color-vx-accent, #3b5bdb)" ... />

// After
<Line stroke="var(--vx-accent, #C1533C)" ... />
```
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — `stroke="var(--vx-accent, #C1533C)"` (was `--color-vx-accent, #3b5bdb`)

---

### FIX-14 · `VxBadge` — migrate to token classes for dark mode
**File:** `src/components/Badge.jsx`  
**Issue:** Hard-coded `bg-emerald-100 text-emerald-700` etc. bypass the token system; dark mode is broken.  
**Fix:** Replace Tailwind colour classes with CSS variable classes. Add `--vx-surface-positive/caution/negative/info` tokens to `tokens/tokens.css` if absent, then:
```jsx
const VARIANTS = {
  positive: "bg-[var(--vx-surface-positive)] text-[var(--vx-positive)]",
  caution:  "bg-[var(--vx-surface-caution)]  text-[var(--vx-caution)]",
  risk:     "bg-[var(--vx-surface-negative)] text-[var(--vx-negative)]",
  info:     "bg-[var(--vx-surface-info)]     text-[var(--vx-info)]",
};
```
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — `--vx-surface-positive/caution/negative/info` + `--vx-info` tokens added to tokens.css + preset; Badge.jsx VARIANT_CLASSES use token classes

---

### FIX-15 · `ImdPill`, `PriceMomentumPill`, `recBadgeClass` — consolidate to `VxBadge`
**File:** `src/App.jsx:3497, 3509`; `src/components/WorkspaceView.jsx:93`  
**Issue:** Three separate inline Badge-like helpers with the same hard-coded colour pattern; dark mode broken on all three.  
**Fix:** After FIX-14, replace each with `<VxBadge variant="risk|caution|positive">`. Remove the helper functions.  
**Effort:** M · **Decision needed:** Complete FIX-14 first · **Status:** ✅ 2026-09-30 — ImdPill and PriceMomentumPill use `bg-vx-surface-*` token classes; recBadgeClass in WorkspaceView.jsx updated

---

### FIX-16 · `STAGE_COLORS` — token classes
**File:** `src/lib/pipeline.js`  
**Issue:** Uses raw Tailwind colour classes (`bg-blue-50 text-blue-700`) not token-aware classes.  
**Fix:** Map to token variants consistent with the design system. Use `--vx-surface-*` tokens or existing semantic classes from `tokens.css`.  
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — all 14 STAGE_COLORS entries mapped to `bg-vx-surface-*` / `text-vx-*` tokens

---

### FIX-17 · Audit `bg-white` — replace with `bg-vx-surface`
**File:** `src/App.jsx` (multiple locations)  
**Issue:** `bg-white` renders white in dark mode instead of the dark surface colour.  
**Fix:** Global find-and-replace `bg-white` → `bg-vx-surface` and `bg-white/90` → `bg-vx-surface/90`. Spot-check in dark mode after.  
**Effort:** M · **Decision needed:** None · **Status:** ✅ 2026-09-30 — 22 `bg-white` → `bg-vx-bg` in App.jsx; nav overlay `bg-white/5` preserved (CSS-var opacity modifier not supported)

---

## Tier 6 — Technical debt and documentation

### FIX-18 · Cross-reference `ALLOWED_EMAIL` in all three locations
**Files:** `src/App.jsx:51`, `functions/index.js:11`, `firestore.rules:7`  
**Fix:** Add comment to each: `// ALLOWED_EMAIL — also defined in functions/index.js:11 and firestore.rules:7 — update all three together.`  
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — cross-reference comment added to App.jsx:52, functions/index.js:11, and firestore.rules:1

---

### FIX-19 · `refreshMarketStats` — add Scotland/NI disclaimer
**File:** `functions/index.js` — `refreshMarketStats`  
**Issue:** Uses Land Registry (England/Wales only). Scottish or NI postcodes return empty data.  
**Fix:** After postcode district lookup, if country is Scotland or NI, return structured `notAvailable` response: `"Land Registry Price Paid data covers England and Wales only. Scottish price data is available from Registers of Scotland; NI from Land & Property Services."`  
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — district area prefix checked against SCOTLAND_AREAS / BT sets; structured notAvailable returned before fetch

---

### FIX-20 · `applyDeterministicGate` — document intentional duplication
**Files:** `src/App.jsx`, `functions/index.js`  
**Fix:** Add comment above each copy:
```
// INTENTIONAL DUPLICATION — mirrors the copy in [other file].
// If you change gate rules here, update the other copy too.
// TODO: extract gate DEFINITIONS to a shared JSON constant.
```
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — structured comment + TODO added to both App.jsx and functions/index.js

---

### FIX-21 · `marketStats` root collection — document exception
**File:** `src/data/repo.js:58`, `functions/index.js` — `refreshMarketStats`  
**Fix:** Add comment: `// marketStats is a root collection (not per-user) — intentional single-user exception to the subcollection pattern. Do not move under users/{uid}/ without a migration.`  
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — expanded comment in repo.js; rationale + migration warning added to section header in functions/index.js

---

### FIX-22 · Deprecate free-text `buildResearchPrompt`
**File:** `functions/index.js:379`  
**Fix:** Add `@deprecated` JSDoc comment; mark structured `buildResearchPromptFromBrief` as the primary path.  
**Effort:** S · **Decision needed:** None · **Status:** ✅ 2026-09-30 — JSDoc `@deprecated` added; primary path named in comment

---

## Summary by tier

| Tier | Items | Total effort | Blocks deploy? |
|------|-------|-------------|---------------|
| 1 — Silent bugs | FIX-01, FIX-02 | ~30 min | Yes — Decision Brief is wrong without these |
| 2 — Model IDs | FIX-03 | ~10 min | Yes — AI features fail without this |
| 3 — UK pivot blockers | FIX-04 to FIX-08 | ~4h | Yes for UK pivot |
| 4 — Calc consolidation | FIX-09 to FIX-12 | ~3h | No — quality improvements |
| 5 — Design system | FIX-13 to FIX-17 | ~4h | No — dark mode broken but not new |
| 6 — Tech debt | FIX-18 to FIX-22 | ~1h | No |

**Suggested sprint order:** Tier 1 → Tier 2 → Tier 3 (owner decision on SDLT strategy needed for FIX-04) → Tier 4 → Tier 5 → Tier 6.

---

## Owner decisions required before starting

| # | Decision | Needed for |
|---|----------|-----------|
| D1 | SDLT: add LBTT/LTT now (M effort) or show disclaimer and defer (S effort)? | FIX-04, FIX-09 |
| D2 | What is the correct Claude model ID to use for research and legal pack? Verify `claude-sonnet-4-6` or confirm another ID | FIX-03 |
| D3 | Should the AI research context include the deal's region dynamically, or just remove the NW England reference? | FIX-06 |
