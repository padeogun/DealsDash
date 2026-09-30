# Estately API Spike — Findings Report

**Prepared for:** VIXIV LTD / DealsDash  
**Retrieved:** 2026-09-24  
**Status:** Awaiting owner go/no-go decision before any build begins.

---

## Summary

Estately is a UK property auction intelligence platform. Its REST API, Playbook webhook system, and MCP connectors are well-documented and largely free for personal investing. North West England coverage is solid. The integration case is strong: a webhook-triggered lot import into the DealsDash sourcing pipeline can be built quickly and without duplicating DealsDash's core appraisal engine. **Recommended: Integrate (minimal scope).**

---

## Question 1 — Terms and Pricing

### Personal use
The API is **free for personal investing** with no subscription, sign-up, or payment required. The platform and Investor Reports (IC Brief and Submission Pack PDFs) are also free.

Source: [estately.uk](https://estately.uk/) — retrieved 2026-09-24.

### Commercial use
Commercial API use is licensed separately. No public pricing tiers are documented; the only path is email: [email protected].

The platform states the distinction clearly: "Free for personal property research and investing; commercial use licensed separately." No further clauses are quoted publicly — obtaining them requires contacting the team.

**Practical implication:** DealsDash as a private, single-user tool for the owner's own investing falls squarely in the free tier. If DealsDash later becomes a paid product sold to other investors, a commercial licence conversation is needed before launch.

### Key uncertainty
The API is described as "beta" and "launching." Terms could change. No SLA or committed deprecation timeline is published for the current beta. The API reference states v1 contracts are frozen minimum 12 months after v2 ships — but v2 has no published ETA.

---

## Question 2 — Coverage

### Indexed auction houses (15 confirmed)

| Auction House | NW Relevance |
|---|---|
| Auction House UK | ✅ Manchester branch; covers Rochdale, Oldham, Tameside, Stockport, Middleton. 25+ regional branches nationally. |
| SDL Property Auctions | ✅ Dedicated Manchester / North West category. |
| Town & Country Property Auctions | ✅ Manchester branch listed. |
| Allsop | National (London-led; NW lots appear). |
| Barnard Marcus | National. |
| Pattinson Auctions | North East primarily. |
| Clive Emson Auctioneers | South East primarily. |
| John Pye Auctions | Midlands / national. |
| Paul Fosh Auctions | Wales primarily. |
| Countrywide Property Auctions | National. |
| Bradley Hall Auctions | North East. |
| Sage & Co Auctions | National. |
| Under The Hammer | Scotland. |
| Auction House London | London. |
| Auction House Scotland | Scotland. |

### Current North West inventory
From [estately.uk/auctions/](https://estately.uk/auctions/) — retrieved 2026-09-24:

- **Total active North West lots: 231**
- Manchester: 17 lots / 5 auctioneers
- Liverpool: 55 lots
- Blackpool: 41 lots
- Preston: 19 lots
- Oldham, Salford, Warrington, Bolton, Blackburn also represented

Rochdale-specific lot count is not broken out on the auctions overview page. Direct search at estately.uk/auctions confirms lots from OL-postcode areas appear (Town & Country Manchester has listed Rochdale lots — e.g. Well Street, OL11 1AX appeared in search results).

**Coverage verdict:** The owner's primary sourcing areas (Rochdale OL11/OL12/OL16, Oldham OL1/OL2/OL4, Tameside SK15) are covered via Auction House UK Manchester and SDL Property Auctions. Not every small local auctioneer is indexed, but the major volume sources are present.

---

## Question 3 — Data Fields, Rate Limits, and Webhooks

### Key lot schema fields

**Identity & location**
- `address`, `postcode`, `region`, `auction_house`, `lot_number`, `lot_url`

**Financial model**
- `guide_price_gbp`, `reserve_price_gbp`
- `estately_score` (0–100; STRONG 80–100 / GOOD 62–79 / MODERATE 52–61 / MARGINAL 40–51 / NO DEAL 15–39 / null)
- `default_cash_left_in_gbp` — cash remaining after 75% GDV refinance
- `no_money_left_in` (boolean) — true when full stake is returned on refi
- `estimated_sdlt_gbp` — correct tax band for nation (SDLT/LBTT/LTT)
- `area_median_price_gbp`, `area_price_yoy_pct`, `area_price_momentum_decile` (1–10)

**Property detail**
- `property_type`, `bedrooms`, `bathrooms`, `floor_area_sqm`, `tenure`
- `epc_rating`, `lease_years_remaining`
- `is_bulk_lot`, `bulk_unit_count`, `is_development_opportunity`
- `renovation_urgency` (extracted classification)
- Up to 8 image URLs

**Bid lifecycle**
- `current_bid_gbp` (live only), `highest_bid_gbp`, `final_sold_price_gbp`
- `auction_status`, `outcome_status` (exchanged / conditional_reserved / unsold / withdrawn)
- `relist_count`, `previous_guide_prices[]`

**Area signals** (overlaps with DealsDash Prompt 06 data)
- `flood_risk_score`, `crime_score`, `imd_decile`
- `nearest_school_name`, `nearest_good_school_km`, `school_proximity_score`
- `parcel_area_sqm`, `parcel_boundary` (GeoJSON)

**Corporate seller intelligence**
- Via `GET /lots/{lot_id}/corporate_context`: Companies House identity, SIC, charges, liquidator status, Land Registry portfolio velocity decile

**Legal pack**
- Via `GET /lots/{lot_id}/legal-pack`: AI risk summary, tenure, title restrictions, charges, special conditions, leasehold terms, sale classification (repossession / probate / receivership)

### Rate limits
- **Personal (free) tier:** Fair-use limits. Credit system: reads cost 1 credit, writes (POST/PATCH/DELETE on `/me/*`) cost 5 credits.
- **Trial:** 500 calls to get started.
- **Rate-limit response:** `HTTP 429` with `retry_after_seconds`. Standard headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- **Commercial tier:** Quotas per arrangement. No public published numbers.

### Webhooks
Playbooks (buy-box mandates) push a signed `POST` to a configured HTTPS endpoint when a lot matches. Payload:
```
Headers:
  X-Estately-Event: lot.matched | lot.result | lot.legal_pack_ready
  X-Estately-Delivery: <uuid>
  X-Estately-Signature: HMAC-SHA256 over raw body using webhook signing secret

Body (JSON):
  { delivery_id, event_type, mandate_id, mandate_name, lot: { <full lot object> } }
```
Verification: `HMAC-SHA256(raw_body, signing_secret)` — matches the EPC proxy signing pattern. Multiple event types per lot; route on `X-Estately-Event`.

### MCP connector
A hosted MCP endpoint at `wss://mcp.estately.uk/v1?token=<api_key>` connects directly to Claude/ChatGPT/Grok. Not relevant to DealsDash's Cloud Function approach but confirms the API key authentication pattern.

---

## Question 4 — Auth and Security

### Key format
`Authorization: Bearer est_live_[32 hex chars]`

Keys are issued at `app.estately.uk/account`. Rotation is via email to support (no self-service rotation endpoint documented in beta).

### DealsDash integration plan
1. Store key as Firebase Secret `ESTATELY_API_KEY` — same pattern as `EPC_API_KEY`.
2. All Estately calls made from a Cloud Function proxy. The client never sees the key.
3. Two Cloud Functions:
   - `estatelyWebhook` (onRequest, HTTPS) — receives Playbook push, verifies HMAC-SHA256 signature against `ESTATELY_WEBHOOK_SECRET` (also in Firebase Secrets), writes the lot as a new lead to `leads/{uid}` with `source: "estately"` and `pipelineStage: "Watching"`.
   - `getEstatleyLot` (onCall) — proxies `GET /lots/{lot_id}` for on-demand refresh from the deal detail view.
4. Firestore rule: `leads/{userId}/{lead}` already allows read/write for `ALLOWED_EMAIL` — no rule change needed.
5. Webhook endpoint URL configured in Estately account dashboard against each Playbook.

---

## Question 5 — Legal Pack Comparison

### Test methodology note
A real API key was not available during this spike (owner to provide). The comparison below is based on Estately's published documentation and DealsDash's existing `Legal Pack Review` implementation.

### What Estately's legal pack review covers
- Sale classification: private sale, repossession, probate, receivership
- Title examination: tenure, restrictions, charges, plain English summary
- Risk flagging: LOW to HIGH ratings with document and clause references
- Special conditions: breakdown and buyer cost obligations
- Leasehold: lease length, ground rent, service charges, escalation clauses
- Interactive follow-up via Harland AI (clause-level Q&A)

### What DealsDash's Legal Pack Review covers
- Same: title, restrictions, tenure, special conditions, leasehold terms, sale classification flags
- **Additional — fee extraction into the live appraisal:**
  - Buyer premium (extracted to `deal.fees.other`)
  - Other reimbursements (searches, admin charges) extracted separately
  - Completion date (extracted to `deal.completionDays`)
  - All extracted figures flow immediately into the cash-flow model and max-bid solver
- Red flag routing: flags with urgency "Raise with solicitor before bidding" are surfaced in the Decision Brief as hard PASS reasons

### Differentiator
**DealsDash's fee extraction into the live financial model is not replicated by Estately.** Estately surfaces the legal pack risks and buyer obligations in prose and a risk register; it does not carry extracted figures forward into an arithmetic appraisal. This means:
- A buyer using only Estately may see "3% buyer premium" flagged in the legal pack but still bid without knowing the £ impact on their maximum offer.
- DealsDash auto-deducts the extracted fee from the appraisal, updates the max-bid solver, and re-signals if the deal no longer meets threshold.

The practical workflow for a combined use:
1. Estately webhook delivers the lot to DealsDash pipeline.
2. DealsDash Legal Pack Review runs on the uploaded pack.
3. Extracted fees are applied to the appraisal. Max bid re-solves.
4. The headline strip (Prompt 07) immediately shows whether the deal still works after fees.

---

## Recommendation

**Integrate — minimal scope, phased.**

### Phase 1 (recommended now — ~1 day of Cloud Function work)
- Set up one Playbook in Estately account matching the owner's buy box (OL / SK postcodes, Terrace/Semi, guide under £150k, Estately Score ≥ 52).
- `estatelyWebhook` Cloud Function receives the push, verifies HMAC, writes a lead with address, postcode, guide price, property type, Estately Score, lot URL, and auction date into `leads/{uid}`. Status: `new`. Source: `estately`. Pipeline stage: `Watching`.
- The lead appears in DealsDash's Sourcing view immediately, scored against the buy box, ready for triage.

### Phase 2 (defer — requires owner decision)
- On-demand lot refresh (`getEstatleyLot`) from the lead detail view.
- Populate `lead.areaIntelligence` fields (flood, crime, IMD) from the Estately lot payload, reducing the need to call postcodes.io / Police.uk / Environment Agency separately.
- Pre-populate the legal pack download URL to speed up DealsDash's Legal Pack Review.

### Effort estimate (Phase 1)
| Task | Estimate | Confidence |
|---|---|---|
| Create `estatelyWebhook` Cloud Function | 3–4 hours | High |
| Store `ESTATELY_API_KEY` + `ESTATELY_WEBHOOK_SECRET` in Firebase Secrets | 15 min | High |
| Configure Playbook + webhook in Estately account | 30 min | High |
| Map Estately lot fields to DealsDash lead schema | 1 hour | High |
| Test with a real lot | 30 min | Medium (depends on live lots matching) |
| **Total** | **~6 hours** | **High** |

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| API is beta; terms could change or move to paid | Medium | Free-for-personal-use is explicitly stated; Phase 1 is low-investment so the cost of losing access is low. Monitor terms. |
| Coverage gaps — small local North West auctioneers not indexed | Medium | Auction House UK Manchester and SDL cover the main volume. Gaps (e.g. Venmore, Bolton Auction Rooms) remain manual. |
| Rate limits undefined for free tier | Low | Phase 1 is webhook-driven (Estately pushes; we don't poll). Daily pull cadence in Phase 2 needs credit-budget assessment. |
| Key rotation is email-only in beta | Low | Only one key in use; rotation risk is low. Move to self-service when available. |
| Estately's lot scoring may disagree with DealsDash's appraisal | Low (feature, not risk) | Estately Score is a filter signal; DealsDash appraisal is the authoritative figure. The two are complementary. |
| North West lot volume is modest (17 Manchester lots at time of check) | Low | This is the live catalogue at one moment; total NW is 231. Playbook webhooks fire as new lots are listed. |

---

## Appendix — API Base URL and Key Endpoints

```
Base: https://api.estately.uk/api/v1
Auth: Authorization: Bearer est_live_<32-hex>

GET  /lots                          # search with filters
GET  /lots/{lot_id}                 # full lot detail
GET  /lots/{lot_id}/legal-pack      # AI risk analysis (cached 24h)
GET  /lots/{lot_id}/comparables     # sold + rental comps
GET  /mandates                      # list/manage Playbooks
POST /mandates/{mandate_id}/test    # preview matches (free)
GET  /me/usage                      # credit balance
```

*Note: API key required to curl-test the above. Owner to provide `est_live_*` key; run against a live lot in OL11/OL12 to verify field population and confirm North West lot IDs before Phase 1 build.*
