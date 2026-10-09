// Walk-away tests — five structured checks before committing to a deal.
// Every test returns { id, status:'pass'|'warn'|'fail', reasons:[] }.
// Overall verdict = worst of the five.
// All thresholds from DECISIONS.md (illustrative until confirmed).

import { round2 } from "../utils.js";
import { headroomPct, breakEvenValuation, refiPosition } from "./brrr.js";
import { netMonthly, icrPass } from "./cashflow.js";
import { bridgeRelease } from "./bridging.js";

// Illustrative defaults — source: DECISIONS.md §P00
const DEFAULTS = {
  minComparables:  3,
  minHeadroom:     0.05,   // 5% break-even headroom
  minNetMonthly:   150,    // £150/month minimum net cash flow
  icrThreshold:    1.25,   // lender ICR threshold
  icrStressRate:   0.055,  // 5.5% stressed rate (company borrower)
  valDropForResilience: 0.10,   // −10% valuation in resilience scenario
  refurbRiseForResilience: 0.10, // +10% refurb
  delayMonthsForResilience: 3,
};

/**
 * Run the five walk-away tests.
 *
 * @param {{
 *   valuation: { worst, mid, best, comparables: any[], singlePoint?: boolean },
 *   costs: { total:number|null, status:'complete'|'incomplete', missing:string[] },
 *   lenderRoute: string|null,    // e.g. 'broker: Moneycorp' or null if not arranged
 *   totalCost: number,
 *   endValue: number,
 *   ltv: number,
 *   refiFees?: number,
 *   acceptedLeftIn?: number,
 *   rent: number,
 *   mortgage: number,
 *   loan: number,
 *   mgmtPct?: number, maintPct?: number, voidsPct?: number,
 *   bridge?: object,             // bridgeRelease input
 *   cashReserve?: number,
 * }} deal
 * @param {object} settings  Override any DEFAULTS key
 */
export function walkAway(deal, settings = {}) {
  const cfg = { ...DEFAULTS, ...settings };
  const tests = [];

  // ── Test 1: Value ────────────────────────────────────────────────────────────
  {
    const reasons = [];
    let status = "pass";
    if (deal.valuation?.singlePoint) {
      reasons.push("Single-point valuation — no low/mid/best split; add comparables.");
      status = "warn";
    }
    const compCount = (deal.valuation?.comparables || []).length;
    if (compCount < cfg.minComparables) {
      reasons.push(`Only ${compCount} comparable(s) recorded — recommend ≥ ${cfg.minComparables}.`);
      status = status === "fail" ? "fail" : "warn";
    }
    if (!deal.valuation || deal.valuation.worst == null) {
      reasons.push("No valuation entered.");
      status = "fail";
    }
    tests.push({ id: "value", status, reasons });
  }

  // ── Test 2: Costs ────────────────────────────────────────────────────────────
  {
    const reasons = [];
    let status = "pass";
    if (deal.costs?.status === "incomplete") {
      const m = deal.costs.missing || [];
      reasons.push(`Unknown cost line(s): ${m.join(", ")}. Cannot appraise until these are filled.`);
      status = "fail";
    }
    tests.push({ id: "costs", status, reasons });
  }

  // ── Test 3: Refinance ────────────────────────────────────────────────────────
  {
    const reasons = [];
    let status = "pass";
    if (!deal.lenderRoute) {
      reasons.push("No lender route recorded — arrange indicative DIP before bidding.");
      status = "warn";
    }
    const bev = breakEvenValuation({ totalCost: deal.totalCost, ltv: deal.ltv, refiFees: deal.refiFees || 0, acceptedLeftIn: deal.acceptedLeftIn || 0 });
    const hw  = headroomPct(deal.endValue, bev);
    if (hw < 0) {
      reasons.push(`Break-even headroom is negative (${(hw * 100).toFixed(1)}%) — refinance does not cover costs at current valuation.`);
      status = "fail";
    } else if (hw < cfg.minHeadroom) {
      reasons.push(`Break-even headroom ${(hw * 100).toFixed(1)}% < ${cfg.minHeadroom * 100}% threshold (Illustrative — verify).`);
      status = status === "fail" ? "fail" : "warn";
    }
    tests.push({ id: "refinance", status, reasons });
  }

  // ── Test 4: Cash flow ────────────────────────────────────────────────────────
  {
    const reasons = [];
    let status = "pass";
    const cf = netMonthly({ rent: deal.rent, mortgage: deal.mortgage, mgmtPct: deal.mgmtPct, maintPct: deal.maintPct, voidsPct: deal.voidsPct });
    if (cf.net < cfg.minNetMonthly) {
      reasons.push(`Net monthly £${cf.net.toFixed(0)} < £${cfg.minNetMonthly} threshold (Illustrative — verify).`);
      status = cf.net < 0 ? "fail" : "warn";
    }
    const icr = icrPass(deal.rent * 12, deal.loan, cfg.icrStressRate, cfg.icrThreshold);
    if (icr.pass === false) {
      reasons.push(`ICR ${icr.icr?.toFixed(2) ?? "—"} fails at ${cfg.icrThreshold}× threshold / ${cfg.icrStressRate * 100}% stress rate (Illustrative).`);
      status = "fail";
    }
    tests.push({ id: "cashflow", status, reasons });
  }

  // ── Test 5: Resilience ───────────────────────────────────────────────────────
  {
    const reasons = [];
    let status = "pass";
    const stressedValue = round2(deal.endValue * (1 - cfg.valDropForResilience));
    const stressedCost  = round2(deal.totalCost * (1 + cfg.refurbRiseForResilience));
    const pos = refiPosition({ value: stressedValue, ltv: deal.ltv, totalCost: stressedCost });
    if (pos < 0) {
      reasons.push(`Under −${cfg.valDropForResilience * 100}% value AND +${cfg.refurbRiseForResilience * 100}% refurb: refinance short by £${Math.abs(pos).toLocaleString()}.`);
      status = "warn";
    }
    // Bridge-covered check under delay scenario
    if (deal.bridge) {
      const extended = bridgeRelease({ ...deal.bridge, termMonths: (deal.bridge.termMonths || 0) + cfg.delayMonthsForResilience });
      const redemption = extended.redemptionAt((deal.bridge.termMonths || 0) + cfg.delayMonthsForResilience);
      const available  = round2(deal.endValue * deal.ltv + (deal.cashReserve || 0));
      if (available < redemption) {
        reasons.push(`After ${cfg.delayMonthsForResilience}-month delay bridge redemption £${redemption.toLocaleString()} exceeds refi proceeds + reserve £${available.toLocaleString()}.`);
        status = "fail";
      }
    }
    tests.push({ id: "resilience", status, reasons });
  }

  const order = ["pass", "warn", "fail"];
  const worstIdx = Math.max(...tests.map((t) => order.indexOf(t.status)));
  const verdict  = order[worstIdx] || "pass";

  return { verdict, tests };
}
