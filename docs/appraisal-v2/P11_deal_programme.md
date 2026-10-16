# P11 — Deal Programme (schedule, Gantt / list, appraisal link)

**Read first:** `RULES.md`, `AUDIT_FINDINGS.md`, `DECISIONS.md` (all in `docs/appraisal-v2/`), `src/lib/appraisal/`, and the reference workbook `docs/appraisal-v2/reference/VIXIV_Flip_Programme_Template.xlsx` (tabs: Guide, Deal 1, Deal 2, Pipeline, DD Checklist, Holidays). The workbook is the **specification**: its activity list, logic and example dates are the golden cases.

**Depends on:** P01–P10 and follow-up phases A1–E, all complete as of 12 Oct 2026 (see `CHANGELOG.md`). Respect the current 7-tab deal layout (Property, Appraisal, Finance, Returns, Progress, Decision, Legal) and the Phase A1 cost model.

## Goal
Every deal gets a programme from *deal secured* to *sale completed*: 54 template activities with finish-to-start / start-to-start logic, route switch (Auction / Estate agent), scope switches, hold points and flags. Paul can switch between a **status list** and a **Gantt chart** on desktop and phone. Programme dates produce a **programme-based holding and finance cost that sits alongside the manual figure** for comparison. It does **not** replace the manual input or change the verdict.

## Decisions already made (do not re-open)
- P11 runs after P05.
- Programme-derived holding/finance cost is shown **beside** the manual input with the difference; the manual figure still drives the v2 verdict.
- The Gantt must work on a phone. The user can switch between List and Gantt views at any screen size.
- Durations are working days. Non-working days = England & Wales bank holidays + Paul's editable custom days (trade shutdown, crew holidays).

## 0. Reuse before build (record choices in `DECISIONS.md`)
1. **Gantt.** The build is **esbuild (IIFE bundle) + separately compiled Tailwind v3**, so a library must bundle cleanly with esbuild, and any library CSS must be importable without a new loader. Candidates, in order:
   - (a) **Recharts**, already a dependency: a horizontal stacked bar chart, offset + duration, as a Gantt. No new package.
   - (b) a lightweight CSS-grid week view (one row per activity, bars as positioned divs). This is display-only, so it's a small component, not a scheduler.
   - (c) a maintained, MIT/Apache-licensed React Gantt library, **only if** (a) and (b) can't meet phone use at 375 px.

   Present a short comparison at the gate covering bundle size, touch scrolling and today line. **The scheduling maths must live in our own pure module either way.** Never rely on a chart library's internal date logic.
2. **Dates.** No date library is installed. Prefer small pure helpers on ISO `YYYY-MM-DD` strings (UTC-safe, date-only, no times). Propose `date-fns` only if the helpers become non-trivial, and ask before adding it.
3. **Bank holidays.** Source: GOV.UK `https://www.gov.uk/bank-holidays.json`, division `england-and-wales`. Test the request from the browser first. If CORS blocks it, follow the existing Cloud Function proxy pattern (as used for EPC). Cache the response with its fetch date. Bundle a fallback JSON (2026–2028) tagged *"verify at gov.uk/bank-holidays"* and show that tag in the UI whenever the fallback is in use. Tests use a **fixed holiday fixture**, never a live fetch.

## 1. Golden tests FIRST (`src/lib/programme/__tests__/`), all failing before implementation

Holiday fixture = exactly the dates on the workbook's Holidays tab, including the trade shutdown days 29–31 Dec 2026 and 29–31 Dec 2027. Default inputs: contingency 15% (rounded up per activity), winter drying +3 WD, auction completion 28 calendar days, agent exchange → completion 10 WD, 30 WD to agree a sale, sale exchange → completion 10 WD, retention release 60 WD after practical completion.

| Case | Inputs | Expected |
| --- | --- | --- |
| Deal 1 (auction) | Secured 2026-12-10; scope: pre-2000 Y, structural N, damp Y, roof N, windows N, rewire Y, heating Y, kitchen Y, bathroom Y | Completion **2027-01-07**; works start **2027-01-15**; practical completion **2027-04-08**; listed **2027-04-13**; sale agreed **2027-05-26**; sale completed **2027-08-06**; build **58** WD |
| Deal 1 finance flag | Same | A11 (lender legals) finishes 2027-01-08, after completion 2027-01-07 → flag `financeLate` **on** |
| Deal 2 (estate agent) | Secured 2027-02-01; as Deal 1 but windows Y | Completion **2027-03-31**; works start **2027-04-08**; PC **2027-06-25**; listed **2027-06-30**; sale agreed **2027-08-11**; sale completed **2027-10-22**; build **55** WD |
| Winter drying | Deal 1 E2 | Duration **8** WD (5 + 3) and the winter flag is set; Deal 2 E2 = **5** WD |
| Skipped pass-through | Deal 1 C3 (structural = N) | Start 2027-01-25, finish 2027-01-22, duration 0; D3 still starts **2027-01-29** |
| Pipeline crew check | Deal 1 + Deal 2 | **No overlap** (Deal 2 works start = Deal 1 PC; strict inequality) |
| Actuals reschedule | Deal 1 with C1 actual finish 2 WD late | PC moves **2 WD later**; variance = +2 WD |
| Bad input | Secured date missing | `{ status:'incomplete', missing:['dealSecured'] }`, with no dates generated (null is not zero) |

If any golden date differs, **stop and report**. Do not change the expected values to make tests pass.

## 2. Pure scheduler — `src/lib/programme/` (no React, no Firebase)
- `calendar.js`: `isWorkday`, `addWorkdays(date, n, holidays)` (n may be negative, matching Excel `WORKDAY`), `networkdays`.
- `template.js`: the 54 activities as data, transcribed from the workbook: `id, phase, name, owner, route, scope, hold, durAuction, durAgent, contingency, preds[{id,type:'FS'|'SS'}], lag, flagKey, note`. Versioned (`templateVersion: 1`).
- `schedule.js`: `schedule(template, inputs, holidays, actuals)` → activities with `applies, durationUsed, start, finish, flags`, plus `keyDates`. Rules, each with an inline comment:
  - FS: start = addWorkdays(predFinish, 1 + lag). SS: start = addWorkdays(predStart, lag). Multiple predecessors → latest.
  - Finish = addWorkdays(start, duration − 1). Milestone (duration 0): finish = start.
  - Not applicable (route or scope): finish = addWorkdays(start, −1), so successors are unaffected.
  - Auction completion = next workday on or after secured + 28 calendar days. Agent route = max(exchange + 10 WD, lender legals + 1 WD).
  - Contingency: ceil(base × (1 + pct)) on activities flagged contingency.
  - Winter drying: +N WD when E2 starts in Nov–Feb.
  - Actuals override the forecast: an activity with an actual finish drives its successors from that date.
- `flags.js`: hold, winter external, slow-month listing (Aug/Nov/Dec), finance late, bridge term exceeded.
- `pipeline.js`: crew clash (strict overlap of works start → PC) and capital overlap days across all active deals.
- `holding.js`: programme-based holding months (completion → sale completed), then cost via the **existing** `holdingCostLine()` / `holdingMonthlyRate()` (`src/lib/appraisal/costs.js`) and the P04 bridging functions. Compare with the deal's current `totalProjectMonths()`. No new finance maths.

## 3. Data model (backup first, RULE 13)
- Store each programme in a **subcollection of its deal**, following the existing `deals/{id}/briefs/{id}` pattern: `users/{uid}/deals/{dealId}/programme/main` = `{ schemaVersion: 1, templateVersion, inputs, scope, overrides{activityId:{dur,lag}}, status{activityId}, actuals{activityId:{start,finish}}, customNonWorkdays[], updatedAt }`.
- Custom non-working days that apply to every deal (trade shutdown) go in `settings/app` as an additive field, defaulting to `[]`.
- The deal document itself is **not changed**. Existing deals open unchanged; a deal without a programme shows "Create programme".
- Firestore rules: extend the existing owner-only rule (`ALLOWED_EMAIL` pattern) to the new subcollection, and add an emulator rules test that another uid cannot read it. Note: `npm run deploy:hosting` also deploys `firestore:rules`.

## 4. Appraisal link (side by side, not driving)
On the Deals appraisal, add a "Programme check" row: **Manual holding/finance £X | Programme-based £Y | Difference £Z**, with months owned and the bridge headroom. Label it *"Comparison only. Verdict uses the manual figure."* If the programme months exceed the bridge term, show a warning. The delayed-exit stress test shows the programme-based months as a reference.

## 5. Auction Assessment link (P05)
For an auction lead, prefill the deal-secured date from the auction date and the route as Auction. Show the finance-late flag and any Christmas or slow-month flags on the **bid sheet**.

## 6. UI — Programme section in the existing **Progress** tab (VIXIV Design System components only)
Do not add an eighth tab. Progress already holds the timeline, holding and survey; the programme becomes its main section, and the existing timeline/holding content stays below unchanged. If the existing timeline duplicates programme dates, list the overlap at the gate and propose a merge. Do not merge without approval.
- **View switch:** `Segmented` control: **List | Gantt**, available at all widths. Default to List below 640 px and Gantt above. Remember the choice per device in `localStorage`, wrapped in try/catch.
- **Inputs panel:** route, secured date, contractor, scope switches, contingency, winter allowance, sale assumptions. Every default is tagged *illustrative — verify*.
- **List view (phone-first):** grouped by phase and collapsible. Each row shows name, dates, a status chip, and a tap target of at least 44 px to set status or actual dates. Hold points are pinned and highlighted, flags shown inline. Skipped activities are hidden behind a "Show skipped" toggle.
- **Gantt view:** weekly scale (with day and month zoom if the library allows). A sticky short-name column, touch horizontal scroll, today line, milestone markers and colours by phase. Phase is also shown as text, so colour is never the only signal (WCAG AA). Works at 375 px wide.
- **Key dates card:** completion, works start, PC, listed, sale agreed, sale completed, months owned, bridge headroom.
- **Pipeline view (Business Planner):** all active deals on one phase-level timeline with the crew-clash and capital-overlap results, linked to the P04 capital tracker.
- **Template import:** a one-off script that reads the activity list and durations from the reference workbook (an existing xlsx parser, if one is already a dependency) and regenerates `template.js`. Paul's measured durations can then flow back after each close-out.

## 7. Security (feeds P09)
Log in `SECURITY_LOG.md`:
- Firestore rules for the new path.
- Validation of all date and number inputs (reject NaN, negative durations, dates outside 2020–2035).
- The bank-holiday fetch: a fixed URL only, a response schema check, and no user input in the request.
- The new dependency licences.

Re-run the P09 security-review agent on the diff before P10.

## Tests
- All golden cases in section 1 pass.
- Property tests: random scope combinations never produce a start earlier than a predecessor's finish (FS) or start (SS). Skipped activities never add working days.
- Integration: changing the secured date by 1 workday shifts sale completion by exactly 1 workday when no holiday is crossed.
- Emulator rules test for the new collection.
- Component tests: the view switch persists, and List and Gantt render the same activity count.

## Gate
Stop. Present:
1. The golden results table (expected vs actual).
2. The Gantt library comparison and the choice.
3. Screenshots of List and Gantt on desktop and at 375 px.
4. The "Programme check" row on a Rochdale test deal, with programme months vs `totalProjectMonths()`.
5. The Firestore rules diff and the emulator rules-test result.
6. The `CHANGELOG.md` and `DECISIONS.md` updates.

**Wait for Paul's approval.** P09 and P10 are then re-run before any release.
