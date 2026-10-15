# P10 — Verify and Release

**Read first:** `RULES.md`, `CHANGELOG.md`, `SECURITY_LOG.md`.

## Pre-flight (all must be true)
- [ ] P09 completed in this release cycle; no open High/Critical in `SECURITY_LOG.md`.
- [ ] `npm test` all green, including every golden case from the README §5.
- [ ] Fresh production backup exists in `backups/` (taken today).

## Steps
1. **Full test run** and coverage summary for `src/lib/appraisal/`.
2. **Production build** (`npm run build`). Confirm `dist/` contains no test files, fixtures, mocks, emulator overrides or Playwright files (list any found and remove from the build config).
3. **Emulator smoke test** with a copy of today's backup (`?useEmulator=1`):
   - Migration runs once; all existing deals open; v1 figures unchanged.
   - Golden Flip and BRRR test deals show £110,800 / £200,000 budgets and the split prices.
   - Bridging panel shows £63,350 for the golden inputs.
   - One real auction lead runs end to end to a bid sheet.
   - Funnel, capital tracker and Refurb Survey kerb-appeal group render.
   - Mobile width check (≤ 400 px) on the deal screen.
4. **Release notes** in `CHANGELOG.md`: what changed for Paul in plain words, known limitations (Scotland/Wales SDLT unsupported; illustrative thresholds; P08 flag state).
5. **Merge plan:** propose the merge of `feature/appraisal-v2` into `main` (do not merge without approval).
6. **Ask Paul for explicit confirmation** to (a) merge, and (b) deploy. Only after a clear "yes, deploy" in this session, run `.\update-dealsdash.bat`.
7. **Post-deploy check:** open dealsdash.web.app, confirm migration ran on production (schemaVersion 2), spot-check two real deals against the emulator results. If anything differs, stop and report — restore path is the backup taken today.

## Gate
Final report: test results, build check, smoke-test checklist with pass/fail, deploy status, and the rollback instruction.
