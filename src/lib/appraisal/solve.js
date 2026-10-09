// Bisection solver for price-constrained optimisation.
// Used by splitBudget and flipMaxOffer.

import { round2 } from "../utils.js";
import { sdltValue } from "./sdlt.js";

/**
 * Find the maximum x in [lo, hi] where constraintFn(x) ≤ 0.
 * constraintFn must be monotonically increasing (positive = too high, negative = too low).
 * tol: stop when interval width < tol (default 1 = ±£1).
 */
export function maxPrice(constraintFn, { lo = 0, hi, tol = 1 } = {}) {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 80; i++) {
    if (b - a < tol) break;
    const mid = (a + b) / 2;
    if (constraintFn(mid) <= 0) a = mid;
    else b = mid;
  }
  return a; // un-rounded; caller rounds
}

/**
 * Split a purchase+SDLT budget into (price, sdlt).
 * Finds the max price P such that P + sdlt(P, buyer) ≤ budget.
 *
 * Returns { price, sdlt } both rounded to 2 dp.
 * price + sdlt will equal budget to within £0.01 due to rounding.
 */
export function splitBudget(budget, buyer = {}) {
  budget = Number(budget);
  const p = maxPrice(
    (p) => p + sdltValue(p, buyer) - budget,
    { lo: 0, hi: budget, tol: 0.001 },
  );
  const priceRounded = round2(p);
  const sdltRounded = round2(sdltValue(priceRounded, buyer));
  return { price: priceRounded, sdlt: sdltRounded };
}
