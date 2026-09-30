# 05 — One-Page Decision Brief (BUY / WATCH / PASS) with Audit Trail

## Goal
Generate a one-page brief for any deal: a BUY / WATCH / PASS recommendation, max bid, walk-away price, valuation, funding summary, risk register and open questions. **Every figure traces back to its source.** The same brief is used for bid decisions and as the core of a bridging lender's application pack.

Inspired by Estately's IC Brief. DealsDash differences: transparent rule-based recommendation (no black-box score) and sources that include the owner's own survey and legal pack.

## Before you start
- Confirm which PDF approach exists in the project. If none, use `@react-pdf/renderer` (maintained, works client-side). Do not hand-build PDF generation.
- Confirm that prompts 02, 03 and 04 are complete; the brief reads their outputs.

## Recommendation logic (transparent)
Rules live in the buy box `reportDefaults.decisionRules` and are evaluated in `src/lib/decision.js` (pure, unit-tested):
- **PASS** if any hard fail: a gating question failed; a legal pack red flag unresolved; outside buy box on a hard filter; profit on cost < minimum; ICR fails and strategy is BRRR-only.
- **BUY** if all thresholds met: profit on cost ≥ target, profit ≥ £ minimum, money left in ≤ max (BRRR), all Bid Ready gate items complete.
- **WATCH** otherwise.
The brief prints **which rules decided the outcome** ("PASS — lease 68 yrs < 90 minimum").

## Content (one A4 page; second page only for the audit appendix)
1. Header: VIXIV LTD, deal address, date, brief version, recommendation badge.
2. Headline stats: max bid, walk-away, GDV, profit / money left in, cash required, fund days tied up.
3. Valuation table: guide/asking, max bid, GDV, comparables used (count, date range, confidence).
4. Funding summary from 03 (chosen mode) incl. ICR result.
5. Risk register: top risks (legal pack flags, flood, IMD, EPC, refurb unknowns) — rating Low/Med/High, mitigation.
6. Open questions: anything unverified or illustrative.
7. Footer: "Illustrative analysis for internal decision-making. Not financial or legal advice." + data source attribution (07).

## Audit trail
Each figure in the brief carries `{ value, source, sourceRef, retrievedAt, isIllustrative }`, e.g. source `legalPack`, sourceRef `Special Conditions cl. 12.3`; source `landRegistryPPD`, sourceRef `3 comps, OL11, Jan–Jun 2026`. The appendix lists them all. Illustrative values are visibly marked (e.g. dagger symbol with legend).

## Storage and versioning
Save each generated brief's input snapshot to `deals/{dealId}/briefs/{briefId}` (not the PDF binary — regenerate on demand). Show brief history; highlight what changed between versions.

## UI
"Generate brief" button on the deal and in the Bid Ready gate. Preview in-app first (HTML using design tokens), then download PDF. Colours from tokens; print-safe in light theme regardless of app theme.

## Acceptance criteria
- Recommendation and the deciding rules match unit-tested cases.
- Every number in the PDF appears in the audit appendix with a source.
- Brief fits one A4 page (excluding appendix) for a typical deal.
- Regenerating with unchanged inputs gives an identical result.
