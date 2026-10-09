// Bridging finance — day-one release and ongoing cost model.
//
// V2 uses SIMPLE interest for retained day-one deductions:
//   interest deducted = gross × monthlyRate × termMonths
// This differs from the existing calcBridgeInterest() in funding.js which uses compound
// interest. The discrepancy is documented in the P01 gate and will be resolved in P02
// once Paul confirms which method matches his lender's actual quotes.
//
// Source: training day 9 Oct 2026 — Katie deal walkthrough (gross 75k → release 63,350).

import { round2 } from "../utils.js";

/**
 * Calculate day-one release and cost metrics for a bridging loan.
 *
 * @param {{
 *   gross: number,            // gross loan amount (before deductions)
 *   monthlyRate: number,      // monthly interest rate (e.g. 0.01 = 1%)
 *   termMonths: number,       // agreed loan term in months
 *   interestMode: 'retained'|'rolled'|'serviced',
 *   entryFeePct: number,      // arrangement/entry fee as % of gross
 *   exitFeePct: number,       // exit fee as % of gross
 *   exitFeeTiming: 'start'|'redemption',  // when exit fee is charged
 *   brokerFee?: number,       // absolute broker fee (£)
 *   valuationFee?: number,    // absolute valuation fee (£)
 *   lenderLegal?: number,     // lender's legal fee (£)
 *   admin?: number,           // admin/drawdown fee (£)
 *   extensionRate?: number,   // monthly rate during extension (defaults to monthlyRate)
 * }} opts
 *
 * @returns {{
 *   dayOneRelease: number,
 *   totalCostAt: (month:number) => number,
 *   redemptionAt: (month:number) => number,
 *   extensionCostPerMonth: number,
 *   monthlyServicing: number,
 * }}
 */
export function bridgeRelease({
  gross,
  monthlyRate,
  termMonths,
  interestMode = "retained",
  entryFeePct = 0,
  exitFeePct = 0,
  exitFeeTiming = "redemption",
  brokerFee = 0,
  valuationFee = 0,
  lenderLegal = 0,
  admin = 0,
  extensionRate,
}) {
  gross = Number(gross);
  monthlyRate = Number(monthlyRate);
  termMonths = Number(termMonths);

  const entryFee     = round2(gross * (Number(entryFeePct) || 0));
  const exitFeeAmt   = round2(gross * (Number(exitFeePct)  || 0));
  const isExitAtStart = exitFeeTiming === "start";

  // All absolute fees paid on day one
  const dayOneFees = round2(
    entryFee
    + (isExitAtStart ? exitFeeAmt : 0)
    + Number(brokerFee   || 0)
    + Number(valuationFee || 0)
    + Number(lenderLegal  || 0)
    + Number(admin        || 0),
  );

  let dayOneRelease;
  let monthlyServicing = 0;

  if (interestMode === "serviced") {
    // Serviced: interest paid monthly from borrower's own cash — not deducted from gross
    monthlyServicing = round2(gross * monthlyRate);
    dayOneRelease = round2(gross - dayOneFees);
  } else {
    // Retained / rolled: simple interest deducted from gross on day one
    // Formula: gross × monthlyRate × termMonths  (training 9 Oct 2026)
    const simpleInterest = round2(gross * monthlyRate * termMonths);
    dayOneRelease = round2(gross - simpleInterest - dayOneFees);
  }

  // Redemption at month m: gross + simple interest accrued + exit fee (if at redemption)
  function redemptionAt(month) {
    const interestAccrued = round2(gross * monthlyRate * Number(month));
    const exitAtRedemption = !isExitAtStart ? exitFeeAmt : 0;
    return round2(gross + interestAccrued + exitAtRedemption);
  }

  // Total cost of borrowing at month m (all fees + interest)
  function totalCostAt(month) {
    const interestCost = interestMode === "serviced"
      ? round2(monthlyServicing * Number(month))
      : round2(gross * monthlyRate * Number(month));
    const allFees = round2(dayOneFees + (!isExitAtStart ? exitFeeAmt : 0));
    return round2(interestCost + allFees);
  }

  const extensionCostPerMonth = round2(gross * (Number(extensionRate) || monthlyRate));

  return { dayOneRelease, totalCostAt, redemptionAt, extensionCostPerMonth, monthlyServicing };
}
