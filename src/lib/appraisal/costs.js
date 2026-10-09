// Cost lines — RULE 7: null is not zero.
// Any CostLine with amount === null is "unknown".
// sumCosts propagates incomplete status rather than silently treating null as £0.

import { round2 } from "../utils.js";

/**
 * @typedef {{ key:string, label:string, amount:number|null,
 *   basis:'quote'|'estimate'|'benchmark'|'illustrative', source?:string }} CostLine
 */

/**
 * Sum an array of CostLines.
 * Returns { total:number|null, status:'complete'|'incomplete', missing:string[] }.
 */
export function sumCosts(lines) {
  const missing = lines
    .filter((l) => l.amount === null || l.amount === undefined)
    .map((l) => l.key);
  if (missing.length > 0) return { total: null, status: "incomplete", missing };
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { total, status: "complete", missing: [] };
}

/** Convenience: build a CostLine from a raw number or null. */
export function costLine(key, label, amount, basis = "estimate", source) {
  return { key, label, amount: amount === undefined ? null : amount, basis, source };
}
