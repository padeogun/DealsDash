// P04 integration tests — funding sources, bridging calculator, capital recycling.
// Rule 6: tests written from golden cases before or alongside implementation.

import { describe, it, expect } from "vitest";
import { bridgeRelease } from "../bridging.js";
import { capitalCost, recycling } from "../capital.js";
import { flipBudget } from "../flip.js";
import { splitBudget } from "../solve.js";
import { brrrBudget } from "../brrr.js";

// ── Golden case: bridging calculator (P04 §2) ──────────────────────────────────
// £75k gross, 1%/month retained ×12, 1%/1% arrangement+exit at start, broker £500, valuation £650 → £63,350
describe("bridgeRelease golden case", () => {
  it("matches training golden case: 75k 1% retained 12mo with fees → day-one release 63350", () => {
    const result = bridgeRelease({
      gross:         75000,
      monthlyRate:   0.01,
      termMonths:    12,
      interestMode:  "retained",
      entryFeePct:   0.01,    // arrangement 1%
      exitFeePct:    0.01,    // exit 1%
      exitFeeTiming: "start", // both at start per golden case
      brokerFee:     500,
      valuationFee:  650,
    });
    expect(result.dayOneRelease).toBe(63350);
  });

  it("redemptionAt(12) = gross + 12 months simple interest + exit fee at redemption", () => {
    const result = bridgeRelease({
      gross: 75000, monthlyRate: 0.0085, termMonths: 12,
      interestMode: "retained", entryFeePct: 0.02, exitFeePct: 0.01,
      exitFeeTiming: "redemption",
    });
    // gross + simple interest + exit fee (at redemption)
    const expectedRedemption = 75000 + 75000 * 0.0085 * 12 + 75000 * 0.01;
    expect(result.redemptionAt(12)).toBeCloseTo(expectedRedemption, 0);
  });

  it("totalCostAt includes all fees plus interest", () => {
    const result = bridgeRelease({
      gross: 50000, monthlyRate: 0.01, termMonths: 6,
      interestMode: "retained", entryFeePct: 0.02, exitFeePct: 0.01,
      exitFeeTiming: "redemption", brokerFee: 300,
    });
    const interest   = 50000 * 0.01 * 6; // 3000
    const entryFee   = 50000 * 0.02;     // 1000
    const exitFee    = 50000 * 0.01;     //  500
    const broker     = 300;
    const expected   = interest + entryFee + exitFee + broker; // 4800
    expect(result.totalCostAt(6)).toBeCloseTo(expected, 0);
  });

  it("extensionCostPerMonth defaults to monthlyRate × gross when extensionRate not set", () => {
    const result = bridgeRelease({ gross: 80000, monthlyRate: 0.009, termMonths: 9 });
    expect(result.extensionCostPerMonth).toBeCloseTo(80000 * 0.009, 1);
  });

  it("serviced mode: dayOneRelease = gross - fees (no interest deduction)", () => {
    const result = bridgeRelease({
      gross: 60000, monthlyRate: 0.01, termMonths: 12,
      interestMode: "serviced", entryFeePct: 0.02,
    });
    expect(result.dayOneRelease).toBe(60000 - 60000 * 0.02);
    expect(result.monthlyServicing).toBeCloseTo(60000 * 0.01, 1);
  });
});

// ── Finance cost feeds into max-offer engine ───────────────────────────────────
describe("bridge finance cost changes max offer", () => {
  it("flip: adding bridge finance cost reduces the max-offer budget", () => {
    const valuation = { worst: 150000, mid: 155000, best: 165000, basis: "worst", singlePoint: false };
    const refurb    = 15000;
    const profitPct = 0.15;

    const withoutFinance = flipBudget({ gdv: valuation, profitPct, refurb, legals: 0, saleCosts: 0, finance: 0, holding: 0 });
    const financeEstimate = 5000;
    const withFinance    = flipBudget({ gdv: valuation, profitPct, refurb, legals: 0, saleCosts: 0, finance: financeEstimate, holding: 0 });

    expect(withFinance).toBeLessThan(withoutFinance);
    expect(withoutFinance - withFinance).toBe(financeEstimate);
  });

  it("brrr: adding bridge finance cost reduces the max-offer budget", () => {
    const endValue      = 200000;
    const ltv           = 0.75;
    const refurb        = 20000;
    const financeEstimate = 8000;

    const without = brrrBudget({ endValue, ltv, refiFees: 0, acceptedLeftIn: 0, refurb, legals: 0, finance: 0, holding: 0 });
    const with_   = brrrBudget({ endValue, ltv, refiFees: 0, acceptedLeftIn: 0, refurb, legals: 0, finance: financeEstimate, holding: 0 });

    expect(with_).toBeLessThan(without);
    expect(without - with_).toBe(financeEstimate);
  });

  it("splitBudget is unaffected by finance — finance cost is separate from price+SDLT split", () => {
    // splitBudget splits a total budget into price + SDLT; finance is upstream
    const budget    = 100000;
    const split     = splitBudget(budget, { buyer: "company", nation: "ENG" });
    expect(split.price + split.sdlt).toBeCloseTo(budget, 0);
  });
});

// ── Capital recycling (P04 §3) ────────────────────────────────────────────────
const NOW_ISO = "2026-10-10";
const now     = new Date(NOW_ISO).getTime();

describe("recycling: two sequential deals, second overruns", () => {
  // Pool: £50,000, term 12 months, extension cap 3 months.
  // Deal 1: £45,000, returned after 11 months — fine.
  // Deal 2: £45,000, deployed AFTER deal 1 returns, expected return 14 months → overrun by 2 months.

  const pool = 50000;
  const opts = { termMonths: 12, extensionMonths: 3 };

  const date = (iso) => iso; // ISO strings passed as-is; recycling() converts with new Date()

  it("deal 1 returned — shows in returned, not deployed", () => {
    const deals = [
      { id: "d1", allocated: 45000, deployedAt: "2025-09-10", returnedAt: "2026-08-10" }, // ~11 months
    ];
    const r = recycling(pool, deals, opts);
    expect(r.returned).toBe(45000);
    expect(r.deployed).toBe(0);
    expect(r.idle).toBe(pool);
    expect(r.overrunCount).toBe(0);
  });

  it("deal 2 overruns term + extension cap", () => {
    // Deal deployed 2025-09-10 and still active at "today" (2026-10-10) = 13 months, within cap.
    // Push it to 16+ months = overrun.
    const deals = [
      { id: "d2", allocated: 45000, deployedAt: "2025-05-01", returnedAt: null }, // ~17 months held
    ];
    const r = recycling(pool, deals, opts);
    expect(r.overrunCount).toBeGreaterThan(0);
    expect(r.deployed).toBe(45000);
    expect(r.idle).toBe(pool - 45000);
  });

  it("two sequential deals: d1 returned frees capital for d2", () => {
    const deals = [
      { id: "d1", allocated: 45000, deployedAt: "2025-09-10", returnedAt: "2026-08-10" },
      { id: "d2", allocated: 45000, deployedAt: "2026-08-10", returnedAt: null },
    ];
    const r = recycling(pool, deals, opts);
    // d1 returned, d2 active — deployed = 45k, idle = 5k
    expect(r.deployed).toBe(45000);
    expect(r.returned).toBe(45000);
    expect(r.idle).toBe(pool - 45000);
  });
});

// ── Capital cost (private loan interest) ──────────────────────────────────────
describe("capitalCost", () => {
  it("8% p.a. simple on £50k for 12 months = £4,000", () => {
    const r = capitalCost(50000, 12, 0.08);
    expect(r.cost).toBe(4000);
  });

  it("8% p.a. simple on £45k for 6 months ≈ £1,800", () => {
    const r = capitalCost(45000, 6, 0.08);
    expect(r.cost).toBeCloseTo(1800, 0);
  });

  it("zero months = zero cost", () => {
    expect(capitalCost(50000, 0, 0.08).cost).toBe(0);
  });
});
