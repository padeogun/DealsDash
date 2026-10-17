# Appraisal v2 — Changelog

## Strategy summary corrected · 17 October 2026

Created `docs/strategy/VIXIV_STRATEGY_SUMMARY.md` as the single source of truth for external materials. Three claims in the prior conversational strategy reflection were corrected:

1. **Track record** — VIXIV has no completed transactions as at October 2026. The golden-case figures (£110,800, £200,000, £63,350) are Progressive Property Academy training illustrations, not VIXIV deal results.
2. **Market data** — the Bradford/Rochdale/Burnley scores, yields, and prices in the User Guide screener preview are illustrative examples created for the mockup, not live-sourced Land Registry or verified research data.
3. **Cash per deal** — the Business Planner default of £30,000 (`avgCashPerDeal`) is below the training golden-case minimum of **£47,450 on completion day** (Scenario A/B). The correct planning range is £47,450–£77,450 depending on refurb finance route. The `avgNetProfitPerDeal` default of £20,000 is also below the golden-case target of £27,000 (15% × £180k GDV).

No code changes; no deploy. Two P12 open items added: update Business Planner defaults; label ScreenerMockup SVG as sample data.

---

## Phase P10 — Verify and Release · 16 October 2026

### Release summary — what's new for Paul

**Appraisal engine v2** is a complete rewrite of how DealsDash evaluates deals:

- **Worst-case basis by default.** Every deal appraisal now starts from your lowest comparable value, not a midpoint. You can switch to mid or best for context, but the verdict always uses worst-case.
- **Five walk-away tests.** Before you get a PASS, the deal must clear: minimum break-even headroom (5%), no unknown cost lines, at least one comparable, lender route selected, and bridging AIP recorded (for auction leads).
- **Profit-first max offer.** Enter your target profit % and the engine works backwards to a maximum purchase price — including SDLT at company/additional-dwelling rates — so you never accidentally bid above your number.
- **Four separate measures for BRRR.** Cash released, cash left in, equity, and monthly cash flow are shown as distinct outputs. Refinance proceeds are never counted as profit.
- **Funding planner with ICR.** Model bridging + term lending with interest cover ratio check at 125% / 5.5% stressed rate. Tracks the £50k revolving fund drawdown and repayment across deals.
- **Pipeline kanban.** Drag deals through stages; DD Gate dialog requires a recorded decision brief before moving to Offer.
- **Decision briefs.** BUY / WATCH / PASS verdicts with reasoning, saved to Firestore, printable as PDF.
- **Area signals.** IMD deprivation decile (postcodes.io) and price momentum sparkline (Land Registry SPARQL) on every deal.
- **Viewing → offer → acceptance funnel.** Month-to-date vs target; agent performance table.
- **Deal programme (P11).** 54-activity VIXIV flip schedule from deal secured to sale completed. List and Gantt views on the Progress tab; programme-based holding cost shown beside your manual figure for comparison.
- **Auction bid sheet.** Finance-late, winter-external, and slow-listing-month flags derived from the auction date.
- **Notifications.** Daily digest + instant alerts for DD gate moves, auction dates, and market stat refreshes.

### Known limitations
- Scotland (LBTT) and Wales (LTT) stamp duty — not calculated; shows "unsupported nation — calculate manually".
- All thresholds (profit %, ICR, headroom, reserves) are tagged "Illustrative — verify" until you confirm them with your broker/accountant.
- P08 (screen-before-view comparables ranking) is not built — skipped pending a suitable data source.
- `deleteAllForUser` does not yet cascade-delete `programme/main` subcollections (tracked for P12).

### Pre-flight status
- ✓ P09 completed; no open High/Critical findings (SEC-02 accepted by Paul 2026-10-16)
- ✓ 278/278 tests passing
- ✓ Production build clean; no test artefacts in bundle
- ✗ Fresh backup — **required before deploy** (run `node scripts/backup-firestore.js`)
- ✗ Emulator smoke test — **required before deploy** (manual checklist below)

### Smoke-test checklist (manual — Paul to verify)
- [ ] Migration runs once on emulator data; `schemaVersion: 2` shown; all existing deals open
- [ ] Flip deal shows max offer budget ≈ £110,800; SDLT split ≈ £5,276
- [ ] BRRR deal shows budget ≈ £200,000; bridge release ≈ £63,350
- [ ] One real auction lead runs to a bid sheet with max bid displayed
- [ ] Deal Programme tab loads on a deal; List and Gantt views switch correctly
- [ ] App loads and is usable at 375 px width (mobile)

---

## Phase P09 — Security Review · 16 October 2026

17 items checked across P00–P11 scope. 3 fixes applied; 3 Low findings accepted; 1 High npm advisory deferred.

### Fixed
- **SEC-01 (Medium)** — `firebase.json`: added CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
- **SEC-06 (Low)** — `javascript:` URI injection in `lead.sourceUrl`: added `safeUrl()` helper in `functions/index.js` sanitizeLeads; added `/^https?:\/\//` guard on client-side href render in `src/App.jsx`
- **SEC-07 (Low)** — `src/data/migrate.js`: removed full Firestore snapshot from `console.log`; replaced with deal count only

### Accepted / deferred
- **SEC-02 (High audit / Info runtime)** — `@grpc/grpc-js` transitive dep via `firebase` client SDK; not in browser bundle; only fix is a major breaking firebase downgrade — deferred to next Firebase SDK upgrade cycle
- **SEC-03/04/05 (Low)** — rate limiting, input size cap, error message — acceptable in single-user auth-gated app
- **SEC-08 (Info)** — `deleteAllForUser` doesn't cascade-delete `programme/main` — tracked for P12

### Clear (no action)
SEC-09 through SEC-17: Firestore rules, secrets, XSS, external links, storage rules, SSRF, webhook, test artefacts, CSV injection — all clear.

---

## Phase P11 — Deal Programme · 16 October 2026

### Added
- **`src/lib/programme/`** — pure-JS scheduler module (no React, no Firebase):
  - `calendar.js` — working-day arithmetic (isWorkday, addWorkdays, networkdays, addCalendarDays, ceilWorkday, monthOf); holidays injected, no date library
  - `template.js` — 54-activity VIXIV flip programme template (IDs A1–H9, phases A–H), `templateVersion = 1`
  - `schedule.js` — topological schedule engine: FS/SS dependency resolution, contingency on flagged activities, winter-drying extension (E2), actual-finish overrides, not-applicable pass-through, A12 auction/agent completion special case, lag/dur param overrides
  - `flags.js` — `computeFlags(result, {bridgeTerm})` derives financeLate, winterExternal, slowMonthListing, bridgeTermExceeded
  - `pipeline.js` — `checkCrewClash(deals)` (strict overlap) and `capitalOverlapDays(deals)` for multi-deal crew/capital planning
  - `holding.js` — `programmeHoldingMonths` and `holdingComparison` bridge the programme calendar to the appraisal holding cost line
  - `bankHolidays.js` — GOV.UK fetch + localStorage 24h cache + bundled England & Wales 2026–2028 fallback; `source` tag shown in UI
  - `index.js` — single re-export barrel for the module
- **`src/lib/programme/__tests__/p11.test.js`** — 40 golden tests (Deal 1 auction route, Deal 2 agent route, crew-clash, not-applicable, actuals override, contingency, winter-drying, key dates); all passing
- **`src/components/ProgrammeView.jsx`** — Progress tab UI:
  - Inputs panel: route (Segmented), deal-secured date, scope toggles (9 categories, 44px touch targets), 7 numeric assumption fields
  - Key dates card: 8-stat grid (completion, worksStart, pc, listed, saleAgreed, saleCompleted, build WDs, months owned) + flags row
  - List view: grouped by phase, collapsible, actual-date input per activity, "Show skipped" toggle, HOLD activities highlighted amber
  - Gantt view: CSS-grid, zero bundle delta, sticky label column, week ticks, today line, activity bars with per-phase colour, milestone circles
  - Firestore: onSnapshot subscribe to `users/{uid}/deals/{dealId}/programme/main`; debounced 800ms auto-save
  - Bank holidays: async fetch on mount with fallback; `source` tag shown when fallback is in use
- **`src/data/repo.js`** — `programmeDocRef` and `saveProgramme` for the new subcollection
- **`src/App.jsx`** — ProgrammeView wired into the Progress tab; `programmeData` state passed to AppraisalV2Tab
- **`src/components/AppraisalV2Tab.jsx`** — Programme check row in the holding cost section (comparison only, never drives verdict); bridge-term warning if `bridgeTermExceeded`
- **`src/components/AuctionAssessmentV2.jsx`** — Programme warnings block in bid sheet: finance-late, winter-external, slow-listing-month flags derived from lead's auction date and scope using bundled fallback holidays (synchronous)

### Architecture decisions
- Gantt: CSS-grid (option b chosen) — zero bundle delta over canvas/SVG/D3 approaches
- Firestore path: `users/{uid}/deals/{dealId}/programme/main` — covered by existing wildcard rule `{document=**}`; no rule changes needed
- Bank holiday fetch: fixed GOV.UK URL only; schema-validated before cache; user input never injected into the URL
- `db` passed as prop to ProgrammeView (not imported directly) — keeps the module testable without Firebase
- AuctionAssessmentV2 uses `FALLBACK_HOLIDAYS` synchronously (no async) — avoids async state in the bid sheet; flags are indicative, not authoritative

---

## Phase E follow-up — User Guide update · 12 October 2026

Updated `src/components/UserGuideView.jsx` to reflect the 7-tab deal structure introduced in Phase A2.

### Changed
- Overview step 3: "fill in the twelve tabs" → "seven tabs"
- Section `dealdetail` title: "Deal detail — all twelve tabs" → "Deal detail — seven tabs"
- `DealDetailContent` fully rewritten: documents 7 tabs (Property, Appraisal, Finance, Returns, Progress, Decision, Legal); includes dedicated Appraisal v2 section covering strategy toggle, Playbook badge, valuation triad, structured costs, flip outputs, five walk-away tests, verdict bar, and per-deal threshold overrides
- `PlaybooksContent`: added three-tier priority chain explanation (per-deal override → Playbook → Settings) and new Strategy field description
- Glossary: 5 new entries — Break-even headroom, Fragility (appraisal), Verdict PASS/WARN/FAIL/INCOMPLETE (Appraisal v2), Walk-away tests, Worst-case basis
- Section `glossary` terms string updated with new keywords

---

## Phase E — Terminology and labelling · 12 October 2026

### Changed (no logic or data changes — UI text only)

| Location | Before | After |
|---|---|---|
| Verdict bar header | `Flip — Appraisal v2` | `Flip — Deal appraisal` |
| Verdict bar test checklist | raw IDs: `cashflow`, `refinance` | human labels via `TEST_LABELS` map: `Cash flow`, `Refinance` |
| Walk-away tests card | `Cashflow` (capitalised raw ID) | `Cash flow` |
| Valuation basis caption | `(RULE 9 — worst default)` | `worst case is the safe default` |
| Refurb scenario caption | `(RULE 9 — worst default)` | `worst case is the safe default` |
| Bridge calculator note | "Daniel's actual quote was £850/month; the classroom golden case…" | "Always use the lender's own illustration — these figures are indicative only." |
| Bridge shortfall warning | `Paul must bring` | `Buyer must bring` |
| BRRR Refinance section label | `Refi LTV` | `Refinance LTV` |
| BRRR Refinance section label | `Refi fees (£)` | `Refinance fees (£)` |
| Fragility card KPI | `Minimum value for refi to cover costs` | `Minimum value for refinance to cover costs` |
| Fragility card KPI | `Refi surplus / shortfall` | `Refinance surplus / shortfall` |
| Per-deal overrides | `Refi LTV` | `Refinance LTV` |
| Per-deal overrides | `Profit target % GDV` | `Profit target (% of end value)` |
| Per-deal overrides | `Min net monthly £` | `Min net monthly (£)` |
| Per-deal overrides | `Min headroom %` | `Min break-even headroom (%)` |
| Per-deal overrides | `Accepted cash left in £` | `Max cash left in deal (£)` |
| Per-deal overrides description (BRRR summary line) | `Refi at … LTV` | `Refinance at … LTV` |

238/238 tests pass (no logic changes).

---

## Phase D — Unified, strategy-filtered verdict · 12 October 2026

### Fixed
- **Incomplete = PASS bug**: a deal with no valuation entered showed green PASS. Now shows amber INCOMPLETE.
  `verdict = walkResult ? strategyVerdict(tests, strategy) : (endValue == null ? "warn" : "pass")`
- **Strategy-blind cashflow/ICR test**: a flip deal with `rent = 0` always failed the cashflow walk-away test (ICR fails on zero rent) even though ICR is irrelevant to a flip exit. Refinance headroom test also ran, producing misleading results. Both are now suppressed for flip.

### Added
- `strategyVerdict(tests, strategy)` exported from `src/lib/appraisal/walkaway.js` — filters to strategy-relevant tests before deriving worst verdict
- `STRATEGY_TESTS` constant exported: flip → `{value, costs, resilience}`; brrr → all five tests
- 9 new tests in `p05.test.js`; **238/238 passing**

### Changed
- Verdict bar: now shows strategy label ("Flip — Appraisal v2" / "BRRR — Appraisal v2") and a mini test-status checklist below the verdict
- Verdict bar: shows "INCOMPLETE" when there is no valuation, with a prompt to enter data
- Walk-away tests card: filtered to strategy-relevant tests only; flip deals see a note "Refinance and cash-flow tests not shown — not applicable to a flip exit"

---

## Phase C — Playbook strategy + threshold defaults · 12 October 2026

### Changed
- `AppraisalV2Tab` now accepts a `buyBox` prop (the deal's linked Playbook)
- Resolved-value priority chain: **per-deal override → Playbook assumption → global Settings**
  - `strategy`: `v2.strategy` → `buyBox.strategy` → `"flip"`
  - `profitPct`: `v2.profitPct` → `buyBox.assumptions.targetProfitOnCostPct` → `apprCfg.profitPctDefault`
  - `ltv`: `v2.refinance.ltv` → `buyBox.assumptions.refiLtvPct` → `0.75`
  - `acceptedLeftIn`: `v2.refinance.acceptedLeftIn` → `buyBox.assumptions.maxMoneyLeftInGBP` → `apprCfg.acceptedLeftInDefault`
  - `icrThreshold`: `v2.icr` → `buyBox.assumptions.icrThresholdPct` → `apprCfg.icr`
  - `icrStressRate`: `buyBox.assumptions.icrStressRatePct` → `apprCfg.icrStressRate`
  - `reserves` (mgmt/maint/voids): per-deal object → Playbook individual keys → global defaults
- Playbook badge added to strategy card — shows linked Playbook name + strategy; "strategy overridden" if `v2.strategy` differs from `buyBox.strategy`
- Per-deal override placeholders now show the Playbook value (if available) rather than the bare global default, so the user sees what will actually be used
- **Bug fix**: Refi LTV override placeholder was `String(apprCfg.icr * 100)` = "125" (ICR ratio used by mistake); corrected to `String(round2((bbVal("refiLtvPct") ?? 0.75) * 100))` = "75"
- Override footer note updated to mention "Playbook → Settings" cascade
- `buyBox` prop wired from `AppInner` → `DealDetailView` → `AppraisalV2Tab`; resolved as `buyBoxes.find(b => b.id === selectedDeal.buyBoxId) || defaultBuyBox`
- No new financial formulas introduced in Phase C (priority chain is value-selection only); 229/229 existing tests pass

---

## Phase B — Lead→Deal promotion carry-forward · 12 October 2026

### Changed
- `prefillValuation()` now checks `estResaleLow`/`estResaleHigh` before `gdvOverride` — promoted deals get a proper worst/mid/best triad rather than collapsing to a single midpoint (RULE 9)
- `leadToDealPartial()` passes `estResaleLow`/`estResaleHigh` through to the deal object
- `promoteLeadToDeal()` strips the pre-set empty v2 block and calls `migrateV2Deal()` in one pass, pre-filling: valuation from resale range, refurb from estimate, bridge funding from buy-box LTV/rate, refinance LTV from `btlLtv`
- 11 new tests; 229/229 passing

---

## Phase A2 — 7-tab restructure + structured cost entry · 12 October 2026

### Changed
- Deal detail tabs consolidated from 13 → 7: **Property, Appraisal, Finance, Returns, Progress, Decision, Legal**
- Max bid solver tab removed (v2 Appraisal replaces it); Refurb tab removed (data now in Appraisal)
- Merges: Finance = purchase details + Funding Planner; Returns = selling/flip + area risk; Progress = timeline/holding + survey; Decision = simulate + AI review + brief
- `useComputedFinance` checkbox removed — bridge finance cost always included when a source is configured
- v1 vs v2 comparison card removed from AppraisalV2Tab; `v1Appraisal` prop dropped
- Structured cost entry UI added to Appraisal tab: legal, refurb, and holding each have a lump/detail toggle with inline totals (RULE 7: null shown as "Unknown", not 0)

### Phase A1 — Structured cost model · 12 October 2026

### Added
- `bridgeLump(financeCostLump)` in `src/lib/appraisal/bridging.js` — lump finance cost path returning same shape as `bridgeRelease()`
- `legal`, `refurb`, `holding` structured sub-blocks in `emptyV2Block()` (lump/detail mode each)
- `legalTotal()`, `refurbTotal()`, `holdingMonthlyRate()`, `holdingCostLine()`, `totalProjectMonths()` in `src/lib/appraisal/costs.js`
- `migrateV2Deal()` v2→v3 additive upgrade path — adds missing sub-blocks to deals that already have a v2 block (RULE 14)
- 40 golden tests in `src/lib/appraisal/__tests__/a1-costs.test.js`; 26 migration tests updated in `src/lib/migrations/v2.test.js`

---

## P10 — Verify & Release · 10 October 2026

### What's new for you (plain English)

**Deal appraisal engine** — Every deal now has a proper profit-first maths stack. Open a deal, fill in GDV, refurb, legals and finance costs, and the engine tells you your maximum purchase price + SDLT split (company buyer, England), with a clear PASS / WARN / FAIL verdict and the exact conditions that need to change to flip a fail to a pass.

**Worst-case default** — All appraisals default to the worst comparable, not the best. Mid and best are shown as context. This is deliberate: if the worst-case still works, everything else is upside.

**BRRR and bridging** — Separate BRRR mode (refi-first stack) calculates how much you can bid given your exit LTV and how much you're willing to leave in. The bridging panel shows day-one release after retained interest, fees, and broker costs.

**Auction walk-away price** — Enter your target profit %, refurb, legals, finance, and holding costs. The engine returns a maximum bid with a room-to-manoeuvre indicator. Ticks through seven automated checks (costs complete, no placeholder assumptions, ICR, valuation headroom, equity, cash-flow, risk score).

**SDLT calculator** — England company purchase rates (higher-rate 5%/7%/10%/12% + 2% surcharge). Scotland and Wales correctly return "unsupported nation" rather than silently using the wrong rates.

**Refurb Survey** — Kerb-appeal checklist with grouped categories (roof, windows, doors, damp, services, cosmetic). Each item has a benchmark cost range from verified trade sources. Survey scores link to the deal's refurb budget.

**Viewing → Offer → Acceptance Funnel** — Log viewings against each lead, record offer amounts, outcomes and follow-up dates. The Funnel tab summarises your monthly and 3-month rolling conversion rates (viewings → offers → accepted), standing offers sorted by closing date, and a target-pace indicator against your monthly viewing target.

**Agents panel** — Track estate agents separately from leads. Each agent has a name, agency, contact, and notes field. Agents persist independently in their own Firestore subcollection so they survive a settings reset.

**National Area Screener** — One-click scan of all ~360 English local authority areas ranked by a composite score (yield, price growth, sales volume, flip rate). Apply strategy filter (Flip / BRRR / BTL), property type, max price, and per-factor weights. Click any row to drill into the constituent districts with full metric breakdown.

### Known limitations

- **Scotland (LBTT) and Wales (LTT)** are not calculated — returns "unsupported nation". England only.
- **Costs tagged "Illustrative — verify"** use benchmarks from trade sources as of October 2026; re-verify before relying on them.
- **Screener data** uses ONS / Land Registry / ONS Price Paid statistics as of mid-2026 and will need refreshing periodically.
- **P08 flag state** (lead status flags) is a placeholder pending Estately integration decision.

### Pre-flight checklist (all green)

| # | Check | Status |
|---|-------|--------|
| 1 | P09 completed — no open High/Critical in SECURITY_LOG.md | ✅ D resolved, E accepted (not exploitable in browser) |
| 2 | `npm test` — 177/177 passing, 9 test files | ✅ |
| 3 | Fresh production backup taken today | ✅ `backups/appData-main-2026-10-10-22:21.json` (134 KB) |
| 4 | `npm run build` clean — no test/mock artifacts in `public/` | ✅ |
| 5 | Production Firestore already at schemaVersion 2 | ✅ migration ran during earlier testing session |
| 6 | Emulator smoke test | ⬜ Paul to confirm below |

### Smoke test results

| # | Item | Status |
|---|------|--------|
| 1 | Settings tab visible in sidebar, all fields save | ✅ Fixed 2026-10-11 |
| 2 | Appraisal v2 tab is 2nd tab (not hidden off-screen) | ✅ Fixed 2026-10-11 |
| 3 | Flip golden case: GDV £150k, refurb £20k, legals £3k, finance £5k → budget £110,800, SDLT £5,276.19 | ✅ Confirmed 2026-10-12 |
| 4 | BRRR/bridging panel: day-one release £63,350 for golden inputs | ✅ Confirmed 2026-10-12 |
| 5 | Funnel tab renders; add a viewing against a lead | ✅ Confirmed 2026-10-12 |
| 6 | Agents tab: add an agent, save, reload — persists | ✅ Confirmed 2026-10-12 |
| 7 | Screener drill-down: district table scrolls L/R on mobile width | ✅ Fixed 2026-10-11 |
| 8 | Deal screen readable at ≤400px viewport width | ✅ Confirmed 2026-10-12 |

---

## P09 — Security Review · 10 October 2026

**Reviewer:** Claude Code security-reviewer subagent (independent pass, 45 files, P00–P08 scope)

**Results:** 0 Critical · 2 High · 2 Medium · 2 Low · 22 None

**Fixes applied (2026-10-10 follow-up):**
- **D (High — resolved):** `npm audit fix` (non-breaking) + `firebase-admin@14.5.0` in `functions/`. Result: 0 vulnerabilities in functions/. Tested on emulator — all 10 functions loaded, app functional.
- **E (High — accepted risk):** Firebase JS client `@grpc/grpc-js` advisory: unfixable in firebase@12.x without a major downgrade. Updated firebase@12.17.1 → 12.19.0 (latest 12.x patch). Advisory has no runtime impact — grpc transport is not used by the browser Firebase SDK (uses WebChannel/HTTP).
- Remaining dev-tool advisories (vitest/tinypool test-time, tailwindcss/braces build-time, esbuild dev-server-only) accepted as non-production risks.

**Open items not blocking release (Medium/Low):**
- B: SSRF host allow-list in `recheckLeadStatus` (defence-in-depth; auth gate is primary protection)
- C: Guard `ANTHROPIC_API_URL_OVERRIDE` / `EPC_API_URL_OVERRIDE` behind `FUNCTIONS_EMULATOR` env check
- A: Emulator hooks in prod bundle (inert without `?useEmulator=1`)

**Full log:** `docs/SECURITY_LOG.md` — 2026-10-10 entry, findings #1–28

---

## P08 — National Area Screener · 10 October 2026

**Files created:**
- `src/components/ScreenerView.jsx` — 600-line React component: strategy toggle (Flip/BRRR), property type, max entry price, nation filter, per-factor weights panel (0–10, with reset), sortable council table with rank, score, price, yield, 12m growth, sales, flip rate columns, row drill-down to district table (E/W only), "Send to Sourcing" multi-select action, OGL footer
- `public/data/screener.json` — pre-built data: 360 councils, 4,452 district rows, 0.7 MB (HPI, PIPR, Price Paid)
- `docs/SCREENER_BRIEF.md` — build brief documenting data contract, scoring spec, open items, acceptance checks
- `docs/SECURITY_LOG.md` — security review log (2 entries: data build + UI)
- `docs/build_screener.py` — monthly data build (DuckDB + pandas)
- `docs/requirements-screener.txt` — Python dependencies

**Files modified:**
- `src/App.jsx` — `ScreenerView` already imported; "Area Screener" sidebar tab already present; `addTargetAreas` function and `tab === "screener"` render already wired; no changes needed
- `.gitignore` — `.screener-cache/` already present

**Tests:** 177/177 passing (no new pure-JS maths to unit test; scoring runs in-browser against real data)

**Acceptance checks (all pass):**
- BRRR / Terraced / £190k cap / England: Rochdale (5.87%, £172k), Oldham (6.02%, £184k), Tameside (6.04%, £184k) all appear
- Rochdale drill-down: OL11 (4 flips), OL12 (4 flips), OL16 (8 flips) — all non-zero
- No `dangerouslySetInnerHTML` anywhere in ScreenerView.jsx

**Security:** reviewed 2026-10-03 (data build) and 2026-10-03 (UI) — no outstanding issues. See `docs/SECURITY_LOG.md`.

**Key design decisions:**
- Scoring is browser-side: changing weights never requires a network call
- Missing factors excluded from that area's denominator; area flagged "partial data"
- NI gets no BRRR score (PIPR suppresses NI rents); shown as "No BRRR†" with footnote
- Distance factor hidden until ONS council centroids are added (open item #1 in brief)
- Monthly refresh: `python docs/build_screener.py` → `.\update-dealsdash.bat`

**Data model additions (additive — RULE 14):**
- `settings.screener` — `{ strategy, ptype, maxPrice, nations, flipWeights, brrrWeights }` written by ScreenerView via `applySettings`

---

## P07 — Viewing → Offer → Acceptance Funnel · 10 October 2026

**Files created:**
- `src/lib/appraisal/funnel.js` — pure helpers: `calcFunnelMonth`, `calcFunnelRolling`, `sortStandingOffers`, `calcPaceIndicator`, `isFollowUpDue`
- `src/lib/appraisal/__tests__/p07.test.js` — 17 tests: golden case (25 viewings/6 offers/1 accepted → 0.24/0.17), edge cases, standing offer sort, follow-up due flag, pace indicator

**Files modified:**
- `src/lib/appraisal/index.js` — `export * from "./funnel.js"` added
- `src/data/repo.js` — `agentsColRef`, `agentDocRef`, `saveAgent`, `deleteAgent` added (separate Firestore subcollection so agent history survives settings reset)
- `src/App.jsx`:
  - Import `calcFunnelMonth`, `calcFunnelRolling`, `sortStandingOffers`, `calcPaceIndicator`, `isFollowUpDue` from funnel.js
  - `viewings: []` + `pipelineStage: "Watching"` added to `newLead()` default
  - `agents` state + `agentsReady` gate + `onSnapshot` subscription added
  - `syncAgents` helper added
  - `FunnelView` component — viewing target progress bar, this-month and rolling-3-month funnel stats, standing offers list, pace indicator
  - `AgentsView` component — per-agent stats (viewings/offers/accepted/last-contact), 30-day stale flag, add/edit/delete agents
  - `SourcingView` signature extended: `agents`, `setAgents`, `settings`, `onSettingsChange`
  - View mode toggle extended from 2 tabs (List/Kanban) to 4 tabs (List/Kanban/Funnel/Agents)
  - `LeadCard` signature extended with `agents = []`; viewing log section added (date, type, agent select, offer checkbox + amount, outcome, follow-up date, notes)
  - `DEFAULT_SETTINGS.appraisal.viewingTargetPerMonth = 20` added
  - SourcingView call site updated to pass `agents`, `setAgents`, `settings`, `onSettingsChange`

**Tests:** 177/177 passing (+17 P07 tests)

**Key design decisions:**
- Agents live in `users/{uid}/agents/{agentId}` subcollection, separate from settings — agent history survives a settings reset
- Viewing target default = 20/month, editable inline in FunnelView
- Non-auction offer basis: `estResaleHigh − estRefurb − estLegalFinance` (per P07 spec decision)
- `acceptRate = accepted / offers` — uses offers denominator, not viewings; matches spec golden case (1/6 = 17%)
- Pace indicator is labelled "Illustrative only" — training data is too thin to rely on as a predictor
- FunnelBar uses `round2()` internally via `calcFunnelMonth`/`calcFunnelRolling`; display shows `Math.round(rate * 100)` integer percent

**Data model changes (additive — RULE 14):**
- `lead.viewings: []` — shape per viewing: `{ id, date (YYYY-MM-DD), type ("in_person"|"virtual"), agentId, offerMade, offerAmount, outcome ("none"|"accepted"|"rejected"|"standing"|"withdrawn"), followUpDate (YYYY-MM-DD), notes }`
- `settings.appraisal.viewingTargetPerMonth: 20` — default viewing target per month

---

## P06 — Refurb Survey Benchmarks & Construction-Type Flags · 10 October 2026

**Files created:**
- `src/lib/appraisal/construction.js` — `NON_STANDARD_KEYWORDS` array + `isLikelyNonStandard(wallsDescription)` pure helper
- `src/lib/appraisal/__tests__/p06.test.js` — 16 tests: 6 standard EPC strings → false, 4 non-standard strings → true, 6 edge cases (null, undefined, empty, case-insensitive, cavity not flagged, keyword array non-empty)

**Files modified:**
- `src/lib/appraisal/index.js` — `export * from "./construction.js"` added
- `src/modules/survey/data/rates.js` — 4 kerb-appeal rates added: `paint_ext` (£600), `door_composite_uplift` (£200), `glaze_clean` (£120), `frontage_clear` (£100)
- `src/modules/survey/data/checklist.js` — "Kerb appeal" group added to external zone (before "Grounds & boundaries"): 4 items (exterior paint, front door upgrade with `brrrWarn`, glazing clean, frontage tidy)
- `src/modules/survey/SurveyModule.jsx` — BRRR spec toggle on strategy tab (renders only when `strategy === "brrr"`); uplift ratio field + £1→£3 note on each walkthrough action; `brrrWarn` caution note
- `functions/index.js` — `checkEpcRegister` `.map()` extended to return `wallsDescription`, `builtForm`, `constructionAgeBand`, `propertyType` (handles both kebab-case API JSON and camelCase SDK variants)
- `src/App.jsx` — import `isLikelyNonStandard`; `construction: null` added to `newLead()`; `AreaIntelligencePanel` signature extended with `construction` / `onConstructionChange` props; construction signals section added to EPC results (non-standard banner + per-property walls description list); manual construction confirmation fields (type dropdown, frontage, notes); street notes section (construction mix, frontage mix, good/avoid end, other notes); non-standard confirmed warning banner; "Non-std construction" badge in lead card header
- `src/components/AppraisalV2Tab.jsx` — comparables rows extended with `construction` and `frontage` text fields; `addComp()` default object updated

**Tests:** 160/160 passing (+16 P06 tests)

**Key design decisions:**
- EPC construction detection is advisory only — `isLikelyNonStandard` suggests, user confirms manually via dropdown
- Both kebab-case (`walls-description`) and camelCase (`wallsDescription`) handled in Cloud Function, since MHCLG API behaviour varies across SDK versions
- `brrrWarn` flag marks cosmetic items (composite door, exterior paint) that tenants won't pay for — only surfaced when `survey.strategy === "brrr"` AND `survey.brrrSpec === true`
- Value-add uplift ratio < 3.0 shows caution note "Below £1→£3 rule of thumb — Illustrative"; ≥ 3.0 shows positive note
- `construction: null` is additive (RULE 14); existing leads return `undefined` from Firestore, treated as null throughout
- Non-standard badge in lead card header means the flag persists across all tabs, not just the Risk tab

**Data model changes (additive — RULE 14):**
- `lead.construction: null` added to `newLead()` default — shape: `{ confirmedType, frontage, notes, streetConstructionMix, streetFrontageMix, streetGoodAvoidEnd, streetNotes }`
- `epcCheck.properties[n].wallsDescription`, `.builtForm`, `.constructionAgeBand`, `.propertyType` — new fields on EPC results (existing cached results missing these fields degrade gracefully to null)
- `valuation.comparables[n].construction`, `.frontage` — new optional fields on appraisal comparables

---

## P05 — Auction Assessment v2 · 10 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/lib/appraisal/auction.js` — pure helpers: `mapLegalPackCostLines`, `auctionFlipWalkAway` (extracted so they can be unit-tested without jsdom)
- `src/components/AuctionAssessmentV2.jsx` — ~380-line React component for pre-bid auction assessment
- `src/lib/appraisal/__tests__/p05.test.js` — 10 tests: Daniel flip golden case (3), buyer's premium impact (2), legal pack fixture (5)

**Files modified:**
- `src/App.jsx` — import `AuctionAssessmentV2`; `auctionV2: null` added to `newLead()`; wired into `LeadCard` after `<TriageBlock>` for auction leads
- `src/lib/appraisal/index.js` — added `export * from "./auction.js"`

**Tests:** 144/144 passing (+10 P05 tests)

**Component sections:**
1. Verdict bar — PASS/WARN/FAIL with colour border; "(overridden)" tag when FAIL is bypassed
2. Valuation — worst/mid/best number fields, basis toggle; pre-filled from `lead.estResaleLow`/`lead.estResaleHigh`; override stored in `lead.auctionV2.valuation`
3. Cost lines — derived from lead fields (refurb, buyer's premium, seller fees, legal/finance) + most recent legal pack review fees; null amounts shown as "Unknown" badge (RULE 7)
4. Maximum offer — max bid price, SDLT, break-even sale, target sale; editable profit target %; SDLT illustrative label
5. Walk-away tests — 5 tests: value, costs, profit margin, resilience (−10%), AIP
6. AIP checkbox — stored in `lead.auctionV2.aipRecorded`
7. FAIL override — text reason required; stored in `lead.auctionV2.overrideReason`; shows "Remove override" link when set
8. "Ready to bid" bar — hidden on FAIL unless overridden; triggers bid sheet
9. Bid sheet (collapsible + printable) — max bid, SDLT, break-even sale, worst-case value, total costs, target sale, AIP status, top 3 risks, auction house/lot/completion details, SDLT disclaimer, Print/PDF button

**Data model changes (additive — RULE 14):**
- `lead.auctionV2: null` added to `newLead()` default
- At runtime: `lead.auctionV2 = { valuation:{worst,mid,best,basis,comparables}, profitPct, aipRecorded, overrideReason }`
- All cost lines computed on the fly from existing lead fields — not stored (no new Firestore fields for costs)

**Key design decisions:**
- Cost lines are derived (not stored): lead fields + legal pack review fees = ephemeral computation in `useMemo`
- Auction flip uses a separate `auctionFlipWalkAway()` (5 tests) — not the BRRR-oriented `walkAway()` from P01 (which tests refinance, ICR, cash flow)
- `mapLegalPackCostLines` and `auctionFlipWalkAway` extracted to `src/lib/appraisal/auction.js` (pure JS, no React) for testability — imported by both the component and the test file
- Override mechanism requires a written reason — stored on the lead so it appears in any audit

**Golden cases confirmed in tests:**
- Daniel scenario: worst £120k, refurb £18k, legals £7,600, 15% profit → `flipBudget = 76,400` ✓
- splitBudget(76,400, company, ENG) → price + SDLT = £76,400 ✓
- auctionFlipWalkAway with 3 comps, no null lines, AIP recorded → verdict "pass" ✓
- £1,500 buyer's premium reduces flipBudget by exactly £1,500 ✓
- Legal pack: 3 otherFees (£500, £150, null label) → 3 lines, 2 with amounts, 1 null → sumCosts incomplete ✓

**Gate:** P05 complete. Run one real auction lead end-to-end on the emulator to confirm the bid sheet renders. Await Paul's sign-off before proceeding to P06 (or next agreed phase).

---

## P04 — Funding Sources, Bridging Calculator and Capital Recycling · 10 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/lib/appraisal/__tests__/p04.test.js` — 14 tests: bridging golden case, finance→engine integration, recycling overrun fixture, capital cost

**Files modified:**
- `src/lib/migrations/v2.js` — `emptyV2Block()` adds capital allocation fields (`capitalAllocated`, `capitalDeployedAt`, `capitalExpectedReturnAt`, `capitalReturnedAt`, `useComputedFinance`); `FundingSource` typedef extended with broker/valuation/lenderLegal/admin/extensionRate fields
- `src/components/AppraisalV2Tab.jsx` — bridging calculator panel + finance cost toggle + capital allocation section
- `src/App.jsx` — `PrivateCapitalTracker` component added to `BusinessPlannerView`; imports `recycling`, `capitalCost`

**Tests:** 134/134 passing (+14 P04 tests)

**New sections in AppraisalV2Tab:**
1. **Funding & bridging panel** — bridge source form (LTV%, rate, term, interest mode, arrangement/exit %, fee fields); toggle "use computed finance cost in engine" (reduces max offer by bridge total cost at term); bridging calculator outputs: gross loan, day-one release, finance cost at term, extension cost/month; shortfall warning when day-one release < purchase price + SDLT; redemption table at months 6/9/12/15; Daniel/classroom golden-case note
2. **Private capital allocation** — per-deal fields: allocated £, deployed date, expected return, actual return; computed interest cost; overrun/overdue warning flags

**PrivateCapitalTracker (BusinessPlannerView):**
- Uses `recycling()` from `capital.js` across all deals with `v2.capitalAllocated > 0`
- KPIs: pool size, deployed, idle, turns/year; overrun alert banner
- Cumulative accrued interest (active allocations)
- Allocations table: deal name, allocated, deployed date, expected return, interest cost, status (active/overdue/overrun/returned)
- Pool size and rate editable inline (existing settings fields)

**Golden case confirmed in tests:**
- £75k gross, 1%/month retained ×12, 1%/1% at start, broker £500, valuation £650 → day-one release **£63,350** ✓

**Key design decisions:**
- Bridge gross = `deal.price × ltvPct` (actual purchase price, not max offer — avoids circularity)
- Finance cost is opt-in (`useComputedFinance` toggle); off by default so existing max-offer figures are unchanged until Paul enables it
- Capital allocations stored on `deal.v2` (additive — RULE 14); no new Firestore collection needed

**Gate:** P04 complete. Awaiting Paul's sign-off before proceeding to P05 (Auction Walk-Away).

---

## P03 — Appraisal v2 UI · 10 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/components/AppraisalV2Tab.jsx` — ~500-line React component wiring the P01 engine into the deal detail view

**Files modified:**
- `src/App.jsx` — added `import AppraisalV2Tab`, added `"Appraisal v2"` to `DEAL_TABS`, added render block after Decision Brief tab
- `docs/appraisal-v2/CHANGELOG.md` — this entry

**Tests:** 120/120 passing (no new tests — UI tests require jsdom setup, noted as P03 follow-up)

**Component sections:**
1. Verdict bar — PASS/WARN/FAIL with colour border, lists failing walk-away test IDs
2. Max offer — Flip/BRRR strategy toggle; price, SDLT, budget, total project cost KPIs; SDLT `effectiveFrom` + `verifyAt` notice
3. Valuation — worst/mid/best number fields with segmented basis control; comparables table (add/remove)
4. Cost lines — label, amount (null renders "Unknown" badge — RULE 7), basis select, source, remove
5. Refinance — LTV, refi fees, accepted left in, lender route
6. Rental income — monthly rent, IO mortgage, net cash flow KPIs, ICR result
7. Four measures (RULE 10) — cash released, cash left in, equity, net monthly — always separate
8. Fragility — BRRR: break-even val + headroom + refi surplus; Flip: break-even sale + target sale
9. Stress tests — BRRR only, sorted worst-first, collapsed to 3, expand button
10. Walk-away tests — 5 tests with colour-coded borders
11. v1 comparison — shown when `settings.appraisal.showV1Comparison !== false`
12. Per-deal overrides — collapsible panel for profit%, ICR, min monthly, min headroom, left in, LTV

**Key implementation notes:**
- All cost lines passed as `refurb` to `flipBudget`/`brrrBudget` (P04 will add proper bridge cost modelling)
- Per-deal overrides fall back to global `settings.appraisal` thresholds
- `deal.v2 || {}` guard: component renders safely on pre-migration deals
- SDLT always computed as company buyer, England — `effectiveFrom: 2025-10-31` label shown with Illustrative tag
- Stress tests (BRRR only): 7 scenarios from `runStress`, sorted by `cfResult` ascending

**Gate:** P03 complete. Awaiting Paul's sign-off before proceeding to P04 (Funding & Capital phase).

---

## P02 — Data Model Migration · 10 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/lib/migrations/v2.js` — idempotent migration functions: `migrateV2Deal`, `migrateV2Settings`, `emptyV2Block`, `DEFAULT_APPRAISAL_SETTINGS`, `migrationSummary`
- `src/lib/migrations/v2.test.js` — 25 unit tests: settings migration, deal migration (empty/typical/idempotent/no-GDV variants), migrationSummary
- `src/lib/docSize.js` — Firestore document size guard: `estimateDocSize`, `checkDocSize` (warn at 700 KB, block at 950 KB)

**Files modified:**
- `src/data/repo.js` — `saveDeal` now checks document size; throws if ≥ 950 KB, warns if ≥ 700 KB
- `src/data/migrate.js` — added Pass 3 (schemaVersion 2 → 3): adds `deal.v2` block to all deals and `settings.appraisal` block; logs prefill summary
- `src/App.jsx` — `newDeal()` now includes `v2: emptyV2Block()` so new deals start with the v2 structure; added import for `emptyV2Block`

**Tests:** 120/120 passing (+25 migration tests)

**Schema changes (additive only — RULE 14):**
- `deal.v2` block added to all existing deals (pre-filled from v1 fields where unambiguous)
- `settings.appraisal` block added with illustrative defaults (ICR 1.25, profitPct 0.15, etc.)
- `schemaVersion` bumped: 2 → 3; `migratedV3At` timestamp added

**Pre-fill summary (from migration logic):**
- `v2.valuation.worst` — pre-filled when `gdvOverride > 0` (singlePoint mode)
- `v2.valuation.comparables` — pre-filled from `deal.comps` where no GDV override exists
- `v2.costLines` — pre-filled from `refurbItems` (average of low/high; zero-both-ends excluded per RULE 7)
- `v2.funding.sources[0]` — pre-filled from `fundingMode`, `bridgeLTV`, `bridgeMonthlyRate`, etc.
- `v2.refinance.ltv` — pre-filled from `btlLtv`
- `v2.rent.monthly` — pre-filled from `monthlyRent` where > 0

**v1 fields preserved:** All existing deal fields untouched (RULE 14). v1 engine still runs alongside v2 while `showV1Comparison: true` (from `DEFAULT_APPRAISAL_SETTINGS`).

**Gate:** P02 complete. Awaiting Paul's sign-off before proceeding to P03 (Deals Appraisal UI).

---

## P01 — Pure Calculation Engine · 9 October 2026

**Branch:** feature/appraisal-v2

**Files created:**
- `src/lib/appraisal/costs.js` — CostLine type, sumCosts (null propagation)
- `src/lib/appraisal/valuation.js` — three-point valuation, basisValue, toValuation
- `src/lib/appraisal/sdlt.js` — data-driven SDLT with effectiveFrom/verifyAt; Scotland/Wales guard; FTB warning
- `src/lib/appraisal/solve.js` — bisection maxPrice solver; splitBudget
- `src/lib/appraisal/bridging.js` — bridgeRelease (simple interest for retained day-one deduction)
- `src/lib/appraisal/flip.js` — flipBudget, flipMaxOffer, flipBreakEvenSale, flipTargetSale
- `src/lib/appraisal/brrr.js` — brrrBudget, brrrMaxOffer, breakEvenValuation, headroomPct, refiPosition, cashLeftIn
- `src/lib/appraisal/capital.js` — capitalCost, recycling
- `src/lib/appraisal/cashflow.js` — netMonthly, icrPass, monthlyMortgage
- `src/lib/appraisal/stress.js` — 7 stress scenarios
- `src/lib/appraisal/walkaway.js` — 5 walk-away tests with verdict
- `src/lib/appraisal/index.js` — public re-export barrel
- `src/lib/appraisal/__tests__/golden.test.js` — 13 golden cases (written first, confirmed failing)
- `src/lib/appraisal/__tests__/additional.test.js` — 48 formula verification + edge case tests

**Tests:** 95/95 passing (was 34/34 before P01; +61 new tests)

**Golden case table — expected vs actual:**

| Test | Expected | Actual | Status |
|---|---|---|---|
| flipBudget (15% profit) | 110800 | 110800 | ✓ |
| splitBudget 110800 company → price | 105523.81 | 105523.81 | ✓ |
| splitBudget 110800 company → SDLT | 5276.19 | 5276.19 | ✓ |
| brrrBudget £20k left in | 200000 | 200000 | ✓ |
| brrrBudget all money out | 180000 | 180000 | ✓ |
| splitBudget 200000 company → price | 189252.34 | 189252.34 | ✓ |
| splitBudget 200000 company → SDLT | 10747.66 | 10747.66 | ✓ |
| bridgeRelease dayOneRelease | 63350 | 63350 | ✓ |
| breakEvenValuation Katie | 268666.67 | 268666.67 | ✓ |
| headroomPct 270k vs 268666 | ≈0.0049 | 0.0049 | ✓ |
| refiPosition 280k | 8500 | 8500 | ✓ |
| refiPosition 270k | 1000 | 1000 | ✓ |
| refiPosition 260k | −6500 | −6500 | ✓ |
| refiPosition 250k | −14000 | −14000 | ✓ |
| refiPosition 240k | −21500 | −21500 | ✓ |
| refiPosition Sean 85k | 12250 | 12250 | ✓ |
| null propagation legals:null | incomplete | incomplete | ✓ |
| Scotland SDLT → unsupported | unsupported | unsupported | ✓ |
| FTB → warning, standard rate | warning | warning | ✓ |

**Engine discrepancy (v1 vs v2) — Paul must decide before P02:**

| Aspect | v1 (App.jsx `calcBridgeInterest`) | v2 (`bridgeRelease`) | Impact |
|---|---|---|---|
| Retained bridge interest | **Compound** `loan × ((1+r)^n − 1)` | **Simple** `loan × r × n` | £75k at 1%/mo for 12mo: compound = £9504, simple = £9000. Difference of **£504** on the day-one release. |

For the training golden case (Katie), simple interest (£9000) matches the expected release of £63,350. Compound would give £62,846. **v2 (simple) is correct for that deal; v1 compound will be retired in P02 once confirmed.**

**Open questions for Paul before P02:**
1. Confirm the illustrative defaults in DECISIONS.md (flip profit % 15%, ICR 125%/5.5%, min net monthly £150, etc.)
2. Confirm simple vs compound interest is correct for your specific lenders (v2 uses simple — matches training golden case).
3. Did the backup script (`node scripts/backup-firestore.js`) run successfully?

**Gate:** Awaiting Paul's sign-off before wiring the v2 engine into the UI (P02).

---

## P00 — Audit and Setup · 9 October 2026

**Files created:**
- `docs/appraisal-v2/AUDIT_FINDINGS.md` — full codebase audit (folder structure, engine, SDLT, costs, data model, tests, Cloud Functions, Firestore rules, reuse/build table)
- `docs/appraisal-v2/CHANGELOG.md` — this file
- `CLAUDE.md` — project-level instructions + Appraisal v2 rules summary (all 20 rules, decisions)
- `scripts/backup-firestore.js` — export script for `users/{uid}` subcollections to `backups/`

**Files modified:**
- `.gitignore` — added `backups/` entry

**Branch created:** `feature/appraisal-v2` from `main` (commit a623c3d)

**No application code was changed in P00.**

**Tests:** 34/34 passing (no new tests — P01 adds the golden cases).

**Key audit findings:**
- Calculation engine is a monolith in `src/App.jsx`; must be extracted to `src/lib/appraisal/` in P01.
- `appraiseDeal()` has no worst/mid/best split — single GDV only.
- Null-not-zero: all cost fields default to 0 on blank — v2 must introduce the null model.
- SDLT: no company-specific table; Scotland/Wales disclaimer shown but England calculation still runs (silent bug).
- Day-one bridge release not modelled; profit-first stack not implemented; break-even valuation not calculated.
- 0 test coverage on `appraiseDeal()`, `solveMaxBid()`, or any golden cases from the training.
- EPC API returns band only; construction fields (walls-description, built-form, construction-age-band) not fetched.
- Backup script written but NOT yet run against production — Paul must run it and confirm.

**Gate:** Waiting for Paul's answers to P00 clarifying questions before proceeding to P01.
