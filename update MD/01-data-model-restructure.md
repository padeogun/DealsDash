# 01 — Firestore Data Model Restructure (prerequisite)

## Goal
Move DealsDash off the single document `users/{uid}/appData/main` onto a per-entity structure, so deals, surveys, legal pack outputs, briefs and pipeline history can grow without hitting Firestore's 1 MB per-document limit. No user-visible behaviour should change.

## Before you start
- Measure and report the current size of `users/{uid}/appData/main` (bytes) and list its top-level keys with approximate size of each.
- Identify every read/write to that document across the codebase (hooks, contexts, Cloud Functions).

## Target structure (propose adjustments if the code suggests better boundaries)
```
users/{uid}/settings/app            // app-level prefs, theme, active buy box id
users/{uid}/buyBoxes/{buyBoxId}     // see prompt 02
users/{uid}/deals/{dealId}          // core deal record (summary fields only)
users/{uid}/deals/{dealId}/appraisals/{appraisalId}   // versioned; one flagged `frozenAtPurchase`
users/{uid}/deals/{dealId}/surveys/{surveyId}
users/{uid}/deals/{dealId}/legalPacks/{packId}
users/{uid}/deals/{dealId}/briefs/{briefId}           // see prompt 05
users/{uid}/deals/{dealId}/events/{eventId}           // stage changes, outcomes (prompt 04)
users/{uid}/leads/{leadId}          // sourcing leads not yet promoted to deals (if distinct in current code)
users/{uid}/planner/{docId}         // Business Planner data
```
Keep summary fields on the deal document that list views need (address, postcode, stage, strategy, guide/purchase price, key metrics) so lists load without reading subcollections.

## Requirements
1. **Data access layer.** Create a single module (e.g. `src/data/repo.js`) that owns all Firestore paths and read/write functions. Components must not build Firestore paths directly.
2. **Migration.** Write an idempotent migration that reads the legacy document and writes the new structure. It must:
   - run once per user, record `settings/app.migratedAt` and `schemaVersion: 2`;
   - never delete the legacy document (keep it read-only as a backup until the owner confirms);
   - log counts (deals, surveys, etc.) before and after, and fail loudly on mismatch.
3. **Backwards safety.** If `schemaVersion` is missing, the app runs the migration before rendering data views, with a visible progress Note.
4. **Security rules.** Update `firestore.rules` so only `request.auth.uid == uid` can read/write under `users/{uid}/**`. Add rules unit tests (emulator only).
5. **Real-time updates.** Preserve any existing `onSnapshot` behaviour; list views subscribe to `deals` (summary), detail views subscribe to the relevant subcollections only.

## Verification
- Run the migration against an emulator copy of the real data (export from production with `firebase firestore:export` or manual copy — ask the owner which).
- Compare every deal's key figures before and after (script output table).
- Click through every module in the emulator and confirm identical behaviour.

## Acceptance criteria
- No component references `appData/main` except the migration and the backup reader.
- Counts and figures match 100% before/after.
- Security rules tests pass.
- Legacy document untouched.

## Out of scope
Multi-user, sharing, billing. Deleting the legacy document (owner does this manually later).
