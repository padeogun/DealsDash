// Cost lines — RULE 7: null is not zero.
// Any CostLine with amount === null is "unknown".
// sumCosts propagates incomplete status rather than silently treating null as £0.
//
// Phase A1 additions: legalTotal(), refurbTotal(), holdingCostLine(),
// holdingMonthlyRate(), totalProjectMonths() — structured cost helpers that
// support both lump-sum and itemised detail entry modes.

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

// ── Structured cost helpers (lump / detail mode) ─────────────────────────────

/**
 * Compute total legal & acquisition cost from a v2 legal config object.
 * Lump mode:   returns lumpTotal (null if not entered — blocks Pass, RULE 7).
 * Detail mode: sums all seven named fields; any null field → null (RULE 7).
 * @param {object|null} legal
 * @returns {number|null}
 */
export function legalTotal(legal) {
  if (!legal) return null;
  if (legal.mode === "lump" || !legal.mode) return legal.lumpTotal ?? null;
  const fields = ["solicitor", "searches", "survey", "broker", "valuation", "landReg", "other"];
  const vals = fields.map((f) => legal[f]);
  if (vals.some((v) => v === null || v === undefined)) return null;
  return round2(vals.reduce((s, v) => s + (Number(v) || 0), 0));
}

/** Resolve a single refurb item's active amount given a scenario. */
function refurbItemAmount(item, scenario) {
  if (item.low != null && item.high != null) {
    if (scenario === "low")  return Number(item.low);
    if (scenario === "high") return Number(item.high);
    return round2((Number(item.low) + Number(item.high)) / 2); // "mid"
  }
  return item.amount ?? null;
}

/**
 * Compute total refurb cost (including contingency) from a v2 refurb config.
 * Lump mode:   lumpTotal × (1 + contingencyPct) — null if lumpTotal not entered.
 * Detail mode: sum items at chosen scenario × (1 + contingencyPct).
 *   Any item with no resolvable amount → null (RULE 7). Empty items → null.
 * Scenario: "high" (worst-case, default per RULE 9) | "mid" | "low".
 * @param {object|null} refurb
 * @returns {number|null}
 */
export function refurbTotal(refurb) {
  if (!refurb) return null;
  const contingency = Number(refurb.contingencyPct) || 0;

  if (refurb.mode === "lump" || !refurb.mode) {
    if (refurb.lumpTotal == null) return null;
    return round2(Number(refurb.lumpTotal) * (1 + contingency));
  }

  const items = refurb.items || [];
  if (items.length === 0) return null;
  const scenario = refurb.scenario || "high";
  let subtotal = 0;
  for (const item of items) {
    const amt = refurbItemAmount(item, scenario);
    if (amt === null) return null; // unknown line — RULE 7
    subtotal += amt;
  }
  return round2(subtotal * (1 + contingency));
}

/**
 * Compute monthly non-finance holding rate from a v2 holding config.
 * Lump mode:   returns lumpMonthly (null if not entered).
 * Detail mode: sums ctax + insurance + utilities + other; any null → null (RULE 7).
 * @param {object|null} holding
 * @returns {number|null}
 */
export function holdingMonthlyRate(holding) {
  if (!holding) return null;
  if (holding.mode === "lump" || !holding.mode) return holding.lumpMonthly ?? null;
  const fields = ["ctax", "insurance", "utilities", "other"];
  const vals = fields.map((f) => holding[f]);
  if (vals.some((v) => v === null || v === undefined)) return null;
  return round2(vals.reduce((s, v) => s + (Number(v) || 0), 0));
}

/**
 * Build an auto-generated CostLine for non-finance holding costs.
 * Amount = holdingMonthlyRate(holding) × totalMonths.
 * Returns amount:null if rate or months are unknown.
 * @param {object|null} holding
 * @param {number}      totalMonths  - total project duration from phases
 * @returns {CostLine}
 */
export function holdingCostLine(holding, totalMonths) {
  const monthly = holdingMonthlyRate(holding);
  if (monthly === null || !totalMonths) {
    return costLine("holding", "Holding costs", null, "estimate");
  }
  return costLine(
    "holding",
    "Holding costs",
    round2(monthly * totalMonths),
    "estimate",
    `${totalMonths} mo × £${monthly.toLocaleString("en-GB")}/mo`,
  );
}

/**
 * Derive total project duration in whole months from a phases array.
 * Uses 4.33 weeks/month (calendar average).
 * @param {Array<{weeks:number}>} phases
 * @returns {number}
 */
export function totalProjectMonths(phases) {
  if (!phases || phases.length === 0) return 0;
  return Math.round(phases.reduce((s, p) => s + (Number(p.weeks) || 0), 0) / 4.33);
}
