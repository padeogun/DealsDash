# Appraisal v2 — Decisions

**Updated:** 10 October 2026

Paul approved the P00 audit and said "Proceed to P01" without initially answering the clarifying questions.
P01 gate answers confirmed 10 Oct 2026 — see updated statuses below.
All remaining unconfirmed defaults are tagged "Illustrative — verify" in code.

---

## P00 / P01 question answers

| # | Question | Default | Status |
|---|---|---|---|
| 1 | Default flip profit target | **15% of GDV** | Illustrative — **editable per deal** (P02) |
| 2 | Default accepted cash-left-in (BRRR) | **£0** (all money out) | Illustrative — **editable per deal** (P02) |
| 3 | Lender ICR assumption | **125% at 5.5% stressed rate** (company borrower) | Illustrative — **editable per deal** (P02) |
| 4 | Minimum net monthly cash flow per BRRR | **£150/month** | Illustrative — **editable per deal** (P02) |
| 5 | Minimum break-even headroom to pass | **5%** | Illustrative — **editable per deal** (P02) |
| 6 | Monthly viewing target | **20** | Illustrative — unconfirmed |
| 7 | Reserves as % of rent | **Management 10% / Maintenance 8% / Voids 4%** | Illustrative — **editable per deal** (P02) |
| 8 | Vitest as test runner | **Yes** (already installed) | Confirmed |
| 9 | Anything wrong in audit | Not answered | Open |
| 10 | Bridge interest method | Simple vs compound — **editable per deal** | **Confirmed 10 Oct 2026** — both supported; per-deal field `bridgeInterestMode` |

## P02 design note — "editable per deal"

All thresholds (profitPct, acceptedLeftIn, ICR, minNetMonthly, headroom, reserves, bridgeInterestMode) will be stored directly on the deal document. P02 will add these fields to the deal schema with the illustrative defaults as fallbacks. The engine functions already accept all of these as parameters — P02 just wires the stored values through.

---

## Standing decisions (from README §6 — do not re-open)

- Worst-case value is the **default appraisal basis**.
- Refinance proceeds are **borrowing, not profit** — never summed into profit.
- First-time-buyer SDLT relief is **never applied**.
- Scotland (LBTT) and Wales (LTT) return `unsupported` — not calculated.
- No scraping of property portals.
- Deploy only after P10 and Paul's explicit confirmation.
