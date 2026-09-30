# 09 — Notifications: Daily Digest Email, Instant Alerts and In-App Inbox

## Goal
Send the owner short, action-first notifications about **their own pipeline**: auctions approaching with incomplete checks, outcomes to record, listing changes, legal pack results and stale deals. Delivered as a daily digest email, optional instant alerts, and an in-app notification inbox.

Inspired by Estately's playbook emails. DealsDash differences:
- **Action first, not a catalogue.** Estately's email lists 15+ lots. The DealsDash digest leads with what needs doing today and caps the number of cards.
- **No discovery emails by default.** Estately already emails new auction matches for free. DealsDash only sends buy-box match alerts if prompt 08 is approved and lots are imported.
- **Nothing sent when there's nothing to act on.**

## Before you start
- Confirm the owner's email address and sending domain (e.g. `alerts@vixiv.co.uk`). Sending from a custom domain needs SPF/DKIM DNS records; list the records needed and pause for the owner to add them.
- Use established tools, do not hand-build:
  - **Sending:** Firebase extension "Trigger Email from Firestore" with an SMTP provider (propose Resend or SendGrid free tier; compare in one paragraph and let the owner choose).
  - **Email templates:** `react-email` (renders responsive, email-client-safe HTML from React components using VIXIV tokens as inline values).
  - **Scheduling:** Cloud Functions scheduled function (`onSchedule`), Europe/London timezone.
  - **Push (phase 2, optional):** Firebase Cloud Messaging web push. Note in the summary: on iPhone, web push only works when DealsDash is added to the Home Screen as a web app.

## Triggers (each toggleable; every threshold editable in settings — none hard-coded)
| Type | Fires when | Default delivery |
|---|---|---|
| Auction approaching | Deal has an auction date within N days (seed: 7 and 1) | Digest; instant at 1 day |
| Gates incomplete | Auction within N days and Bid Ready checklist incomplete (list missing items) | Instant |
| Closing today | Auction date is today | Digest (top section) |
| Outcome due | Auction date passed, no outcome recorded (prompt 04) | Digest until recorded |
| Listing changed | Re-check Listing Status detects withdrawn, sold, postponed or price change | Instant |
| Legal pack ready | Legal Pack Review finishes; include red-flag count | Instant |
| Stale deal | Deal in same stage longer than N days (seed: 14) | Weekly digest |
| Placeholder assumptions | Unverified assumptions remain (prompt 02) | Weekly digest footer |
| Buy-box match | Only if prompt 08 approved and lots are imported | Digest |
| Lender report due | Only once a lender register exists; N days before month end | Digest |

## Data model
- `users/{uid}/settings/notifications`: channel toggles per type, thresholds, digest time (seed 07:00), quiet hours, max cards per digest (seed 5), "summary only" mode (omit financial figures from emails), email address.
- `users/{uid}/notifications/{id}`: `{ type, dealId, title, body, dedupeKey, createdAt, readAt, channels: { email: sentAt|null, push: sentAt|null } }`.
- **Deduplication:** `dedupeKey = type + dealId + date` so a trigger never sends twice. Instant alerts already sent are listed once in the next digest as "Already alerted", not repeated as new.

## Digest email structure
1. **Headline sentence** generated from counts, e.g. "1 auction closes today, 2 outcomes to record." Subject line uses the same sentence.
2. **Needs action today** — max 3 items, each with the specific action ("Tick 2 missing checks before Thursday's auction").
3. **Deal cards** (capped; "+N more in DealsDash" link): photo if stored, address, stage, auction countdown, max bid, recommendation badge (prompt 05), up to 3 risk badges (prompt 07), one button "Open in DealsDash" deep-linking to the deal.
4. **Changes since yesterday** — one line each.
5. Footer: placeholder-assumption count, manage-notifications link, and "Illustrative analysis. Not financial advice."
Keep it readable on a phone: single column, max ~600 px wide, light theme, alt text on images. No ads.

## In-app inbox
Bell icon in the header with unread count; panel listing notifications grouped Today / Earlier; tap opens the deal and marks read; "Mark all read".

## Verification
- Emulator + a test address: trigger each type with seeded deals and confirm exactly one email per dedupe key.
- Send a real digest to the owner and check rendering in Gmail on Android and desktop.
- Confirm no email is sent on a day with nothing to report.

## Acceptance criteria
- Every trigger and threshold is editable in Settings → Notifications.
- Digest leads with actions, respects the card cap and the "summary only" mode.
- No duplicate sends; no send when empty.
- Provider API keys stored as Firebase Secrets and used only in Cloud Functions.
