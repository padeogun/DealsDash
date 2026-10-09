# Appraisal v2 — Decisions

**Updated:** 9 October 2026

Paul approved the P00 audit and said "Proceed to P01" without answering the clarifying questions.
All defaults below are **illustrative** (from the training day / README) and tagged accordingly in code.
Update this file with confirmed answers at any time; the settings flow through from `src/lib/appraisal/`.

---

## P00 question answers (illustrative until confirmed)

| # | Question | Illustrative default | Status |
|---|---|---|---|
| 1 | Default flip profit target | **15% of GDV** | Unconfirmed |
| 2 | Default accepted cash-left-in (BRRR) | **£0** (all money out) | Unconfirmed |
| 3 | Lender ICR assumption | **125% at 5.5% stressed rate** (company borrower) | Unconfirmed |
| 4 | Minimum net monthly cash flow per BRRR | **£150/month** | Unconfirmed |
| 5 | Minimum break-even headroom to pass | **5%** | Unconfirmed |
| 6 | Monthly viewing target | **20** | Unconfirmed |
| 7 | Reserves as % of rent | **Management 10% / Maintenance 8% / Voids 4%** | Unconfirmed |
| 8 | Vitest as test runner | **Yes** (already installed) | Confirmed by audit |
| 9 | Anything wrong in audit | Not answered | Open |

---

## Standing decisions (from README §6 — do not re-open)

- Worst-case value is the **default appraisal basis**.
- Refinance proceeds are **borrowing, not profit** — never summed into profit.
- First-time-buyer SDLT relief is **never applied**.
- Scotland (LBTT) and Wales (LTT) return `unsupported` — not calculated.
- No scraping of property portals.
- Deploy only after P10 and Paul's explicit confirmation.
