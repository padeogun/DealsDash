# Appraisal v2 — Changelog

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
