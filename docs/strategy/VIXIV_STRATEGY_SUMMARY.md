# VIXIV LTD — Strategy Summary

**Single source of truth for external materials, pitches, and internal planning.**
**Last reviewed:** 17 October 2026 · **Owner:** Paul Adeogun

> Any figure or claim in external materials must be sourced from this document or explicitly labelled with its own basis. Do not quote the app's Business Planner default assumptions as company data.

---

## 1. Company

| | |
|---|---|
| **Legal name** | VIXIV LTD |
| **Owner / director** | Paul Adeogun |
| **Entity type** | Company purchaser — additional-dwelling SDLT rates apply to all purchases |
| **Stage** | Pipeline-building — active sourcing, no completed transactions as at October 2026 |

---

## 2. Strategy

**Core strategy:** Buy residential property in England below market value, add value through light-to-medium refurbishment, and exit via flip sale (primary) or hold as BTL / BRRR (secondary).

**Target geography:** Northern England (specific districts TBD from live screener data — see §6).

**Target asset type:** Freehold residential, needs-work condition, guide price up to £150,000.

**Profit target:** 15% of GDV minimum on flips — illustrative, unconfirmed with broker/accountant.

**Finance route:** Bridging + own equity. ICR assumption: 125% at 5.5% stressed rate for a company borrower — illustrative, verify with broker.

---

## 3. Track record

**VIXIV LTD has no completed investment transactions as at October 2026.**

The financial examples used in training materials, internal appraisals, and the DealsDash Business Planner are **training illustrations** sourced from the Progressive Property Academy masterclass (9 October 2026). They represent worked examples on hypothetical properties, not actual VIXIV deals.

When referencing these figures externally:
- Label every example: *"Illustrative — training example (Progressive Property Academy, Oct 2026)"*
- Do not present them as completed VIXIV transactions or as evidence of returns achieved.

---

## 4. Capital structure

| Source | Amount | Terms |
|---|---|---|
| Revolving fund (family and friends) | £50,000 | 8% p.a., target 365-day turn, 90-day extension allowed |
| Bridging finance | Deal-by-deal | See §5 for day-one release calculation |
| Own equity | Deal-by-deal | Fills the gap between bridge release and total costs |

---

## 5. Cash needed per deal — correct calculations

All figures below are **illustrative — training example** (Progressive Property Academy, 9 Oct 2026). They model the flip golden case (£180,000 GDV, 15% profit target, £25,000 refurb) and are **not** based on a completed VIXIV transaction.

### Golden-case inputs

| Item | Amount |
|---|---|
| GDV (worst-case comparables) | £180,000 |
| Profit target (15% of GDV) | £27,000 |
| Refurbishment | £25,000 |
| Purchase legals | £3,000 |
| Holding costs | £2,000 |
| Bridge gross / day-one release | £75,000 / £63,350 |
| **Purchase + SDLT budget** | **£110,800** |
| └ Purchase price | £105,523.81 |
| └ SDLT (company / additional dwelling) | £5,276.19 |

### Scenario A — own-cash refurb, bridge covers purchase only

| Milestone | Own cash deployed |
|---|---|
| Completion (day 1): purchase budget − bridge release = £110,800 − £63,350 | **£47,450** |
| Works period (refurb + legals + holding): + £25,000 + £3,000 + £2,000 | **£30,000** |
| **Peak own-cash commitment** | **£77,450** |

### Scenario B — development facility covers purchase and refurb draw-downs

| Milestone | Own cash deployed |
|---|---|
| Completion (day 1) | **£47,450** |
| Peak (facility covers refurb as incurred; gap only) | **≈ £52,450** |

### Scenario C — full cash purchase, refinance at 75% LTV (partnership / no-bridge route)

| Item | Amount |
|---|---|
| Total cash deployed (purchase + refurb + legals + holding) | £140,800 |
| Refinance proceeds (75% × £180,000 GDV) | £135,000 |
| **Cash left in after refinance** | **£5,800** |

### Key correction vs. Business Planner defaults

The app's Business Planner ships with `avgCashPerDeal = £30,000` as a placeholder. **This is below the minimum cash requirement of £47,450 on completion day even in the most bridging-heavy scenario (A or B).** The £30,000 default should be treated as a slider start point only; the correct planning figure is **£47,450–£77,450** depending on the refurb finance route.

The `avgNetProfitPerDeal` default of £20,000 is also below the golden-case target of £27,000 (15% × £180k GDV). Use at least £25,000–£30,000 in planning projections until actual deal data is available.

---

## 6. Market data — what is and is not verified

| Data source | Status | Where used |
|---|---|---|
| Land Registry SPARQL (price momentum, HPI) | **Live** — fetched per district on demand | Deal detail area signals, Screener (when built) |
| postcodes.io IMD decile | **Live** — fetched per postcode | Deal detail area signals |
| Screener mock data in User Guide (Bradford, Rochdale, Burnley, Rotherham, Stoke-on-Trent scores, yields, prices) | **Illustrative only** — created for the User Guide preview image; not sourced from live data | `UserGuideView.jsx` ScreenerMockup SVG |
| Business Planner default thresholds (profit %, ICR, headroom, reserves) | **Illustrative — verify** with broker/accountant | App Settings, Business Planner sliders |

**Do not quote the screener mock data as researched market analysis.** When you need real figures for a specific district, run the live screener or pull Land Registry data.

---

## 7. Open items

| # | Item | Owner | Priority |
|---|---|---|---|
| 1 | Confirm profit-target % with broker/accountant | Paul | Before first live deal |
| 2 | Confirm ICR assumption (125% / 5.5%) with broker | Paul | Before first live deal |
| 3 | Update Business Planner defaults to reflect §5 figures | Dev | P12 |
| 4 | Label ScreenerMockup SVG with "Sample data — illustrative only" | Dev | P12 |
| 5 | Identify target postcode districts from live screener data | Paul | Active |
