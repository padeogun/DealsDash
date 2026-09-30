# 04 — Pipeline Stages with Due-Diligence Gates and Outcome Recording

## Goal
Upgrade the Sourcing Pipeline into a staged kanban that runs from first sighting to exit, with a due-diligence checklist per stage (tied to the existing 8 auction gating questions) and a prompt to record outcomes after auctions end. Lost-bid outcomes become pricing evidence.

Inspired by Estately's 9-stage deal pipeline. DealsDash extends it past "Won" through refurb and exit.

## Before you start
- List current pipeline statuses and how many leads/deals are in each (emulator copy).
- Read the 8 gating questions in Auction Assessment Logic and report them verbatim.
- Propose a mapping from current statuses to the new stages; wait for approval before migrating.

## Stages
Acquisition: `Watching → Viewing → Legal Review → Due Diligence → Bid Ready → Bid Submitted/Offer Made → Won | Lost | Withdrawn`
Post-acquisition: `Purchased → Refurb → Marketing/Tenanting → Exit (Sold | Refinanced)`
Stages are config (array in one file), not scattered strings.

## Stage gates
Each stage has a checklist. Moving forward with unchecked **required** items shows a confirm dialog listing what's missing (allow override with a reason, which is logged).
Suggested checklist (adapt to the real gating questions):
- Viewing: viewing booked/done; photos captured; Refurb Survey started.
- Legal Review: legal pack uploaded; Legal Pack Review run; red flags acknowledged.
- Due Diligence: comparables checked; EPC checked; flood + crime + area signals reviewed (06); all 8 gating questions answered.
- Bid Ready: funding planner complete (03); max bid set (from bisection solver); walk-away price set; bridging Agreement in Principle in place; decision brief generated (05).
Each item links to where it's completed and auto-ticks when the underlying data exists.

## Events and outcomes
- Every stage change writes `deals/{dealId}/events/{eventId}`: `{ from, to, at, note, overrideReason? }`.
- **Auction outcome prompt:** when an auction date has passed and the deal is still in Bid Ready / Bid Submitted, show a banner and modal: Won / Lost / Unsold / Withdrawn; hammer price (if known); our max bid; number of bidders (optional); notes.
- **Frozen appraisal:** on Won/Purchased, freeze the current appraisal (`frozenAtPurchase: true`) so actuals can later be compared with the plan.
- Lost outcomes feed a simple "Bid history" table (date, address, our max, hammer, gap %) visible on the Pipeline screen.

## UI
- Kanban board (drag and drop) with horizontal scroll on mobile; also a compact list view toggle (`Segmented`).
- Card: address, postcode, guide/price, stage age ("12 days in Legal Review"), buy-box fit badge, key flags (07).
- Use an established DnD library already in the project if present; otherwise propose `@dnd-kit/core` (accessible, touch-friendly). Do not hand-roll drag and drop.

## Acceptance criteria
- Existing items migrated with owner-approved mapping; no data loss.
- Gates show missing items; overrides require and log a reason.
- Outcome prompt appears for past auction dates and writes an event.
- Appraisal frozen on purchase.
