// BRRR strategy — refi-first purchase budget, break-even, and position analytics.
// RULE 10: Refinance proceeds are borrowing, not profit. Never summed into profit.
// Source: training day 9 Oct 2026 — Katie and Sean deal walkthroughs.

import { round2 } from "../utils.js";
import { basisValue, toValuation } from "./valuation.js";
import { sdltValue } from "./sdlt.js";
import { maxPrice } from "./solve.js";

/**
 * Total project cost at a given purchase price (price-dependent).
 * = price + SDLT(price) + legals + refurb + finance + holding + other
 *
 * @param {number} price
 * @param {{ buyer?:string, nation?:string, legals?:number, refurb?:number,
 *           finance?:number, holding?:number, other?:number }} costs
 */
export function totalProjectCost(price, costs = {}) {
  const { buyer, nation, legals = 0, refurb = 0, finance = 0, holding = 0, other = 0 } = costs;
  price = Number(price);
  const sdlt = sdltValue(price, { buyer, nation });
  return round2(price + sdlt + Number(legals) + Number(refurb) + Number(finance) + Number(holding) + Number(other));
}

/**
 * Cash left in after refinancing.
 * cashLeftIn = totalProjectCost(P) − netRefi
 * Negative = cash surplus (money pulled out above cost).
 */
export function cashLeftIn(price, costs, { endValue, ltv, refiFees = 0 }) {
  const cost = totalProjectCost(price, costs);
  const grossRefi = round2(Number(endValue) * Number(ltv));
  const netRefi   = round2(grossRefi - Number(refiFees));
  return round2(cost - netRefi);
}

/**
 * Calculate the purchase+SDLT budget for a BRRR deal.
 * Formula: netRefi + acceptedLeftIn − (refurb + legals + finance + holding + other)
 * Returns a number on success or { status:'incomplete', missing:[] } if any cost is null.
 *
 * @param {{
 *   endValue: number|Valuation,  // post-refurb value (or Valuation)
 *   ltv: number,                 // refinance LTV (e.g. 0.75)
 *   refiFees?: number,           // valuation, legal, product fee at refinance (£)
 *   acceptedLeftIn: number,      // max cash the investor will leave in the deal
 *   refurb: number|null,
 *   legals: number|null,
 *   finance: number|null,        // bridge finance cost (interest + fees, NOT loan principal)
 *   holding: number|null,
 *   other?: number|null,
 * }} opts
 */
export function brrrBudget({ endValue, ltv, refiFees = 0, acceptedLeftIn, refurb, legals, finance, holding, other = 0 }) {
  const nullCheck = { endValue, refurb, legals, finance, holding };
  const missing = Object.entries(nullCheck)
    .filter(([, v]) => v === null || v === undefined)
    .map(([k]) => k);
  if (missing.length) return { status: "incomplete", missing };

  const endVal   = basisValue(toValuation(endValue));
  const grossRefi = round2(endVal * Number(ltv));
  const netRefi   = round2(grossRefi - Number(refiFees));

  // budget = the amount available to cover price + SDLT
  const costs = Number(refurb) + Number(legals) + Number(finance) + Number(holding) + Number(other || 0);
  return round2(netRefi + Number(acceptedLeftIn) - costs);
}

/**
 * Max offer price for a BRRR deal, found by bisection.
 * Finds max P where cashLeftIn(P) ≤ acceptedLeftIn.
 */
export function brrrMaxOffer({ endValue, ltv, refiFees = 0, acceptedLeftIn = 0, buyer, nation, refurb = 0, legals = 0, finance = 0, holding = 0, other = 0 }) {
  const endVal    = basisValue(toValuation(endValue));
  const grossRefi = round2(endVal * Number(ltv));
  const netRefi   = round2(grossRefi - Number(refiFees));
  const costs     = { buyer, nation, legals, refurb, finance, holding, other };

  const priceRaw = maxPrice(
    (p) => cashLeftIn(p, costs, { endValue: endVal, ltv, refiFees }) - Number(acceptedLeftIn),
    { lo: 0, hi: netRefi + Number(acceptedLeftIn), tol: 1 },
  );
  const price = round2(priceRaw);
  const sdlt  = round2(sdltValue(price, { buyer, nation }));
  return { price, sdlt, total: round2(price + sdlt) };
}

/**
 * Break-even valuation: the minimum post-refurb value needed so the refinance
 * covers all costs given the accepted cash left in.
 * Formula: (totalCost + refiFees − acceptedLeftIn) / ltv
 * Source: training 9 Oct 2026 — Katie deal.
 */
export function breakEvenValuation({ totalCost, ltv, refiFees = 0, acceptedLeftIn = 0 }) {
  const numerator = Number(totalCost) + Number(refiFees) - Number(acceptedLeftIn);
  return round2(numerator / Number(ltv));
}

/**
 * Headroom as a fraction of the current value.
 * headroomPct = (value − breakEven) / value
 * Negative = the refinance does not cover costs at this value.
 */
export function headroomPct(value, breakEven) {
  value    = Number(value);
  breakEven = Number(breakEven);
  if (value <= 0) return null;
  return round2((value - breakEven) / value);
}

/**
 * Refinance surplus / shortfall at a given value.
 * refiPosition = value × ltv − totalCost
 * Positive = surplus (cash back after paying all costs from refi proceeds).
 * Negative = shortfall (additional cash needed to repay bridge and other costs).
 * Source: training 9 Oct 2026 — sensitivity analysis across 240k-280k values.
 */
export function refiPosition({ value, ltv, totalCost }) {
  return round2(Number(value) * Number(ltv) - Number(totalCost));
}
