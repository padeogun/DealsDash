# P07 — Viewing → Offer → Acceptance Funnel

**Read first:** `RULES.md`, `AUDIT_FINDINGS.md` (Sourcing Pipeline section).

## Goal
Treat sourcing as the numbers game the training described (about 20 viewings a month per deal) and show Paul whether his activity matches his deal target.

## Steps
1. **Viewing log** on each pipeline lead: date viewed, type (in person / virtual / drive-by), agent, offer made (yes/no), offer amount, offer vs max offer (from v2 engine), outcome (accepted / rejected / standing / withdrawn), standing-offer follow-up date (the "long-burn" deals).
2. **Funnel view** (Sourcing Pipeline): this month and rolling 3 months — viewings → offers → accepted, with conversion rates and target line from `settings.appraisal.viewingTargetPerMonth`.
3. **Standing offers list:** offers that "still stand", sorted by follow-up date, with one-tap "log follow-up".
4. **Agent relationships:** per agent — viewings, offers, completions, last contact; flag agents not contacted in 30 days (training: keep in touch, they call proven buyers when a sale falls through).
5. **Pace indicator:** "At this rate: about N deals in the next 12 months" — simple projection, labelled illustrative.

## Data
- `pipeline.viewings[]` entries stay compact (no free-text beyond 500 chars). Agents stored once and referenced by id.

## Tests
- Funnel maths on a fixture month (25 viewings, 6 offers, 1 accepted → 24% / 17%).
- Standing-offer sort and follow-up flag.

## Gate
Stop. Screenshot of the funnel with Paul's real pipeline (emulator copy). Update `CHANGELOG.md`. Wait for approval.
