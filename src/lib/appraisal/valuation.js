// Three-point valuation model (worst / mid / best).
// RULE 9: worst-case is the default appraisal basis.
// If only one value is supplied all three are set to it and singlePoint:true is flagged — warn
// the user to add comparables.

/**
 * @typedef {{ best:number, mid:number, worst:number, basis:'worst'|'mid'|'best',
 *   comparables:Array<{address:string, price:number, date:string, type:string, source:string}>,
 *   singlePoint?:boolean }} Valuation
 */

/** Return the basis value from a Valuation. Default basis: 'worst'. */
export function basisValue(val) {
  const basis = (val && val.basis) || "worst";
  return val[basis] ?? val.worst ?? val.mid ?? val.best;
}

/** Wrap a single number as a single-point Valuation (flags singlePoint:true). */
export function singlePointValuation(value) {
  return {
    best: value, mid: value, worst: value,
    basis: "worst", comparables: [], singlePoint: true,
  };
}

/**
 * Accept either a raw number or a Valuation object.
 * Raw numbers are wrapped with singlePointValuation.
 */
export function toValuation(v) {
  if (v !== null && typeof v === "object" && "worst" in v) return v;
  return singlePointValuation(Number(v) || 0);
}
