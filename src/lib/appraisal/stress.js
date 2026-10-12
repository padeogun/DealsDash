// Stress-testing — 7 scenarios applied to a standardised deal input.
// All thresholds are from DECISIONS.md (illustrative until confirmed by Paul).
// Each scenario returns: { id, scenario, metric, severity:'ok'|'warn'|'fail' }

import { round2 } from "../utils.js";
import { refiPosition, headroomPct, breakEvenValuation, brrrBudget } from "./brrr.js";
import { netMonthly, icrPass } from "./cashflow.js";
import { bridgeRelease } from "./bridging.js";

// Illustrative defaults — source: DECISIONS.md §P00
const DEFAULTS = {
  ltvStress:       0.70,    // LTV lowered to 70% in scenario 2
  refurbOverruns:  [0.10, 0.20],  // +10% and +20%
  rentDrops:       [0.05, 0.10],  // −5% and −10%
  voidMonths:      2,
  rateRise:        0.02,    // +2 percentage points
  delayMonths:     3,       // +3 months of finance and holding
  minHeadroom:     0.05,    // 5% break-even headroom threshold
  minNetMonthly:   150,     // £150/month minimum net cash flow
};

function sev(value, goodThreshold, warnThreshold) {
  if (value >= goodThreshold) return "ok";
  if (value >= warnThreshold) return "warn";
  return "fail";
}

/**
 * Run all 7 stress scenarios against a deal.
 *
 * @param {{
 *   endValue: number, ltv: number, totalCost: number, acceptedLeftIn?: number, refiFees?: number,
 *   rent: number, mortgage: number, mgmtPct?: number, maintPct?: number, voidsPct?: number,
 *   bridge?: object,       bridgeRelease input (for scenario 7 / bridge-covered check)
 *   cashReserve?: number,  cash reserve available to top up bridge shortfall
 * }} deal
 * @param {object} settings  Override any DEFAULTS key
 */
export function runStress(deal, settings = {}) {
  const cfg = { ...DEFAULTS, ...settings };
  const results = [];

  // ── Scenario 1: Valuation −5%, −10%, −15% ───────────────────────────────────
  for (const drop of [0.05, 0.10, 0.15]) {
    const stressedValue = round2(deal.endValue * (1 - drop));
    const pos = refiPosition({ value: stressedValue, ltv: deal.ltv, totalCost: deal.totalCost });
    const bev = breakEvenValuation({ totalCost: deal.totalCost, ltv: deal.ltv, refiFees: deal.refiFees || 0, acceptedLeftIn: deal.acceptedLeftIn || 0 });
    const hw  = headroomPct(stressedValue, bev);
    results.push({ id: `val_minus${drop * 100}`, scenario: `Valuation −${drop * 100}%`, metric: pos, headroom: hw, severity: sev(hw, cfg.minHeadroom, 0) });
  }

  // ── Scenario 2: LTV lowered ──────────────────────────────────────────────────
  {
    const bev = breakEvenValuation({ totalCost: deal.totalCost, ltv: cfg.ltvStress, refiFees: deal.refiFees || 0, acceptedLeftIn: deal.acceptedLeftIn || 0 });
    const hw  = headroomPct(deal.endValue, bev);
    const pos = refiPosition({ value: deal.endValue, ltv: cfg.ltvStress, totalCost: deal.totalCost });
    results.push({ id: "ltv_low", scenario: `LTV lowered to ${cfg.ltvStress * 100}%`, metric: pos, headroom: hw, severity: sev(hw, cfg.minHeadroom, 0) });
  }

  // ── Scenario 3: Refurb +10%, +20% ───────────────────────────────────────────
  for (const rise of cfg.refurbOverruns) {
    const extraCost = round2(deal.totalCost * rise); // simplification: apply to totalCost
    const stressedCost = round2(deal.totalCost + extraCost);
    const bev = breakEvenValuation({ totalCost: stressedCost, ltv: deal.ltv, refiFees: deal.refiFees || 0, acceptedLeftIn: deal.acceptedLeftIn || 0 });
    const hw  = headroomPct(deal.endValue, bev);
    const pos = refiPosition({ value: deal.endValue, ltv: deal.ltv, totalCost: stressedCost });
    results.push({ id: `refurb_plus${rise * 100}`, scenario: `Refurb +${rise * 100}%`, metric: pos, headroom: hw, severity: sev(hw, cfg.minHeadroom, 0) });
  }

  // ── Scenario 4: Rent −5%, −10% ──────────────────────────────────────────────
  for (const drop of cfg.rentDrops) {
    const stressedRent = round2(deal.rent * (1 - drop));
    const cf = netMonthly({ rent: stressedRent, mortgage: deal.mortgage, mgmtPct: deal.mgmtPct, maintPct: deal.maintPct, voidsPct: deal.voidsPct });
    results.push({ id: `rent_minus${drop * 100}`, scenario: `Rent −${drop * 100}%`, metric: cf.net, severity: sev(cf.net, cfg.minNetMonthly, 0) });
  }

  // ── Scenario 5: Void — N months no rent ──────────────────────────────────────
  {
    const voidLoss = round2(deal.rent * cfg.voidMonths);
    const normalCf = netMonthly({ rent: deal.rent, mortgage: deal.mortgage, mgmtPct: deal.mgmtPct, maintPct: deal.maintPct, voidsPct: deal.voidsPct });
    const netAfterVoid = round2(normalCf.net - voidLoss / 12); // annualised impact
    results.push({ id: "void", scenario: `${cfg.voidMonths}-month void`, metric: netAfterVoid, severity: sev(netAfterVoid, cfg.minNetMonthly, 0) });
  }

  // ── Scenario 6: Rate +2pp at refinance ───────────────────────────────────────
  if (deal.mortgage && deal.refiRate != null) {
    const stressedRate = Number(deal.refiRate) + cfg.rateRise;
    const stressedLoan = round2(deal.endValue * deal.ltv);
    const stressedMortgage = round2(stressedLoan * stressedRate / 12);
    const cf = netMonthly({ rent: deal.rent, mortgage: stressedMortgage, mgmtPct: deal.mgmtPct, maintPct: deal.maintPct, voidsPct: deal.voidsPct });
    results.push({ id: "rate_plus200bp", scenario: `Refi rate +${cfg.rateRise * 100}pp`, metric: cf.net, severity: sev(cf.net, cfg.minNetMonthly, 0) });
  }

  // ── Scenario 7: Delayed exit +3 months ───────────────────────────────────────
  if (deal.bridge) {
    const extraMonths = cfg.delayMonths;
    const extended = bridgeRelease({ ...deal.bridge, termMonths: (deal.bridge.termMonths || 0) + extraMonths });
    const bridgeCovered = (extended.dayOneRelease + (deal.cashReserve || 0)) >= extended.redemptionAt((deal.bridge.termMonths || 0) + extraMonths);
    results.push({ id: "delay_3mo", scenario: `Exit delayed +${extraMonths} months`, metric: extended.dayOneRelease, bridgeCovered, severity: bridgeCovered ? "warn" : "fail" });
  }

  return results;
}
