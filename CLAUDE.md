# DealsDash — CLAUDE.md

Project-level instructions for Claude Code. Read at the start of every session.

## Project overview

DealsDash is a single-user React + Firebase property deal-tracking app for VIXIV LTD (Paul Adeogun).
Stack: React 18, esbuild bundler, Tailwind CSS v3, Firebase (Hosting + Firestore + Functions + Storage).
Deployed at https://dealsdash.web.app via `.\update-dealsdash.bat` (or `firebase deploy --only hosting`).

## Key conventions

- Design tokens: `vx-*` CSS classes from `src/design-system/tokens/tokens.css`.
- Re-use VIXIV DS components from `src/design-system/react/index.jsx` before adding new ones.
- All money: display to £1 (or £0.01 where golden case requires); round only at display via `round2()`.
- Auth gate: `ALLOWED_EMAIL = "paul.a.adeogun@gmail.com"` is hardcoded in three places — update all three together: `src/App.jsx`, `functions/index.js`, `firestore.rules`.
- Secrets: `ANTHROPIC_API_KEY`, `EPC_API_KEY` live in Firebase Secrets only — never in client code.

---

## Appraisal v2 rules

Full rules: `docs/appraisal-v2/RULES.md`

One-line summary of each rule:

1. **Ask before building** — stop and ask if anything in the phase prompt is ambiguous or conflicts with existing code.
2. **Surgical edits** — str_replace-style targeted edits; no whole-file rewrites unless the phase says so.
3. **Respect what exists** — reuse existing components (VIXIV DS v1), services (EPC proxy, Police.uk, EA flood, Land Registry SPARQL), and `vx-*` tokens.
4. **Inline comments mandatory** — every new function, non-obvious calculation, and data-model field gets a comment; financial formulas carry the formula in words and source.
5. **Gate at end of every phase** — stop, report what changed, list open questions, wait for explicit approval before continuing.
6. **Tests first for maths** — write the failing test from the golden cases before the implementation.
7. **Null is not zero** — unknown cost lines are `null`, rendered as "Unknown", block a Pass verdict; never coerce `null → 0`.
8. **Money in pence internally, or round only at display** — do not round intermediate values.
9. **Worst-case value is the default** — best and mid are context.
10. **Refinance proceeds are borrowing, not profit** — keep cash released, cash left in, equity, and monthly cash flow as four separate outputs.
11. **Labels on assumptions** — every default threshold is configurable and visibly tagged "Illustrative — verify"; tax tables carry `effectiveFrom` and `verifyAt`.
12. **Never apply first-time-buyer SDLT relief** — Scotland/Wales return `unsupported` rather than an England figure.
13. **Backup before migration** — export `users/{uid}/appData/main` to timestamped JSON before any schema change.
14. **Additive schema only** — new fields with defaults; bump `schemaVersion`; never delete or rename existing fields in v2.
15. **Emulator first** — test against Firebase emulator (`?useEmulator=1`) with a copy of real data before touching production.
16. **Test infrastructure never ships** — mocks, Playwright files, emulator overrides, fixtures stay out of the production build.
17. **Secrets stay server-side** — `EPC_API_KEY` and `ANTHROPIC_API_KEY` live only in Firebase Secrets / Cloud Functions.
18. **No scraping** of property portals — listing data enters via manual entry or CSV import.
19. **Change log** — append a dated entry to `docs/appraisal-v2/CHANGELOG.md` at the end of each phase.
20. **No deploy** without Paul's explicit confirmation in the current session; deploy only via `.\update-dealsdash.bat`.

### Decisions already made (do not re-open)

- Worst-case value is the **default basis**; mid and best are context only.
- Refinance proceeds are **borrowing, not profit**.
- First-time-buyer SDLT relief is **never applied**.
- Scotland (LBTT) and Wales (LTT) return "unsupported nation" — not calculated.
- No scraping of Rightmove/Zoopla.
- Deploy only after P10 and Paul's explicit confirmation.

### Phase plan

P00 → P01 → P02 → P03 → P09 → P10 is the minimum viable slice. See `docs/appraisal-v2/00_README_Strategy_and_Plan.md` for the full 11-phase plan.
