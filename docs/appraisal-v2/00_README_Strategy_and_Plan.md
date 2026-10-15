# DealsDash — Appraisal Engine v2: Strategy and Build Plan

**Prepared:** 9 October 2026 · **Owner:** Paul (VIXIV LTD) · **Source knowledge:** Progressive Property Academy training day (9 Oct 2026), the annotated Masterclass review, and the knowledge brief in the *UK Property Business* project.

---

## 1. What this changes, in one paragraph

DealsDash already appraises deals and solves a maximum bid by bisection. v2 makes that engine **decide** rather than just calculate: every deal is stacked on a **worst-case end value**, the **profit target (flip) or accepted cash-left-in (BRRR) is deducted first**, bridging is modelled on its **day-one release**, every deal is run through **seven stress tests** and **five walk-away tests**, and the outputs keep **cash released, cash left in, equity and monthly cash flow as four separate numbers**. Around that core, the plan adds a capital-recycling tracker for the £50k family-and-friends fund, a viewing funnel, kerb-appeal benchmarks and construction-type flags, and (gated, experimental) a screen-before-you-view ranking.

## 2. Strategy: five principles

| # | Principle | Why it matters |
| --- | --- | --- |
| 1 | **One pure calculation engine, many screens.** All maths lives in `src/lib/appraisal/` as pure functions with unit tests. UI modules only call it. | One source of truth. Auction Assessment, Deals, Business Planner and the future Screener cannot drift apart. |
| 2 | **Tests before code (golden cases from the training).** The worked examples from the day become the first failing tests. | The numbers are known: £110,800, £200,000, £63,350, £268,667. If the engine reproduces them, it is right. |
| 3 | **Null is not zero.** A blank cost line is *unknown* and blocks a "Pass" verdict. | The commonest appraisal error is a missing cost silently treated as £0. |
| 4 | **Additive, backward-compatible data.** New fields get defaults and a `schemaVersion`; existing deals still open and still show their v1 result beside v2. | Single-document Firestore model (`users/{uid}/appData/main`) — a bad migration loses everything. Backup first. |
| 5 | **Assumptions are labelled.** Every default threshold (stress %, ICR, headroom) is configurable in Settings and tagged *illustrative — verify*. Tax rates carry an effective date and a GOV.UK check flag. | Matches VIXIV verification standards: illustrative figures flagged, open regulatory items surfaced in the tool. |

## 3. Architecture (target)

```
src/lib/appraisal/            ← NEW pure engine (no React, no Firebase)
  valuation.js                  best / mid / worst, basis selection, comparables summary
  costs.js                      cost-line model; null-vs-zero; totals
  sdlt.js                       data-driven rate tables (England/NI); company & additional-property rules
  bridging.js                   day-one release, redemption at month m, extension cost
  capital.js                    private-lender (8%) cost allocation; capital recycling
  flip.js                       profit-first max offer; break-even sale price
  brrr.js                       cash-left-in; max offer; break-even valuation; headroom
  cashflow.js                   rent − mortgage − reserves; lender ICR check
  stress.js                     7 scenarios, configurable
  walkaway.js                   5 tests → pass / warn / fail with reasons
  solve.js                      wraps (or replaces) the EXISTING bisection solver
  __tests__/                    golden cases + property tests
```

UI touch-points: **Deals appraisal engine**, **Auction Assessment** (after the 8 gating questions), **Business Planner** (capital pool), **Sourcing Pipeline** (viewing funnel), **Refurb Survey** (kerb-appeal benchmarks), **Area Intelligence / EPC** (construction flags), **Settings** (thresholds).

## 4. Phase plan

Each phase is one prompt file. Run them **in order**, one per Claude Code session (or `/clear` between phases). Every prompt ends at a **gate**: Claude Code stops, reports, and waits for your go-ahead.

| Phase | Prompt file | Delivers | Depends on | Gate |
| --- | --- | --- | --- | --- |
| P00 | `P00_audit_and_setup.md` | Codebase audit, git branch, backup, CLAUDE.md rules, clarifying questions | — | You answer questions, approve the audit |
| P01 | `P01_calc_engine.md` | Pure engine + golden tests (all green) | P00 | Tests pass; you review the numbers table |
| P02 | `P02_data_model_migration.md` | Schema v2, defaults, migration, backup/restore | P01 | Migration tested on emulator with a copy of real data |
| P03 | `P03_deals_appraisal_ui.md` | Valuation triad, max offer, four measures, stress table, verdict | P02 | Visual check on emulator |
| P04 | `P04_funding_and_capital.md` | Bridging calculator, funding sources, £50k recycling tracker | P02 (P03 for UI) | Golden £63,350 shown in UI |
| P05 | `P05_auction_walkaway.md` | Walk-away tests wired into Auction Assessment; solver on v2 engine | P01–P04 | Auction lead runs end-to-end |
| P06 | `P06_refurb_area_construction.md` | Kerb-appeal benchmarks, £1→£3 check, construction flags from EPC | P02 | Rochdale EPC sample verified |
| P07 | `P07_sourcing_funnel.md` | Viewing → offer → accept funnel vs target | P02 | Funnel shows month-to-date |
| P08 | `P08_screen_before_view.md` | *Experimental* comparables-based ranking + backtest gate | P01, P06 | Backtest error within threshold, else feature stays off |
| P09 | `P09_security_review.md` | Security-review subagent, findings fixed, `SECURITY_LOG.md` | All build phases | No open High findings |
| P10 | `P10_verify_and_release.md` | Full test run, build, emulator smoke test, release package | P09 | **Your explicit confirmation before zip/deploy** |

**Minimum viable slice:** P00 → P01 → P02 → P03 → P09 → P10. That alone delivers the decision-changing features (worst-case basis, break-even, stress tests, verdict). P04–P08 can follow in any order after P03, with P09/P10 re-run at the end.

## 5. Golden test cases (must reproduce exactly)

| Case | Inputs | Expected |
| --- | --- | --- |
| Flip stack (Daniel) | GDV £180,000; profit 15%; refurb £25,000; legals £3,000; sale £200; finance £12,000; holding £2,000 | Purchase + SDLT budget **£110,800** |
| Flip SDLT split (company / higher rates, rates as at Jun 2026 — verify) | Budget £110,800 | Price **£105,523.81**, SDLT **£5,276.19** |
| BRRR stack (Lisa) | End value £300,000; LTV 75%; accept £20,000 left in; refurb £20,000; legals £2,000; finance £22,500; holding £500 | Purchase + SDLT budget **£200,000** (all money out: **£180,000**) |
| BRRR SDLT split | Budget £200,000 | Price **£189,252.34**, SDLT **£10,747.66** |
| Bridge day-one release | £75,000; 1%/month × 12 retained; entry 1%; exit 1% deducted at start; broker £500; valuation £650 | Release **£63,350** |
| Katie break-even | Total cost £201,500; LTV 75% | Break-even valuation **£268,666.67**; headroom at £270k **0.49%** |
| Katie sensitivity | Valuations £280k…£240k | +£8,500 / +£1,000 / −£6,500 / −£14,000 / −£21,500 |
| Sean refinance | Cost £51,500; value £85,000; LTV 75% | Gross refinance £63,750; surplus **£12,250** |

All figures recomputed independently on 9 Oct 2026.

## 6. Decisions already made (do not re-open in Claude Code)

- Worst-case value is the **default basis**; mid and best are shown for context only.
- Refinance proceeds are **borrowing, not profit** — never summed into profit.
- First-time-buyer SDLT relief is **never** applied (VIXIV LTD buys as a company; investment purchases don't qualify).
- Scotland (LBTT) and Wales (LTT) are **not implemented** in v2; the engine must return "unsupported nation — calculate manually" rather than an England figure. (Flag: the national Screener includes Scotland — this is an open item.)
- No scraping of Rightmove/Zoopla. Listings enter by manual entry or CSV import (e.g. from EIG exports).
- Deploy only via `.\update-dealsdash.bat`, only after P10 and your explicit confirmation.

## 7. Open items for you (P00 will also ask)

1. Default profit target for flips: 15% or 20% of GDV?
2. Default accepted cash-left-in for BRRR: £0, or a figure tied to the £50k pool turn rate?
3. Lender ICR assumption for the cash-flow test (illustrative default: 125% at a 5.5% stressed rate for a company borrower — confirm with your broker).
4. Minimum net monthly cash flow per BRRR to pass (illustrative default: £150).
5. Minimum break-even headroom to pass (illustrative default: 5%).
6. Monthly viewing target (training benchmark: 20; your capacity may be lower).

## 8. How to run this pack in Claude Code CLI

1. Copy this folder into the repo as `docs/appraisal-v2/` (Windows: `C:\Users\paula\Documents\Dev\dealsdash-package\docs\appraisal-v2\`).
2. Copy `security-reviewer.md` to `.claude/agents/security-reviewer.md` in the repo (P09 also does this if missing).
3. Open a terminal in the repo root and start `claude`.
4. Run each phase with: `Read @docs/appraisal-v2/P00_audit_and_setup.md and execute it exactly.`
5. At each gate, review the report, answer questions, then say `Proceed to the next phase` or start a fresh session with the next file.
6. Keep the knowledge brief open for reference; the prompts already contain every figure needed.

## 9. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Single Firestore document approaches the 1 MiB limit as deals gain comparables, logs and v2 fields | P02 measures document size and warns at 700 KB; comparables stored as summaries only; P02 proposes (does not execute) a split to sub-collections if needed |
| Existing solver semantics differ from v2 | P00 audits it; P01 wraps rather than rewrites unless tests prove it wrong |
| Tax rates change after June 2026 | Rates live in a dated data table with a "verify at GOV.UK" flag shown in the UI |
| Over-trusting the screen-before-view ranking | P08 ships switched off until a backtest on 20–30 known sales meets the error threshold |
| Regressions in live app | Feature branch, emulator testing with real Rochdale data, v1 result shown beside v2 until you retire it |

**Plan confidence:** ~92%. The remaining uncertainty is the shape of the existing code (unknown until P00), which is why P00 is read-only and gated.
