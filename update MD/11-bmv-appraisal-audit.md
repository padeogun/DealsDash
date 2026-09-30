# 11 — BMV Appraisal Tool vs DealsDash: Audit (no code changes)

**TASK: Audit only.** Compare the standalone BMV Appraisal tool against the DealsDash codebase and report the gaps. **Do not change any code until the owner confirms.**

> Run this **before prompts 02, 03 and 05**. The standalone tool already contains a working appraisal, max-offer and verdict engine, so its findings may replace parts of those prompts (see "Reconciliation" below).

## Context
- The standalone tool's source is in this repo at `prompts/reference/bmv-appraisal-standalone.html` (a single HTML file; all logic is in one `<script>`). Claude Code cannot open claude.ai artifact links, so work from this file. Key functions: `deriveGrade`, `sdlt`, `corpTax`, `comps`, `worksTotals`, `appraise`, `maxOffer`, `sensitivity`, `verdict`, `nextActions`, `aiDraft`, `reportMD`; constants `DEFAULT_CFG`, `ELEMENTS`, `RED_FLAGS`, `SCENARIOS`, `CATS`.
- Work from the current DealsDash source and **cite file and function names for every finding**.
- Don't infer from memory or old documentation. Anything you can't verify in code, mark **UNVERIFIED**.

## Step 1: Inventory DealsDash
List what exists, with file/function references:
- Refurb Survey module
- Deals appraisal engine
- Auction Assessment (max-bid solver, strategy profile)
- Legal Pack Review
- EPC integration
- Area Intelligence
- Any rate library or benchmark rates
- The Firestore model at `users/{uid}/appData/main` (or its replacement, if prompt 01 has already run)

## Step 2: Feature comparison
Classify each feature as **PRESENT**, **PARTIAL**, **MISSING** or **BETTER IN DEALSDASH**, with evidence.

*Condition and scope*
1. RICS condition ratings (CR1–3) on about 30 elements (external, internal, services, safety), each with a note
2. Refurb grade (light/medium/heavy) derived from the ratings, not chosen by the user
3. Grade drives contingency (10/15/20%) and programme length (4/10/18 weeks)
4. Separate target standards per deal: SELL (mortgageable, Building Regs sign-offs) vs LET (full private-rental compliance: gas safety record, EICR, alarm regulations, MEES, HHSRS, Renters' Rights Act)
5. Works items tagged SELL/LET/BOTH; flip costed on the sell scope, BRRR on the let scope
6. Each works item carries: category, quantity and unit, min–max rate, source tag [RATE/QUOTE/EST/USER], priority (Critical/Required/Value-add/Optional), regulatory reference, certificate produced
7. Claude drafts the works list from property facts, condition ratings and standard; prices from the rate library by key; unmatched items tagged EST; redrafting keeps user-edited items
8. Rate library of about 48 illustrative North West items, editable, each with source and date
9. Cost basis toggle (min/mid/max) and a regional cost factor

*Valuation*
10. Weighted comparables with a time/condition adjustment %, as-is vs refurbished basis, and a confidence rating (High/Medium/Low)
11. BMV measured against as-is value; the gap to ARV shown separately and labelled "not a BMV measure"

*Appraisal*
12. SDLT by band, with the 5% higher rates for company/additional purchases and the under-£40k exemption
13. Bridging: LTV on purchase plus optional share of works funded, monthly interest, arrangement/exit/broker fees
14. Flip and BRRR side by side
15. Flip: profit, profit on GDV, profit on cost, return on cash (absolute and annualised), indicative corporation tax with marginal relief
16. BRRR: refinance valuation with a prudence haircut, new loan capped by ICR at the stress rate, 6-month minimum ownership, money left in, monthly cashflow, net yield, return on money left in
17. Maximum offer per strategy by bisection, with the binding constraint and headroom against the asking price
18. Sensitivity grid: ARV −5%/−10%, works +15%/+30%, programme +3 months, rates +1 point, rent −10%, combined ARV −10% / works +15%

*Verdict and output*
19. Red-flag screen of 12 flags (Clear/Suspected/Confirmed), critical flags marked; mitigation costs added to both works scopes
20. Verdict rules: NO-GO / CONDITIONAL GO / GO, recommended strategy, list of conditions
21. Auto-generated next actions
22. Verification register: regulations and rates to confirm, with the date each was confirmed
23. Markdown report and JSON export
24. Running summary bar (works, flip profit, BRRR left in and cashflow, verdict)

## Step 3: Calculation parity
Run this test deal through DealsDash's engine and compare with the standalone results.

**Test deal**
- Property: 2-bed terraced, 70 m², auction purchase £95,000, buyer's premium £3,000
- Purchaser: company
- As-is comparables: £100,000 (10 Jan 2026), £108,000 (1 Oct 2025)
- Refurbished comparables: £150,000 (1 Mar 2026), £155,000 (1 Dec 2025), £149,000 (1 Jun 2026)
- Rent: £825 pcm
- Condition: kitchen CR3; bathroom, electrics, decoration and damp CR2; roof CR1 → MEDIUM grade
- Works (mid basis), BOTH: kitchen £4,000–7,000; bathroom £3,500–5,500; rewire £3,500–5,000; decoration 70 m² at £20–35 (all construction); EPC £60–100 (Professional & statutory)
- Works (mid basis), LET only: EICR £150–250; gas safety record £60–90 — **both Professional & statutory** (so no contingency applies to them)

**Default settings**
- Acquisition: legal £1,500, survey £500
- Holding: £130 + £45 + £80 per month
- Bridge: 0.85%/month, 70% LTV on purchase price, 2% arrangement, 0.5% broker, £450 valuation, £1,500 legal, no exit fee, no works funded
- Sale: agent 1.2% + VAT, conveyancing £1,200, 4 months to sell
- Refinance: 75% LTV, 5% prudence haircut, 5.5% pay and stress rate, ICR 1.25, 2% product fee, £450 valuation, £1,200 legal, 6-month minimum ownership, 1-month refinance process
- Letting: voids 8%, management 12% + VAT, maintenance 8%, insurance £350/yr, 1 month to let
- Targets: flip 20% on GDV and 25% on cost; BRRR money left in ≤ £0 and cashflow ≥ £200/month

**Standalone results** (reproduced by running the standalone code, 28 Sep 2026)
| Metric | Value |
|---|---|
| SDLT | £4,750 |
| Total acquisition (price + SDLT + legal + survey + premium) | £104,750 |
| As-is value / ARV | £104,000 / £151,333 (ARV confidence High) |
| Programme | 10 weeks = 2.31 months |
| Works — sell scope / let scope | £18,681 / £18,956 |
| Flip: months held | 6.31 (programme + 4 to sell) |
| Flip: bridge loan / interest / fees | £66,500 / £3,566 / £3,613 |
| Flip: holding / sale costs | £1,609 / £3,379 |
| Flip: total cost / profit | £135,598 / £15,735 |
| Flip: profit on GDV / on cost | 10.4% / 11.6% |
| Flip: indicative corporation tax | £2,990 |
| Flip: maximum offer | £81,500 (binding: profit on GDV) |
| BRRR: bridge months | 6 (minimum ownership binds) |
| BRRR: total cost before refinance | £131,554 |
| BRRR: refinance value / LTV loan / ICR max loan | £143,767 / £107,825 / £144,000 |
| BRRR: new loan / refinance costs | £107,825 / £3,807 |
| BRRR: money left in | £27,536 |
| BRRR: net operating income / cashflow | £6,654 a year / £60 a month |
| BRRR: maximum offer | None — cashflow target fails at any price |

Report each figure side by side and explain every difference: a different method, a missing cost line, or a bug in either tool.

**Known method points in the standalone to check against DealsDash** (not necessarily bugs; state which approach DealsDash takes):
- Rent received between letting and refinance (months 3.3 to 6 here) is not credited against holding costs — conservative.
- Buyer's premium is a fixed amount in the max-offer search; in practice it is often a percentage or a minimum fee.
- ARV confidence uses today's date (`Date.now()`) rather than `DEFAULT_CFG.asAt`, so the High/Medium rating can change over time for the same inputs.
- Corporation tax is per deal, not per company year; marginal relief limits ignore associated companies. Indicative only.
- "Weighted comparables" means user-entered weights and adjustment %; there is no automatic time weighting.

## Step 4: Integration plan
For each MISSING or PARTIAL feature:
- Where it would plug in (module and file)
- Data model changes, including the effect on the single-document Firestore model and its 1 MB limit (the standalone already stores one document per deal plus `settings` and `rates` — compare with prompt 01's target structure)
- Effort (S/M/L) and value (H/M/L)
- Any conflict with existing logic

Also:
- Flag anything that would reinvent what DealsDash already does better. Prefer reusing DealsDash's EPC, area and legal pack prefill.
- Say whether the standalone calculation code can be ported as a pure module (e.g. `src/lib/appraisal.js` with unit tests) or needs rewriting. Note: the calculation functions have no DOM dependencies; storage uses the artifact runtime (`claude.use("db")`) and localStorage, which must be replaced with the DealsDash data layer.
- Say whether the seed rates should fill the Refurb Survey's placeholder rates until mentor-supplied rates arrive. They must stay labelled illustrative and be editable in the app (no hard-coded figures — see README rule 6).

## Reconciliation with the rest of the prompt pack
Report conflicts and recommend one approach for each:
- **Prompt 02 (buy box):** the standalone `DEFAULT_CFG` and rate library overlap with buy-box assumptions. Propose a single settings model.
- **Prompt 03 (funding planner):** items 13–17 cover most of it. Say what 03 adds (fund-usage layer, mortgage purchase mode, legal-pack fee pull) and whether 03 should be rewritten as an extension of the ported engine.
- **Prompt 05 (decision brief):** standalone uses GO / CONDITIONAL GO / NO-GO; prompt 05 uses BUY / WATCH / PASS. Recommend one vocabulary.
- **Prompt 04 (pipeline gates):** whether the verdict and next actions should feed the Bid Ready gate.

## Output
1. **Summary verdict:** how much value porting adds, with a confidence score
2. **Feature comparison table:** # | Feature | Status | DealsDash evidence (file:function) | Notes
3. **Parity table:** Metric | DealsDash | Standalone | Difference | Cause
4. **Ranked port list:** Feature | Value | Effort | Location (module/file) | Conflicts | Recommended order
5. **Reconciliation decisions** for prompts 02–05
6. **UNVERIFIED items** and open questions for the owner

Save the report as `docs/bmv-audit-findings.md`. Do not change any code.
