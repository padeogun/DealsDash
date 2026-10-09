// Flip strategy — profit-first purchase budget and max-offer solver.
// Profit-first stack: GDV − target profit − all costs = purchase+SDLT budget.
// Source: training day 9 Oct 2026.

import { round2 } from "../utils.js";
import { basisValue, toValuation } from "./valuation.js";
import { splitBudget, maxPrice } from "./solve.js";
import { sdltValue } from "./sdlt.js";

/**
 * Calculate the purchase+SDLT budget for a flip.
 * Returns a number on success or { status:'incomplete', missing:[] } if any cost is null.
 *
 * @param {{
 *   gdv: number|Valuation,     // gross development value (or Valuation object)
 *   profitPct?: number,         // target profit as fraction of GDV (e.g. 0.15)
 *   profitFixed?: number,       // fixed target profit in £ (overrides profitPct)
 *   refurb: number|null,
 *   legals: number|null,        // buy-side + sell-side legal costs combined
 *   saleCosts: number|null,     // EA fee + EPC + any selling costs NOT in legals
 *   finance: number|null,       // total bridge finance cost (interest + fees)
 *   holding: number|null,       // holding costs (insurance, council tax, utilities, etc.)
 * }} opts
 */
export function flipBudget({ gdv, profitPct, profitFixed, refurb, legals, saleCosts, finance, holding }) {
  // RULE 7: any null cost → incomplete, list all missing fields
  const nullCheck = { gdv, refurb, legals, saleCosts, finance, holding };
  const missing = Object.entries(nullCheck)
    .filter(([, v]) => v === null || v === undefined)
    .map(([k]) => k);
  if (missing.length) return { status: "incomplete", missing };

  const gdvVal = basisValue(toValuation(gdv));
  // Profit-first: deduct target profit first, then costs, to derive what's left for purchase
  const profit = profitFixed != null ? Number(profitFixed) : Number(profitPct || 0) * gdvVal;
  const budget = gdvVal - profit - Number(refurb) - Number(legals) - Number(saleCosts) - Number(finance) - Number(holding);
  return round2(budget);
}

/**
 * Max offer (price + SDLT) for a flip using price-dependent costs.
 * When all costs are fixed (not % of price), delegates to splitBudget.
 * When bridge fees are % of loan which is % of price, uses the bisection solver.
 *
 * @param {{ gdv, profitPct, profitFixed, refurb, legals, saleCosts, holding,
 *           bridgeLtvPct, monthlyRate, termMonths, entryFeePct, exitFeePct,
 *           buyer, nation }} deal
 */
export function flipMaxOffer(deal) {
  const {
    gdv, profitPct, profitFixed,
    refurb, legals, saleCosts, holding,
    bridgeLtvPct, monthlyRate, termMonths,
    entryFeePct = 0, exitFeePct = 0,
    buyer = "individual", nation = "ENG",
  } = deal;

  const gdvVal = basisValue(toValuation(gdv));
  const targetProfit = profitFixed != null ? Number(profitFixed) : Number(profitPct || 0) * gdvVal;

  // All fixed costs (not price-dependent)
  const fixedCosts = Number(refurb || 0) + Number(legals || 0) + Number(saleCosts || 0) + Number(holding || 0);

  // Price-dependent finance costs: bridge loan is LTV × price, fees are % of loan
  const ltv = Number(bridgeLtvPct || 0);
  const rate = Number(monthlyRate || 0);
  const months = Number(termMonths || 0);
  const entry = Number(entryFeePct || 0);
  const exit  = Number(exitFeePct  || 0);

  function profitAt(price) {
    const loan       = price * ltv;
    const bridgeCost = round2(loan * rate * months + loan * entry + loan * exit);
    const sdlt       = sdltValue(price, { buyer, nation });
    return gdvVal - targetProfit - fixedCosts - bridgeCost - price - sdlt;
    // positive = budget headroom remaining (price too low); negative = over budget
  }

  // Use bisection: find max price where profitAt(price) >= 0
  const priceRaw = maxPrice(
    (p) => -profitAt(p),   // constraintFn ≤ 0 when profitAt ≥ 0
    { lo: 0, hi: gdvVal, tol: 1 },
  );
  const price = round2(priceRaw);
  const sdlt  = round2(sdltValue(price, { buyer, nation }));
  return { price, sdlt, total: round2(price + sdlt) };
}

/**
 * Minimum sale price for zero profit given a fixed purchase price.
 * breakEven = P + SDLT(P) + refurb + legals + saleCosts + finance + holding
 */
export function flipBreakEvenSale({ price, buyer, nation, refurb = 0, legals = 0, saleCosts = 0, finance = 0, holding = 0 }) {
  const purchaseSdlt = sdltValue(Number(price), { buyer, nation });
  return round2(Number(price) + purchaseSdlt + Number(refurb) + Number(legals) + Number(saleCosts) + Number(finance) + Number(holding));
}

/**
 * Target sale price for a given profit above costs.
 * targetSale = breakEven + targetProfit
 */
export function flipTargetSale(params, targetProfit) {
  return round2(flipBreakEvenSale(params) + Number(targetProfit));
}
