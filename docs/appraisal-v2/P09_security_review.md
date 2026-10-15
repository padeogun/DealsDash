# P09 — Security Review (subagent) and Security Log

**Read first:** `RULES.md`, `CHANGELOG.md`.

## Goal
Have an independent security-review subagent check everything changed in P00–P08 (and the security basics of the whole app), fix what it finds, and keep a permanent log.

## Steps
1. Ensure `.claude/agents/security-reviewer.md` exists in the repo. If not, copy it from `docs/appraisal-v2/security-reviewer.md`.
2. Produce the diff scope: `git diff --stat main...feature/appraisal-v2` plus the list of new files.
3. **Invoke the `security-reviewer` subagent** with that scope and the full checklist in its definition. Do not review the code yourself in the main context — the point is a fresh, independent pass.
4. Apply fixes per the agent's process (Low/Medium directly; High/Critical only after Paul approves).
5. Re-invoke the subagent for a verification pass on the fixed items.
6. Make sure `docs/appraisal-v2/SECURITY_LOG.md` has a row for every finding, including those closed.

## Re-run rule
Run P09 again after any later phase or hotfix that touches Firestore rules, Cloud Functions, imports, or dependencies, and always immediately before P10.

## Gate
Stop. Present the agent's summary (counts by severity, open items) and the SECURITY_LOG path. **Release is blocked while any High/Critical item is open.** Update `CHANGELOG.md`. Wait for approval.
