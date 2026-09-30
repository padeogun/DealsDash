# DealsDash — Borrowed Features Build Pack (for Claude Code)

Prompt pack for adding features to DealsDash, adapted from a review of Estately (estately.uk, Sept 2026). Feed **one prompt file per Claude Code session**, in the order below. Each file is self-contained, but assumes this README has been read first.

## How to use

1. Open the DealsDash repo (`C:\Users\paula\Documents\Dev\dealsdash-package\`) in Claude Code.
2. Paste: `Read prompts/00-README.md and prompts/<NN-file>.md, then follow the Working Protocol.`
3. Approve the plan Claude Code proposes before it writes any code.

## Build order

| # | File | Depends on | Why this order |
|---|------|-----------|----------------|
| 01 | `01-data-model-restructure.md` | — | Every later feature adds data; the single-document model risks Firestore's 1 MB document limit |
| 02 | `02-buy-box-playbook.md` | 01 | Assumptions defined here feed 03, 04 and 05 |
| 03 | `03-funding-planner.md` | 01, 02 | Core bridging/BRRR maths; feeds the decision brief |
| 04 | `04-pipeline-stages-dd.md` | 01 | Stage gates reference existing auction gating questions |
| 05 | `05-decision-brief.md` | 02, 03, 04 | Pulls everything into a one-page BUY / WATCH / PASS |
| 06 | `06-area-signals.md` | 01 | IMD decile + price momentum pills |
| 07 | `07-design-patterns.md` | any | Badges, progressive disclosure, "unscored", attribution footer — apply alongside 02–06 |
| 08 | `08-estately-api-spike.md` | — | Investigation only; no feature build until findings approved |
| 09 | `09-notifications-digest.md` | 04, 05 | Daily digest email, instant alerts, in-app inbox for your own pipeline |
| 10 | `10-desktop-workspace-layout.md` | 04, 05, 06, 07 | Filter rail + map + ranked list; mobile collapses to list-first |

## Shared context (applies to every prompt)

**App:** DealsDash — private deal-management tool for VIXIV LTD (UK residential property; hybrid Flip + BRRR; primary market Rochdale, secondary Oldham and Tameside; Phase 2 Huddersfield/Halifax; terraced and semi-detached stock; auction and off-market purchases).

**User:** single user (the owner). Do not build multi-tenancy, roles or billing.

**Stack:** React + Vite, compiled Tailwind v3, Firebase (Auth, Firestore, Cloud Functions, Hosting at `dealsdash.web.app`), lucide-react icons. Emulator branch via `?useEmulator=1`. Deploy via `.\update-dealsdash.bat`.

**Existing modules (read before changing anything):** Sourcing Pipeline; Deals appraisal engine; Business Planner; Auction Assessment Logic (8 gating questions, max-bid bisection solver, strategy profile, legal pack schema); Legal Pack Review (Cloud Function, Claude-powered PDF triage, structured fee extraction, RRA-aware tenancy analysis); Re-check Listing Status; Area Intelligence (Police.uk crime, Environment Agency flood risk); EPC integration (MHCLG EPC Register via proxied Cloud Function); Land Registry Price Paid / SPARQL; Refurb Survey (attached to deals, prefilled from EPC/area/legal pack, tap-to-confirm on site).

**Secrets:** Firebase Secrets `EPC_API_KEY`, `ANTHROPIC_API_KEY`. Any new key goes in Firebase Secrets and is only used server-side (Cloud Function). Never ship keys to the client.

**Design system:** VIXIV Design System v1.0. `tokens/tokens.css` is the single source of truth (light/dark/auto). Tailwind preset `tokens/tailwind.preset.js` (`darkMode: ["class"]`). React components: Header, Tabs, Segmented, NumberField, Note, Stat, Item, Table, LiveBar, ThemeProvider. Colours: Navy `#1B2A4A`, Brick `#C1533C` (dark `#E07A63`), Ice `#E7ECF3`, Negotiate gold `#8A6508`. **Use tokens only — no hard-coded hex values in components.** If a new primitive is needed (e.g. Badge), build it in DealsDash from tokens and list it in the summary as a candidate to upstream into the design system.

## Working Protocol (Claude Code must follow)

1. **Explore first.** Read the relevant source files and report: current structure, where the change fits, existing functions to reuse (e.g. SDLT calculation, Land Registry calls, gating questions). Do not duplicate logic that already exists.
2. **Ask clarifying questions** where the prompt and the code disagree or something is ambiguous. Do not guess.
3. **Propose a plan** (files to touch, new files, data changes, migration) and wait for approval.
4. **Surgical edits.** Prefer targeted edits to existing files over rewrites. Never regenerate a whole file to change one part.
5. **Verify against real data, not mocks.** Curl-test any external API before building on it. Use the Firestore emulator for data changes. Use real Rochdale postcodes (e.g. OL11, OL12, OL16) for checks.
6. **No hard-coded business figures.** Rates, fees, thresholds and fund terms are read from Firestore settings (see prompt 02), never written as literals in components or calculations.
7. **Label illustrative figures.** Any default assumption (rates, stress tests, fees) is marked in the UI as an adjustable assumption with its source and "last verified" date — never presented as fact.
8. **Surface open legal/tax/regulatory items in the UI** (e.g. SDLT rates, lender criteria), not only in code comments.
9. **Test infrastructure stays out of production.** Mock servers, Playwright files and emulator overrides are never included in the deploy build.
10. **Finish with a summary:** files changed, migrations run, how it was verified, open questions, and anything flagged for the owner's review.

## Out of scope for this whole pack

Auction indexing/scraping of auction-house sites, AI chat assistant, infrastructure strategy overlays (HS2, Freeports), auction bid replay, national 0–100 deal score, plot boundaries, corporate seller signals. These were reviewed and deliberately excluded.
