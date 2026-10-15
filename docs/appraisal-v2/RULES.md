# Appraisal v2 — Standing Rules for Claude Code

These rules apply to every phase prompt in `docs/appraisal-v2/`. Read this file at the start of every phase.

## Working style
1. **Ask before building.** If anything in the phase prompt is ambiguous or conflicts with the existing code, stop and ask clarifying questions before writing code.
2. **Surgical edits.** Prefer targeted edits (str_replace-style) to existing files. Do not rewrite or regenerate whole files unless the phase prompt says so or you have asked first.
3. **Respect what exists.** Reuse existing components, the VIXIV Design System v1.0 (`react/index.jsx` components: Header, Tabs, Segmented, NumberField, Note, Stat, Item, Table, LiveBar, ThemeProvider; tokens from `tokens.css`; `vx-*` classes) and existing services (EPC proxy, Police.uk, EA flood, Land Registry SPARQL). Do not add a library when the codebase or an established package already solves the problem.
4. **Inline comments are mandatory.** Every new function, non-obvious calculation and data-model field gets a short comment explaining what and why. Financial formulas carry a comment with the formula in words and the source (e.g. "Progressive training 9 Oct 2026 — profit-first stack").
5. **Gate at the end of every phase.** Stop, report what changed (files, tests, screenshots if UI), list open questions, and wait for explicit approval.

## Correctness
6. **Tests first for maths.** Write the failing test from the golden cases before the implementation.
7. **Null is not zero.** Unknown cost lines are `null`, rendered as "Unknown", and they block a Pass verdict. Never coerce `null` to `0` in calculations — propagate "incomplete".
8. **Money in pence internally, or round only at display.** Do not round intermediate values. Display to £1 (or £0.01 where the golden case needs it).
9. **Worst-case value is the default appraisal basis.** Best and mid are context.
10. **Refinance proceeds are borrowing, not profit.** Keep cash released, cash left in, equity and monthly cash flow as four separate outputs.
11. **Labels on assumptions.** Every default threshold and benchmark is configurable and visibly tagged "Illustrative — verify". Tax tables carry `effectiveFrom` and `verifyAt` (GOV.UK URL).
12. **Never apply first-time-buyer SDLT relief.** Scotland/Wales return `unsupported` rather than an England figure.

## Data safety
13. **Backup before migration.** Export `users/{uid}/appData/main` to a timestamped JSON file before any schema change touches real data.
14. **Additive schema only.** New fields with defaults; bump `schemaVersion`; never delete or rename existing fields in v2.
15. **Emulator first.** Test against the Firebase emulator (`?useEmulator=1`) with a copy of real data (Rochdale deals) before anything touches production.

## Delivery hygiene
16. **Test infrastructure never ships.** Mocks, Playwright files, emulator overrides and fixtures stay out of the production build and any release package.
17. **Secrets stay server-side.** `EPC_API_KEY` and `ANTHROPIC_API_KEY` live only in Firebase Secrets / Cloud Functions; never in client code, logs or committed files.
18. **No scraping** of property portals. Listing data enters via manual entry or CSV import.
19. **Change log.** Append a dated entry to `docs/appraisal-v2/CHANGELOG.md` at the end of each phase (files touched, why, tests added).
20. **No deploy** without Paul's explicit confirmation in the current session. Deploy only via `.\update-dealsdash.bat`.
