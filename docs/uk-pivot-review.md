# DealsDash End-to-End Review — UK Pivot

**Prepared:** 2026-09-30  
**Reviewer:** Claude Code  
**Scope:** Full codebase review against the stated pivot goal of supporting any property across the United Kingdom (not just North West England). Covers frontend (`src/`), backend (`functions/`), design system (`src/design-system/`), and Firestore rules.

---

## Executive Summary

DealsDash is a well-structured, single-user property deal tool. The core pipeline, deal appraisal, decision brief, and notification infrastructure are sound. However, four categories of issue block a clean UK pivot:

1. **Geographic hard-coding** — SDLT (England-only), Police.uk (England/Wales), EA flood (England-only), Land Registry SPARQL (England/Wales), IMD (England-only), `REGION_TOWNS` (England-only), and several text strings anchor the app to North West England. None of these is unfixable, but they need systematic treatment.

2. **Two silent bugs in `decision.js`** — the IMD risk check always silently fails (NaN coercion), and the flood risk check reads a field that is never populated. Both have been there since the features shipped and mean the Decision Brief is not using that data.

3. **Duplicate calculation logic** — `calcSDLT` exists in both `App.jsx` and `funding.js` with different feature levels (no disclaimer vs disclaimer + audit trail); `round2` has three separate implementations; bridge interest mode and NOI management % differ between the app and the standalone BMV tool. This creates silent divergence as each copy drifts.

4. **Design system drift** — `Badge`, `ImdPill`, `PriceMomentumPill`, and stage-colour helpers all reach past the token system to raw Tailwind colours, breaking dark mode. One chart's CSS variable name is wrong, rendering with the wrong colour and wrong fallback.

Priority fixes in order: bugs first, then UK pivot blockers, then calculation consolidation, then design system cleanup.

---

## A. Geographic Hard-coding (UK Pivot Blockers)

### A1. SDLT — England-only in two places

| Location | Issue |
|---|---|
| `App.jsx:83` — `calcSDLT()` | Hard-coded England SDLT bands; no disclaimer; no LBTT or LTT |
| `funding.js:28` — `calcSdltAudit()` | Also England-only but carries a `SDLT_DISCLAIMER` string; has band-by-band audit trail |

`calcSDLT` is used inline throughout `App.jsx` (deal appraisal, max-bid solver, auction assessment). `calcSdltAudit` is used in the Funding Planner. Both implement the same England SDLT bands. Scotland uses LBTT (different thresholds); Wales uses LTT (different thresholds); Northern Ireland uses SDLT but with different rates above £500k.

**Fix:** Remove `App.jsx:calcSDLT`; extend `funding.js:calcSdltAudit` to accept a `jurisdiction` parameter (`england`, `scotland`, `wales`, `ni`) and return the correct tax. Derive jurisdiction from `postcodes.io` `country` field (already returned by `lookupPostcode()`). All call-sites use the shared version.

### A2. Region / town picker — England only

`App.jsx:3082` — `REGION_TOWNS` constant covers 9 English regions (North West, Yorkshire, East Midlands, West Midlands, North East, East, South East, South West, Greater London). No Scotland, Wales, or Northern Ireland.

Default state at `App.jsx:3978`: `region: "North West England"`, `towns: ["Rochdale", "Oldham"]`.

**Fix:** Add:
```js
"Scotland": ["Glasgow", "Edinburgh", "Aberdeen", "Dundee", "Inverness"],
"Wales": ["Cardiff", "Swansea", "Newport", "Wrexham"],
"Northern Ireland": ["Belfast", "Derry/Londonderry", "Lisburn"],
```
Clear defaults to empty string / empty array rather than pre-selecting a region.

### A3. AI research prompt — geographic hard-coding

`functions/index.js:77`:
```js
"UK residential property BRR/flip deal appraisal for an experienced property trader based in North West England."
```
This text is sent as context to the AI on every property sourcing research run. For a Scottish property this is misleading context.

**Fix:** Remove "based in North West England" or make it dynamic from the user's saved strategy profile location.

### A4. Example deal and default strategy profile

`App.jsx:515` — `exampleDeal()`: `town: "Rochdale"`, `postcode: "OL16 4XX"`  
`App.jsx:405` — `DEFAULT_STRATEGY_PROFILE.postcodeAreas: ["OL", "M", "SK", "HD", "HX"]`  
`App.jsx:4582` — placeholder: `"e.g. OL16 4RL"`  
`App.jsx:4799` — placeholder: `"e.g. Rochdale, Oldham, wider Manchester"`

These are placeholders/defaults, not production data. They only cause problems if a new user never edits them, but they should become generic.

**Fix:** `exampleDeal()` → `town: "Your town"`, `postcode: "AB1 2CD"`. Strategy profile defaults to empty arrays. Placeholder text → "e.g. OL1, G1, CF10".

### A5. Rates library comment

`src/modules/survey/data/rates.js:1`:
```js
/* Benchmark refurbishment rates (£). Greater Manchester, 2026. ILLUSTRATIVE */
```
The rates themselves are illustrative and region-editable; the comment describes their provenance correctly. **No code change needed**, but when a user operates outside Greater Manchester this comment could mislead. Consider adding "— adjust the regional cost factor for other areas" to the comment.

### A6. Estately webhook setup comment

`functions/index.js:1124`:
```
postcode_prefix: OL, SK
```
This is a setup comment showing example values. No code impact, but should be updated to a generic example (e.g. `G1, EH3`) when the feature ships to a UK-wide user.

### A7. API coverage gaps by nation

| API / Data source | England | Wales | Scotland | N. Ireland | Notes |
|---|---|---|---|---|---|
| SDLT/stamp duty | ✓ | ✗ LTT | ✗ LBTT | Partial | `A1` above |
| Land Registry Price Paid SPARQL | ✓ | ✓ | ✗ RoS | ✗ LPS | `App.jsx:3330, 3405` |
| UK House Price Index (UKHPI) | ✓ | ✓ | ✗ RoS stats | ✗ NISRA | `App.jsx:3392` |
| Police.uk crime | ✓ | ✓ | Partial | Partial | `App.jsx:3450` |
| Environment Agency flood | ✓ | ✗ NRW | ✗ SEPA | ✗ Rivers Agency | `App.jsx:3468` |
| IMD deprivation | ✓ (handled) | ✗ WIMD | ✗ SIMD | ✗ NIMDM | `App.jsx:3483`; displays "IMD N/A" for non-England |
| postcodes.io geocoding | ✓ | ✓ | ✓ | ✓ | — |
| EPC Register (MHCLG) | ✓ | ✓ | ✗ Scottish EPC | ✗ | Cloud Function `checkEpcRegister` |
| Region/town picker | ✓ | ✗ | ✗ | ✗ | `A2` above |

**Recommended near-term approach (Phase 1):** Surface clear disclaimers at the point of use for Wales, Scotland, and NI (following the IMD pattern that already exists). Do not attempt to integrate RoS, SEPA, SIMD etc. until there is real deal flow in those nations. The IMD `notAvailable` pattern is already the right model.

For flood risk specifically, add: if `pc.country` is not `"England"`, return `{ error: "Flood risk data from the Environment Agency covers England only. Check NRW (Wales), SEPA (Scotland), or Rivers Agency (NI) for this postcode." }` so the UI shows a clear message rather than silently returning empty data.

---

## B. Calculation Inconsistencies

### B1. SDLT — two implementations

See `A1`. `App.jsx:calcSDLT` and `funding.js:calcSdltAudit` produce the same numbers for England but diverge in disclaimer, audit trail, and extensibility. Having two means any future rate change (e.g. another stamp duty holiday) must be applied in two places.

### B2. Bridge interest — compound vs simple

`App.jsx:100` — `calcBridge()`:
```js
const interest = loan * (Math.pow(1 + rate, term) - 1); // compound (retained basis)
```

`funding.js:56` — `calcBridgeInterest(loan, rate, term, mode)`:
```js
if (mode === "serviced") return round2(loan * rate * months); // simple
// retained: compound
```

The Funding Planner and BMV standalone use simple interest for the test-deal comparison; the standalone always uses simple; DealsDash always uses compound. Compound is more conservative (~£491 more on the test deal over 6 months). This is a method choice not a bug, but it should be documented in the UI as an assumption.

### B3. NOI / cashflow — management % applied to gross vs net

`App.jsx:162` — `appraiseDeal()`:
```js
const noi = annualRent * (1 - voidPct - mgmtPct - maintPct) - llInsurance;
```
Management % applied to gross rent.

Standalone `appraise()` line 511:
```js
const mgmt = (gross - voids) * num(cfg.letting.mgmt) * 1.2; // net of voids
```
Management % applied to rent net of voids (as most letting agents actually charge — they don't charge fees on void weeks).

On a £825/month rent with 8% voids and 12% management: gross method → £1,188/yr management; net-of-voids method → £1,093/yr — £95/yr difference. The net-of-voids method is technically more correct and matches industry practice.

**Fix:** Update `appraiseDeal()` to apply management % to `annualRent * (1 - voidPct)`.

### B4. `round2` — three separate implementations

| Location | Implementation |
|---|---|
| `App.jsx:327` | `Math.round(Number(n) * 100) / 100` — no epsilon |
| `funding.js:5` | `Math.round((Number(n) + Number.EPSILON) * 100) / 100` — with epsilon |
| `functions/index.js:692` | `Math.round((Number(n) \|\| 0) * 100) / 100` — no epsilon, coalesces null |

The epsilon version in `funding.js` avoids floating-point rounding errors (e.g. `1.005` → `1.00` without epsilon, `1.01` with). This should be the canonical version.

**Fix:** Export `round2` from a shared utility (e.g. `src/lib/utils.js`) and import it everywhere.

### B5. BUG — `decision.js:253` — IMD check always fails

```js
const imd = Number(deal?.areaIntelligence?.imd); // imd is an object, not a number
if (imd > 5) { /* IMD risk condition — never reached */ }
```

`fetchAreaIntelligence()` returns `areaIntelligence.imd` as:
```js
{ rank: 8432, decile: 3, lsoa: "E01012345", lsoaName: "...", release: 2019 }
```

`Number({...})` → `NaN`. `NaN > 5` → `false`. The Decision Brief IMD risk condition is never triggered regardless of deprivation level.

**Fix:**
```js
const imdDecile = Number(deal?.areaIntelligence?.imd?.decile);
if (imdDecile > 0 && imdDecile <= 3) { /* high deprivation risk */ }
```

### B6. BUG — `decision.js:185` — `floodZone` field doesn't exist

```js
const floodZone = Number(deal?.areaIntelligence?.floodZone); // always undefined → NaN
```

`fetchAreaIntelligence()` returns `{ crime, flood, imd, ... }`. There is no `floodZone` field. The flood data is at `areaIntelligence.flood.areaCount` and `areaIntelligence.flood.areas`.

**Fix:**
```js
const floodAreaCount = Number(deal?.areaIntelligence?.flood?.areaCount);
if (floodAreaCount > 0) { /* flood risk condition */ }
```

---

## C. Duplicate Logic / DRY Violations

### C1. `calcSDLT` duplicated

See `A1`, `B1`. Remove `App.jsx:calcSDLT`; centralise in `funding.js`.

### C2. `round2` duplicated three times

See `B4`. Extract to shared utility.

### C3. `applyDeterministicGate` intentionally duplicated

`App.jsx` and `functions/index.js` each contain `applyDeterministicGate`. The comment in `functions/index.js` acknowledges this:
> "mirrors applyDeterministicGate() in src/App.jsx exactly... intentionally duplicated"

This is a known fragility: any change to the gate logic must be applied in two places or lead triage diverges between client and server. This risk should be documented more visibly (e.g. a shared constant for the gate definitions even if the function is duplicated, so the rule list is a single source of truth).

### C4. Two `Badge` components with different APIs

| Location | Prop API | Variants |
|---|---|---|
| `App.jsx:565` — local `Badge` | `tone: "good"/"warn"/"bad"` | Used for EPC band display |
| `src/components/Badge.jsx` — `VxBadge` | `variant: "positive"/"caution"/"risk"/"info"` | Imported as `VxBadge` in WorkspaceView and elsewhere |
| `WorkspaceView.jsx:93` — `recBadgeClass()` | Inline class function, no component | Used for BUY/WATCH/PASS labels on map cards |

Three separate Badge implementations. The local `App.jsx` Badge is used specifically for EPC ratings (A/B/C = good, D/E = warn, F/G = bad) and is not imported anywhere. `VxBadge` is the design system component. `recBadgeClass()` is a local helper.

**Fix:** Extend `VxBadge` with a `tone` alias or an `epc` variant; remove the local `Badge`; replace `recBadgeClass()` inline classes with `VxBadge` usage.

### C5. `buildResearchPrompt` — two versions

`functions/index.js:334` — `buildResearchPromptFromBrief(brief, strategyProfile)` — structured, covers all constraints explicitly.  
`functions/index.js:379` — `buildResearchPrompt(criteria)` — free-text natural language fallback.

Both are exported Cloud Functions paths. The structured version is strictly better. The free-text version appears to be kept for backward compatibility. Document which path is the production one and consider removing the legacy version.

---

## D. Data Model Inconsistencies

### D1. Dual lifecycle tracking — `status` + `pipelineStage`

Leads have both `lead.status` (old: `"new"`, `"watching"`, `"bidding"`, `"won"`, `"promoted"`, `"rejected"`) and `lead.pipelineStage` (new: `"Watching"`, `"Lead Review"`, `"Due Diligence"`, ...). `effectivePipelineStage()` at `App.jsx:3723` bridges between them for backward compat:
```js
if (lead.pipelineStage) return lead.pipelineStage;
if (lead.status === "promoted") return "Won";
return LEAD_STATUS_TO_STAGE[lead.status] || "Watching";
```

This duplication will persist until all legacy leads are migrated. `migrate.js` may handle this — UNVERIFIED. The bridging function is correct but `status` should be deprecated once all leads have `pipelineStage`.

### D2. `areaIntelligence.floodZone` — missing field (see B6)

`decision.js` reads `deal.areaIntelligence.floodZone` which is never populated. The correct field path is `deal.areaIntelligence.flood.areaCount`.

### D3. `ALLOWED_EMAIL` in three places

`App.jsx:51`, `functions/index.js:11`, `firestore.rules:7` — all three hard-code `"paul.a.adeogun@gmail.com"`. A future email change requires updating all three.

**Fix:** `firestore.rules` cannot read Firestore settings at rule evaluation time, so it must stay hard-coded there. However, `App.jsx` and `functions/index.js` could both read a single `ALLOWED_EMAIL` constant defined in one place (or a shared config loaded from Firestore `settings/app`). At minimum, add a comment on each pointing to the other two locations.

### D4. `marketStats` collection at Firestore root

`repo.js:58`: `collection(db, "marketStats")` — shared root collection, not under `users/{uid}/`. Written by `refreshMarketStats` Cloud Function. Fine for a single-user app (no data isolation needed), but inconsistent with the per-user subcollection pattern from Prompt 01. Document this intentional exception so it doesn't get "fixed" incorrectly in a future migration.

### D5. Survey data stored in deal document

`deal.survey` is stored inside the deal document itself, not as a subcollection. The standalone tool's approach (separate document per deal) avoids the 1 MB Firestore limit. A deal with a full RICS survey, many photos referenced, and a complete refurb scope can approach this limit. **UNVERIFIED** — depends on actual photo storage (if photos go to Storage and only URLs are in Firestore, the risk is lower). Worth monitoring.

---

## E. Design System Inconsistencies

### E1. `Badge.jsx` (`VxBadge`) — hard-coded Tailwind colours, dark mode broken

```jsx
positive: "bg-emerald-100 text-emerald-700",
caution:  "bg-amber-100 text-amber-700",
risk:     "bg-rose-100 text-rose-700",
info:     "bg-blue-100 text-blue-700",
```

None of these use CSS token variables. In dark mode (`data-theme="dark"`), the token system applies different values for `--vx-positive`, `--vx-caution`, `--vx-negative`; but these hard-coded classes bypass the token system entirely, staying light-coloured in dark mode.

**Fix:** Map to token-aware classes:
```jsx
positive: "bg-[var(--vx-surface-positive)] text-[var(--vx-positive)]",
caution:  "bg-[var(--vx-surface-caution)] text-[var(--vx-caution)]",
risk:     "bg-[var(--vx-surface-negative)] text-[var(--vx-negative)]",
info:     "bg-[var(--vx-surface-info)] text-[var(--vx-info)]",
```
(Adding the surface-* tokens to `tokens.css` if they don't already exist.)

### E2. `ImdPill` — hard-coded Tailwind colours

`App.jsx:3497`:
```js
const cls = decile <= 3 ? "bg-rose-100 text-rose-700" 
          : decile <= 7 ? "bg-amber-100 text-amber-700" 
          : "bg-emerald-100 text-emerald-700";
```
Same issue as `VxBadge`. Should use `"risk"`, `"caution"`, `"positive"` variants via `VxBadge` or token classes.

### E3. `PriceMomentumPill` — hard-coded Tailwind colours

`App.jsx:3509`:
```js
const cls = lowVol ? "bg-amber-100 text-amber-700" 
          : yoyChangePct >= 0 ? "bg-emerald-100 text-emerald-700" 
          : "bg-rose-100 text-rose-700";
```
Same issue.

### E4. `WorkspaceView.jsx:93` — `recBadgeClass` inline — hard-coded colours

```js
if (rec === "BUY")   return "bg-emerald-100 text-emerald-800 border border-emerald-200";
if (rec === "WATCH") return "bg-amber-100 text-amber-800 border border-amber-200";
if (rec === "PASS")  return "bg-rose-100 text-rose-800 border border-rose-200";
```
A third set of hard-coded badge colours. Should be consolidated with `VxBadge`.

### E5. Sparkline chart — wrong CSS variable name

`App.jsx:3573`:
```jsx
<Line stroke="var(--color-vx-accent, #3b5bdb)" ... />
```

Two errors:
1. Variable name: `--color-vx-accent` does not exist in `tokens.css`. The correct name is `--vx-accent`.
2. Fallback colour: `#3b5bdb` is Indigo/blue (unrelated to the brand). The correct fallback is `#C1533C` (Brick).

**Fix:**
```jsx
<Line stroke="var(--vx-accent, #C1533C)" ... />
```

### E6. `PIE_COLORS` array — hard-coded hex values

`App.jsx:724`:
```js
const PIE_COLORS = ["#1B2A4A", "#C1533C", "#4A5670", "#A6412E", "#8A99B8", "#7A2F20", "#C7D0DE", "#3D4F73"];
```
Hard-coded brand hex values. Recharts doesn't support CSS variables in its `fill` prop directly. The pragmatic fix is to derive these from `getComputedStyle(document.documentElement)` at render time, or accept them as a known exception and document it.

### E7. `STAGE_COLORS` — raw Tailwind classes in `pipeline.js`

```js
export const STAGE_COLORS = {
  "Watching":      { bg: "bg-slate-100", text: "text-slate-600" },
  "Lead Review":   { bg: "bg-blue-50",   text: "text-blue-700" },
  ...
};
```
Uses raw Tailwind colour classes rather than token classes. Not dark-mode aware.

### E8. Form components — `bg-white` usage

Throughout `App.jsx`, form inputs and cards use `bg-white` which is not a token class. In dark mode this produces white elements on a dark background. Should be `bg-vx-surface` or `bg-vx-surface-2`.

### E9. Two styling systems — `App.jsx` vs `SurveyModule.jsx`

`App.jsx` and `WorkspaceView.jsx` use Tailwind utility classes with token CSS variables (`text-vx-text`, `bg-vx-surface`).  
`src/modules/survey/SurveyModule.jsx` uses design system semantic classes (`vx-page`, `vx-header`, `vx-input`, `vx-btn`).

Neither approach is wrong, but maintenance risk grows as the two systems diverge. The Tailwind-token approach is the primary pattern; document this so future additions don't default to the CSS-class approach.

---

## F. Backend Inconsistencies

### F1. Model ID strings — likely wrong

`functions/index.js:98`: `RESEARCH_MODEL = "claude-sonnet-5"`  
`functions/index.js:457`: `LEGAL_PACK_MODEL = "claude-sonnet-5"`  
`functions/index.js:768`: `STATUS_CHECK_MODEL = "claude-haiku-4-5-20251001"` — this format is correct.

`"claude-sonnet-5"` does not match the Anthropic model ID format. The correct ID for Claude Sonnet 4.6 (the current production model) is `"claude-sonnet-4-6"`. If `"claude-sonnet-5"` is an alias or a yet-to-be-released model, this needs verification. **An incorrect model ID will cause every AI call to fail at runtime.**

**Fix:** Verify with `anthropic.models.list()` or the Anthropic docs and update to the correct IDs. Use `claude-sonnet-4-6` for research and legal pack work; keep `claude-haiku-4-5-20251001` for the cheaper status check.

### F2. AI research prompt — geographic hard-coding

See `A3`. `functions/index.js:77` hard-codes "North West England" in the AI system context.

### F3. `applyDeterministicGate` — intentional duplication

See `C3`. Fragile; must be kept in sync manually.

### F4. `refreshMarketStats` — uses Land Registry (England/Wales only)

The function validates any postcode district format but the underlying SPARQL data only covers England/Wales. A Scottish district (e.g. `G11`) will return 0 transactions and throw a `not-found` error. This is handled by the `not-found` throw at line 1091, but the UI message could be clearer: "Land Registry Price Paid Data covers England and Wales only. Scottish price data is available from Registers of Scotland."

### F5. Unused secrets

`ESTATELY_API_KEY` and `ESTATELY_WEBHOOK_SECRET` are referenced in setup comments and partially in the webhook handler but the webhook is not yet enabled for production (awaiting owner go/no-go per `docs/estately-spike-findings.md`). Clean up or leave with comment.

---

## G. Firestore Rules

```
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null
    && request.auth.uid == userId
    && request.auth.token.email == "paul.a.adeogun@gmail.com";
}
```

- **Wildcard covers all subcollections** — correct for the Prompt 01 per-entity subcollection model. ✓
- **`marketStats` root collection** — written by Cloud Functions only (which enforce auth internally). No Firestore rule covers `marketStats`. If Storage rules also exist, they are not audited here. **UNVERIFIED.**
- **ALLOWED_EMAIL hard-coded** — see `D3`. Cannot be moved to Firestore settings for the rules file, but document all three locations.
- **No server-side data validation** — Firestore rules validate auth only, not data shape. Acceptable for a single-user app, but worth noting.

---

## H. UK Pivot — Feature Readiness Matrix

| Feature | England | Wales | Scotland | N. Ireland | Gap type |
|---|---|---|---|---|---|
| SDLT / stamp duty | ✓ SDLT | ✗ LTT | ✗ LBTT | Partial | Code (`A1`) |
| Land Registry Price Paid | ✓ | ✓ | ✗ RoS | ✗ LPS | Data gap (no open API) |
| UKHPI price trend | ✓ | ✓ | ✗ RoS | ✗ NISRA | Data gap |
| Police.uk crime | ✓ | ✓ | Partial | Partial | Data gap |
| EA flood risk | ✓ | ✗ NRW | ✗ SEPA | ✗ Rivers Agency | Code + data gap (`A7`) |
| IMD deprivation | ✓ (handled) | ✗ WIMD | ✗ SIMD | ✗ NIMDM | Handled — shows N/A |
| postcodes.io geocoding | ✓ | ✓ | ✓ | ✓ | No gap |
| EPC Register | ✓ | ✓ | ✗ Scottish EPC | ✗ | Data gap |
| Region/town picker | ✓ | ✗ | ✗ | ✗ | Code (`A2`) |
| AI research context | NW England | ✗ | ✗ | ✗ | Code (`A3`) |
| Tenancy law (RRA) | ✓ England | ✓ Wales (Renting Homes Act) | ✓ Scotland (own regime) | ✓ NI | Legal prompts reference England; RRA mentioned in legal pack review |

**Recommended approach:**  
Phase 1 (minimal): Fix code blockers (A1, A2, A3) and surface `notAvailable` disclaimers for API coverage gaps (flood risk, EPC in Scotland/NI). This makes the app usable UK-wide without claiming full coverage.  
Phase 2: Source RoS price data, SIMD/WIMD indices, and SEPA/NRW flood APIs if deal flow in those nations justifies it.

---

## I. Priority Action List

### P1 — Bugs (fix immediately, no owner decision needed)

| # | Issue | File:Line | Fix |
|---|---|---|---|
| 1 | IMD decision check always NaN | `decision.js:253` | Change `Number(imd)` to `Number(imd?.decile)` |
| 2 | Flood zone field doesn't exist | `decision.js:185` | Change `areaIntelligence.floodZone` to `areaIntelligence.flood?.areaCount` |

### P2 — UK Pivot Blockers (requires owner decision on scope)

| # | Issue | File | Effort | Owner decision needed |
|---|---|---|---|---|
| 3 | SDLT England-only | `App.jsx:83`, `funding.js` | M | Add LBTT/LTT or display jurisdiction disclaimer |
| 4 | REGION_TOWNS England-only | `App.jsx:3082` | S | Add Scotland/Wales/NI regions |
| 5 | AI prompt hard-codes NW England | `functions/index.js:77` | S | Remove or make dynamic |
| 6 | Default strategy profile / example deal | `App.jsx:405, 515` | S | Clear or genericise defaults |
| 7 | Flood risk England disclaimer | `App.jsx:3468` | S | Surface `notAvailable` for non-England postcodes |
| 8 | Model IDs — `claude-sonnet-5` | `functions/index.js:98, 457` | S | **Verify and correct** — wrong ID means every AI call fails |

### P3 — Calculation Consolidation (no user-visible impact; reduces future bugs)

| # | Issue | Effort |
|---|---|---|
| 9 | Remove `App.jsx:calcSDLT`; use `funding.js:calcSdltAudit` everywhere | M |
| 10 | Extract shared `round2` with epsilon to `src/lib/utils.js` | S |
| 11 | Fix `appraiseDeal()` NOI — apply management % to net-of-voids rent | S |
| 12 | Document bridge compound vs simple as a labelled assumption in the UI | S |

### P4 — Design System Cleanup (dark mode; visual consistency)

| # | Issue | Effort |
|---|---|---|
| 13 | Fix sparkline CSS var: `--color-vx-accent` → `--vx-accent`, fallback `#C1533C` | S |
| 14 | Migrate `ImdPill`, `PriceMomentumPill`, `recBadgeClass`, local `Badge` → use `VxBadge` | M |
| 15 | Remove hard-coded `bg-emerald/amber/rose` from `Badge.jsx`; use token classes | S |
| 16 | Audit `bg-white` usage; replace with `bg-vx-surface` | M |
| 17 | Migrate `STAGE_COLORS` to token classes | S |

### P5 — Technical Debt

| # | Issue | Effort |
|---|---|---|
| 18 | Add cross-reference comments to each `ALLOWED_EMAIL` instance | S |
| 19 | Add refreshMarketStats disclaimer for Scotland/NI postcodes | S |
| 20 | Document `applyDeterministicGate` duplication; add "must match" comment | S |
| 21 | Document `marketStats` root collection exception | S |
| 22 | Deprecate free-text `buildResearchPrompt`; mark structured version as primary | S |

---

## UNVERIFIED Items

| # | Item | Why unverified |
|---|---|---|
| U1 | Storage rules for legal pack and EPC uploads | `storage.rules` not present in source tree examined |
| U2 | Whether `migrate.js` already handles `status` → `pipelineStage` migration | File exists but not read |
| U3 | Whether `deal.survey` size approaches 1 MB in practice | Depends on actual usage data |
| U4 | Whether `"claude-sonnet-5"` is a valid API alias | Requires live API check |
| U5 | Whether `ESTATELY_WEBHOOK_SECRET` / `ESTATELY_API_KEY` secrets are set in Firebase | Depends on owner go/no-go |

---

*Files examined: `src/App.jsx` (5,651 lines — key sections), `src/lib/funding.js`, `src/lib/decision.js`, `src/lib/pipeline.js`, `src/components/Badge.jsx`, `src/components/WorkspaceView.jsx`, `src/modules/survey/SurveyModule.jsx`, `src/modules/survey/data/rates.js`, `src/data/repo.js`, `src/design-system/tokens/tokens.css`, `src/design-system/tokens/tailwind.preset.js`, `functions/index.js` (complete), `firestore.rules`, `tailwind.config.js`. Total: ~8,500 lines reviewed.*
