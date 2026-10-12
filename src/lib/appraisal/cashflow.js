// BTL / BRRR cash flow and ICR.
// RULE 10: Refinance proceeds are borrowing, not profit.
// Net monthly is rent minus mortgage minus operating reserves (management, maintenance, voids)
// minus insurance and other fixed costs.
// ICR uses annual rent / (loan × stressed rate) — lender criterion, not regulatory mandate.

import { round2 } from "../utils.js";

/**
 * Net monthly cash flow for a BTL/BRRR property.
 * @param {{
 *   rent: number,          monthly gross rent (£)
 *   mortgage: number,      monthly mortgage payment (interest-only or repayment)
 *   mgmtPct?: number,      management fee as fraction of rent (e.g. 0.10)
 *   maintPct?: number,     maintenance reserve as fraction of rent (e.g. 0.08)
 *   voidsPct?: number,     void allowance as fraction of rent (e.g. 0.04)
 *   insurance?: number,    monthly landlord insurance (£)
 *   other?: number,        other monthly fixed costs (£)
 * }} opts
 */
export function netMonthly({ rent, mortgage, mgmtPct = 0, maintPct = 0, voidsPct = 0, insurance = 0, other = 0 }) {
  rent = Number(rent) || 0;
  mortgage = Number(mortgage) || 0;
  // Combined reserve percentage (management + maintenance + voids)
  const reservePct = Number(mgmtPct) + Number(maintPct) + Number(voidsPct);
  const reserves   = round2(rent * reservePct);
  const net        = round2(rent - mortgage - reserves - Number(insurance) - Number(other));
  return { net, rent, mortgage, reserves, insurance: Number(insurance), other: Number(other) };
}

/**
 * ICR (Interest Coverage Ratio) check.
 * ICR = annualRent / (loan × stressRate).
 * Most UK BTL lenders require ICR ≥ 1.25 at a stressed rate (often 5–5.5%).
 * Illustrative — confirm with your broker.
 */
export function icrPass(annualRent, loan, stressRate, threshold = 1.25) {
  annualRent = Number(annualRent);
  loan       = Number(loan);
  stressRate = Number(stressRate);
  if (loan <= 0 || stressRate <= 0) return { pass: null, icr: null, threshold };
  const icr = round2(annualRent / (loan * stressRate));
  return { pass: icr >= threshold, icr, threshold };
}

/**
 * Monthly mortgage payment.
 * mode: 'interest-only' | 'repayment'
 * For repayment: standard P&I formula.
 */
export function monthlyMortgage(loan, annualRate, termMonths, mode = "interest-only") {
  loan        = Number(loan);
  annualRate  = Number(annualRate);
  termMonths  = Number(termMonths);
  const r = annualRate / 12;
  if (mode === "interest-only" || r === 0) {
    return round2(loan * r);
  }
  // Repayment (P&I): loan × r × (1+r)^n / ((1+r)^n − 1)
  const factor = Math.pow(1 + r, termMonths);
  return round2(loan * r * factor / (factor - 1));
}
