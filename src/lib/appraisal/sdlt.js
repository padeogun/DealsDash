// SDLT — England only (as at June 2026).
// RULE 12: First-time buyer relief NEVER applied; Scotland/Wales return { status:'unsupported' }.
// RULE 11: effectiveFrom and verifyAt on every band table.
// Higher rates: companies + additional dwellings; exempt under £40k.

import { round2 } from "../utils.js";

// Band tables — data-driven so future rate changes are a one-line edit.
// Illustrative — verify at GOV.UK before use.
const TABLES = {
  ENG_STANDARD: {
    id: "ENG_STANDARD",
    effectiveFrom: "2025-04-01",
    verifyAt: "https://www.gov.uk/stamp-duty-land-tax/residential-property-rates",
    note: "Illustrative — verify at GOV.UK before use",
    bands: [
      [0,       125000,   0.00],
      [125000,  250000,   0.02],
      [250000,  925000,   0.05],
      [925000,  1500000,  0.10],
      [1500000, Infinity, 0.12],
    ],
  },
  ENG_HIGHER: {
    id: "ENG_HIGHER",
    effectiveFrom: "2024-10-31",
    verifyAt: "https://www.gov.uk/stamp-duty-land-tax/residential-property-rates",
    note: "Additional dwelling / company purchase — higher rates (+5pp) — Illustrative — verify at GOV.UK before use",
    bands: [
      [0,       125000,   0.05],
      [125000,  250000,   0.07],
      [250000,  925000,   0.10],
      [925000,  1500000,  0.15],
      [1500000, Infinity, 0.17],
    ],
    exemptUnder: 40000,  // surcharge not charged on purchases below this threshold
  },
};

function applyBands(price, bands) {
  let tax = 0;
  const detail = [];
  for (const [lo, hi, rate] of bands) {
    const cap = hi === Infinity ? price : hi;
    const taxable = Math.max(0, Math.min(price, cap) - lo);
    if (taxable <= 0) continue;
    const amount = round2(taxable * rate);
    detail.push({ lo, hi: hi === Infinity ? null : hi, rate, taxable, amount });
    tax += amount;
  }
  return { tax: round2(tax), detail };
}

/**
 * Calculate SDLT for England.
 * @param {number} price
 * @param {{ nation?:string, buyer?:'individual'|'company', firstTimeBuyer?:boolean,
 *           additionalDwelling?:boolean }} opts
 * @returns {{ value:number, bands:object[], effectiveFrom:string, verifyAt:string,
 *             note:string, warning?:string } | { status:'unsupported', reason:string }}
 */
export function sdlt(price, opts = {}) {
  const {
    nation = "ENG",
    buyer = "individual",
    firstTimeBuyer = false,
    additionalDwelling = false,
  } = opts;

  price = Number(price) || 0;

  if (nation === "SCT") return { status: "unsupported", reason: "LBTT not implemented — consult a Scottish solicitor" };
  if (nation === "WAL") return { status: "unsupported", reason: "LTT not implemented — consult a Welsh solicitor" };

  const useHigher = buyer === "company" || additionalDwelling;

  // Surcharge exempt for purchases under £40k (companies / additional dwellings)
  if (useHigher && price < TABLES.ENG_HIGHER.exemptUnder) {
    const t = TABLES.ENG_HIGHER;
    return { value: 0, bands: [], effectiveFrom: t.effectiveFrom, verifyAt: t.verifyAt, note: `Surcharge exempt: price < £${t.exemptUnder.toLocaleString()}` };
  }

  const table = useHigher ? TABLES.ENG_HIGHER : TABLES.ENG_STANDARD;
  const { tax, detail } = applyBands(price, table.bands);

  const result = {
    value: tax,
    bands: detail,
    effectiveFrom: table.effectiveFrom,
    verifyAt: table.verifyAt,
    note: table.note,
  };

  // RULE 12: FTB relief is never applied — flag it if requested so the user knows
  if (firstTimeBuyer) {
    result.warning = "First-time buyer SDLT relief not applied — not implemented in this tool. Verify current rates with HMRC.";
  }

  return result;
}

/** Return only the numeric SDLT amount. Returns 0 for unsupported nations (caller guards nation). */
export function sdltValue(price, opts) {
  const r = sdlt(price, opts);
  return r.status === "unsupported" ? 0 : r.value;
}
