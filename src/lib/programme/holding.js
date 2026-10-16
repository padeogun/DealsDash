// Programme-based holding cost comparison.
// Reuses holdingCostLine / holdingMonthlyRate from the appraisal cost model.
// Does NOT replace the manual input — shown alongside for comparison only.

import { holdingCostLine, holdingMonthlyRate } from '../appraisal/costs.js';

/**
 * Compute programme-based holding months from completion → saleCompleted.
 * Returns a fractional month count (calendar days / 30.4375).
 */
export function programmeHoldingMonths(completion, saleCompleted) {
  if (!completion || !saleCompleted) return null;
  const d0 = new Date(completion    + 'T00:00:00Z');
  const d1 = new Date(saleCompleted + 'T00:00:00Z');
  const days = Math.round((d1 - d0) / 86400000);
  return days / 30.4375;
}

/**
 * Compare programme-based holding cost against the manual deal figure.
 * holding — the deal's holding-cost input object (passed to holdingCostLine).
 * manualMonths — the deal's manual totalProjectMonths() value.
 * programmeMonths — from programmeHoldingMonths().
 * Returns { manualCost, programmeCost, difference, programmeMonths }.
 */
export function holdingComparison(holding, manualMonths, programmeMonths) {
  if (programmeMonths == null) return null;
  const manualCost    = holdingCostLine(holding, manualMonths);
  const programmeCost = holdingCostLine(holding, programmeMonths);
  const difference    = programmeCost - manualCost;
  return { manualCost, programmeCost, difference, programmeMonths };
}

/**
 * Monthly rate convenience re-export so UI only needs this module.
 */
export { holdingMonthlyRate };
