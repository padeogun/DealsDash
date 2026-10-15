# P00 — Audit and Setup (read-only + safety net)

**Read first:** `docs/appraisal-v2/RULES.md` and `docs/appraisal-v2/00_README_Strategy_and_Plan.md`.

## Goal
Understand the existing DealsDash code before changing anything, set up a safe working branch and backup, record the v2 rules in `CLAUDE.md`, and ask Paul the open questions. **Do not modify application code in this phase.**

## Steps

1. **Version control.**
   - Check whether the repo is under git. If not, ask Paul before running `git init`.
   - Create and switch to branch `feature/appraisal-v2`. Confirm the working tree is clean first; if not, list the uncommitted files and ask.

2. **Map the codebase.** Produce `docs/appraisal-v2/AUDIT_FINDINGS.md` covering:
   - Folder structure (top two levels) and build tooling (Vite config, Tailwind preset, test runner if any).
   - **Deals appraisal engine:** where it lives, its inputs, outputs, formulas, and how flip vs BRRR are handled.
   - **Max-bid bisection solver (Auction Assessment):** file, function signature, objective function, convergence tolerance, iteration cap, what costs it treats as price-dependent.
   - **SDLT:** whether it is calculated, where, which rates/bands, whether company/additional-property rules exist, whether first-time-buyer relief is ever applied.
   - **Cost lines:** list every cost field in a deal and whether blanks are treated as 0.
   - **Data model:** the shape of `users/{uid}/appData/main` (deals, pipeline, planner, settings), any `schemaVersion`, and the current document size for Paul's real data (ask Paul to run the export if you cannot read it).
   - **Business Planner:** how capital, funding and the £50k raise are modelled today.
   - **Refurb Survey:** benchmark-rate structure and where placeholder rates live.
   - **EPC / Area Intelligence:** which EPC fields are already fetched (look for `walls-description`, `built-form`, `property-type`, `construction-age-band`).
   - **Tests:** existing test runner and coverage. If none, recommend Vitest (fits Vite) — do not install yet.
   - **Cloud Functions:** list each function, its trigger, and whether it verifies Firebase Auth.
   - **Firestore rules:** paste the current rules.
   - A **"Reuse vs build"** table: for each v2 capability in the README §3, say *reuse as-is*, *extend*, or *build new*, with the file to touch.

3. **Backup.** Write a small script (or document the console steps) to export `users/{uid}/appData/main` to `backups/appData-main-YYYYMMDD-HHMM.json`. Add `backups/` to `.gitignore`. Ask Paul to run it against production and confirm the file exists.

4. **CLAUDE.md.** Add (or append) a section `## Appraisal v2 rules` that points to `docs/appraisal-v2/RULES.md` and summarises rules 1–20 in one line each. Keep any existing CLAUDE.md content intact.

5. **Changelog.** Create `docs/appraisal-v2/CHANGELOG.md` with a P00 entry.

6. **Clarifying questions for Paul** (ask all at once, with the illustrative default in brackets):
   1. Default flip profit target as % of GDV? [15%]
   2. Default accepted cash left in per BRRR? [£0]
   3. Lender ICR test for BRRR cash flow? [125% at 5.5% stressed rate — illustrative, confirm with broker]
   4. Minimum net monthly cash flow per BRRR to pass? [£150]
   5. Minimum break-even headroom to pass? [5%]
   6. Monthly viewing target? [20]
   7. Reserves as % of rent: management, maintenance, voids? [10% / 8% / 4%]
   8. Is Vitest acceptable as the test runner (if none exists)?
   9. Anything in the audit that looks wrong or that you want handled differently?

## Gate
Stop. Present: the AUDIT_FINDINGS summary (≤ 1 page in chat, full detail in the file), the "Reuse vs build" table, backup status, and the questions. **Wait for Paul's answers before P01.** Record his answers in `docs/appraisal-v2/DECISIONS.md`.
