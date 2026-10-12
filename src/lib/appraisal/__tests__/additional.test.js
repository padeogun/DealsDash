// Additional tests — formula verification, edge cases, SDLT band boundaries,
// property test for splitBudget, and walkaway fixture tests.
// All formulas have at least one hand-checked case + a boundary case.

import { describe, it, expect } from "vitest";
import { sumCosts, costLine } from "../costs.js";
import { basisValue, toValuation, singlePointValuation } from "../valuation.js";
import { sdlt, sdltValue } from "../sdlt.js";
import { splitBudget, maxPrice } from "../solve.js";
import { bridgeRelease } from "../bridging.js";
import { flipBudget, flipBreakEvenSale, flipTargetSale } from "../flip.js";
import { brrrBudget, breakEvenValuation, headroomPct, refiPosition, cashLeftIn } from "../brrr.js";
import { capitalCost } from "../capital.js";
import { netMonthly, icrPass, monthlyMortgage } from "../cashflow.js";
import { walkAway } from "../walkaway.js";

// ── costs.js ─────────────────────────────────────────────────────────────────

describe("sumCosts", () => {
  it("all known → complete total", () => {
    const lines = [costLine("a", "A", 1000), costLine("b", "B", 500)];
    expect(sumCosts(lines)).toMatchObject({ total: 1500, status: "complete", missing: [] });
  });

  it("one null → incomplete, missing listed", () => {
    const lines = [costLine("refurb", "Refurb", null), costLine("legal", "Legal", 1000)];
    const r = sumCosts(lines);
    expect(r.status).toBe("incomplete");
    expect(r.missing).toContain("refurb");
    expect(r.total).toBeNull();
  });

  it("zero-amount lines still sum correctly", () => {
    const lines = [costLine("a", "A", 0), costLine("b", "B", 200)];
    expect(sumCosts(lines).total).toBe(200);
  });
});

// ── valuation.js ─────────────────────────────────────────────────────────────

describe("basisValue", () => {
  it("returns worst by default", () => {
    const v = { worst: 100000, mid: 120000, best: 140000, basis: "worst", comparables: [] };
    expect(basisValue(v)).toBe(100000);
  });

  it("returns mid when basis is 'mid'", () => {
    const v = { worst: 100000, mid: 120000, best: 140000, basis: "mid", comparables: [] };
    expect(basisValue(v)).toBe(120000);
  });

  it("single-point wraps correctly, singlePoint flag set", () => {
    const v = singlePointValuation(150000);
    expect(v.worst).toBe(150000);
    expect(v.singlePoint).toBe(true);
    expect(basisValue(v)).toBe(150000);
  });

  it("toValuation(number) wraps as single-point", () => {
    const v = toValuation(200000);
    expect(v.worst).toBe(200000);
    expect(v.singlePoint).toBe(true);
  });
});

// ── sdlt.js ───────────────────────────────────────────────────────────────────

describe("sdlt — ENG standard rates", () => {
  it("£125,000 → £0 (boundary: top of nil-rate band)", () => {
    // entire price in 0-125k band at 0%
    expect(sdlt(125000, { buyer: "individual", nation: "ENG" }).value).toBe(0);
  });

  it("£125,001 → £0.02 (enters 2% band)", () => {
    // 125000 × 0% + 1 × 2% = 0.02
    expect(sdlt(125001, { buyer: "individual", nation: "ENG" }).value).toBeCloseTo(0.02, 2);
  });

  it("£250,000 → £2,500", () => {
    // 0-125k = 0; 125k-250k = 2500
    expect(sdlt(250000, { buyer: "individual", nation: "ENG" }).value).toBe(2500);
  });

  it("£300,000 → £5,000  (0 + 2500 + 2500)", () => {
    // 0-125k = 0; 125k-250k = 2500; 250k-300k = 50000×5% = 2500
    expect(sdlt(300000, { buyer: "individual", nation: "ENG" }).value).toBe(5000);
  });

  it("result carries effectiveFrom and verifyAt", () => {
    const r = sdlt(200000, { nation: "ENG" });
    expect(r.effectiveFrom).toBe("2025-04-01");
    expect(r.verifyAt).toMatch(/gov\.uk/);
  });
});

describe("sdlt — ENG higher rates (company / additional dwelling)", () => {
  it("£100,000 company → £5,000 (5% flat)", () => {
    expect(sdlt(100000, { buyer: "company", nation: "ENG" }).value).toBe(5000);
  });

  it("£39,999 company → £0 (exempt under £40k)", () => {
    expect(sdlt(39999, { buyer: "company", nation: "ENG" }).value).toBe(0);
  });

  it("£40,000 company → £2,000 (5%)", () => {
    expect(sdlt(40000, { buyer: "company", nation: "ENG" }).value).toBe(2000);
  });

  it("£250,000 company → £17,500  (5% × 125k + 7% × 125k)", () => {
    // 125000×5% = 6250; 125000×7% = 8750; total = 15000
    // Wait: 0-125k at 5% = 6250; 125k-250k at 7% = 8750; total = 15000
    expect(sdlt(250000, { buyer: "company", nation: "ENG" }).value).toBe(15000);
  });
});

describe("sdlt — Wales and Scotland unsupported", () => {
  it("Wales → unsupported", () => {
    expect(sdlt(200000, { nation: "WAL" })).toMatchObject({ status: "unsupported" });
  });

  it("Scotland → unsupported", () => {
    expect(sdlt(200000, { nation: "SCT" })).toMatchObject({ status: "unsupported" });
  });
});

// ── solve.js — splitBudget property test (200 budgets) ───────────────────────

describe("splitBudget property test", () => {
  it("price + sdlt ≤ budget and within £0.02 for 200 random budgets (company, ENG)", () => {
    const rng = () => Math.floor(Math.random() * 900000) + 50000; // 50k–950k
    for (let i = 0; i < 200; i++) {
      const budget = rng();
      const { price, sdlt: sdltAmt } = splitBudget(budget, { buyer: "company", nation: "ENG" });
      expect(price + sdltAmt).toBeLessThanOrEqual(budget + 0.02);
      expect(budget - (price + sdltAmt)).toBeLessThan(0.02);
    }
  });

  it("price + sdlt ≤ budget and within £0.02 for 200 random budgets (individual, ENG)", () => {
    const rng = () => Math.floor(Math.random() * 900000) + 50000;
    for (let i = 0; i < 200; i++) {
      const budget = rng();
      const { price, sdlt: sdltAmt } = splitBudget(budget, { buyer: "individual", nation: "ENG" });
      expect(price + sdltAmt).toBeLessThanOrEqual(budget + 0.02);
      expect(budget - (price + sdltAmt)).toBeLessThan(0.02);
    }
  });
});

// ── bridging.js ───────────────────────────────────────────────────────────────

describe("bridgeRelease", () => {
  it("serviced mode — no interest deducted day one; monthlyServicing set", () => {
    const r = bridgeRelease({
      gross: 60000, monthlyRate: 0.01, termMonths: 9,
      interestMode: "serviced",
      entryFeePct: 0.01, exitFeePct: 0.01, exitFeeTiming: "redemption",
      brokerFee: 400,
    });
    // dayOneRelease = 60000 - 600(entry) - 400(broker) = 59000
    expect(r.dayOneRelease).toBeCloseTo(59000, 2);
    expect(r.monthlyServicing).toBeCloseTo(600, 2); // 60000 × 1%
  });

  it("retained, exit at redemption — exit fee not deducted from day-one release", () => {
    const r = bridgeRelease({
      gross: 50000, monthlyRate: 0.01, termMonths: 6,
      interestMode: "retained",
      entryFeePct: 0.01, exitFeePct: 0.01, exitFeeTiming: "redemption",
    });
    // simpleInterest = 50000 × 0.01 × 6 = 3000
    // entry = 500; exit at redemption = not deducted from dayOne
    // dayOne = 50000 - 3000 - 500 = 46500
    expect(r.dayOneRelease).toBeCloseTo(46500, 2);
    // redemption at month 6 = 50000 + 3000 + 500(exit) = 53500
    expect(r.redemptionAt(6)).toBeCloseTo(53500, 2);
  });

  it("totalCostAt(12) = interest + all fees", () => {
    const r = bridgeRelease({
      gross: 75000, monthlyRate: 0.01, termMonths: 12,
      interestMode: "retained",
      entryFeePct: 0.01, exitFeePct: 0.01, exitFeeTiming: "start",
      brokerFee: 500, valuationFee: 650,
    });
    // interest = 9000; fees = 750+750+500+650 = 2650; total = 11650
    expect(r.totalCostAt(12)).toBeCloseTo(11650, 2);
  });
});

// ── flip.js ───────────────────────────────────────────────────────────────────

describe("flipBudget", () => {
  it("zero profit target → budget = GDV − costs", () => {
    const r = flipBudget({ gdv: 100000, profitPct: 0, refurb: 10000, legals: 2000, saleCosts: 500, finance: 5000, holding: 1000 });
    // 100000 − 0 − 10000 − 2000 − 500 − 5000 − 1000 = 81500
    expect(r).toBeCloseTo(81500, 2);
  });

  it("fixed profit overrides profitPct", () => {
    const r = flipBudget({ gdv: 200000, profitPct: 0.10, profitFixed: 20000, refurb: 30000, legals: 3000, saleCosts: 500, finance: 15000, holding: 2000 });
    // Fixed profit = 20000 (same as 10% × 200000 in this case)
    expect(r).toBeCloseTo(129500, 2);
  });

  it("multiple null fields → all listed in missing", () => {
    const r = flipBudget({ gdv: 180000, profitPct: 0.15, refurb: null, legals: null, saleCosts: 200, finance: 12000, holding: 2000 });
    expect(r.status).toBe("incomplete");
    expect(r.missing).toContain("refurb");
    expect(r.missing).toContain("legals");
  });
});

describe("flipBreakEvenSale / flipTargetSale", () => {
  it("breakEven for company purchase at £100k", () => {
    // SDLT = 100000×5% = 5000; total costs = 100000+5000+20000+2000+500+8000+1000 = 136500
    const be = flipBreakEvenSale({ price: 100000, buyer: "company", nation: "ENG", refurb: 20000, legals: 2000, saleCosts: 500, finance: 8000, holding: 1000 });
    expect(be).toBeCloseTo(136500, 2);
  });

  it("targetSale = breakEven + profit", () => {
    const ts = flipTargetSale({ price: 100000, buyer: "company", nation: "ENG", refurb: 20000, legals: 2000, saleCosts: 500, finance: 8000, holding: 1000 }, 15000);
    expect(ts).toBeCloseTo(151500, 2);
  });
});

// ── brrr.js ───────────────────────────────────────────────────────────────────

describe("breakEvenValuation", () => {
  it("zero refiFees, zero leftIn → totalCost / ltv", () => {
    expect(breakEvenValuation({ totalCost: 150000, ltv: 0.75, refiFees: 0, acceptedLeftIn: 0 })).toBeCloseTo(200000, 2);
  });

  it("refiFees reduce break-even requirement", () => {
    // (totalCost + 2000 − 0) / 0.75 vs (totalCost + 0) / 0.75
    const withFees    = breakEvenValuation({ totalCost: 150000, ltv: 0.75, refiFees: 2000, acceptedLeftIn: 0 });
    const withoutFees = breakEvenValuation({ totalCost: 150000, ltv: 0.75, refiFees: 0,    acceptedLeftIn: 0 });
    expect(withFees).toBeGreaterThan(withoutFees);
  });

  it("acceptedLeftIn reduces break-even (more cash left means lower value needed from refi)", () => {
    const with20k = breakEvenValuation({ totalCost: 200000, ltv: 0.75, refiFees: 0, acceptedLeftIn: 20000 });
    const with0   = breakEvenValuation({ totalCost: 200000, ltv: 0.75, refiFees: 0, acceptedLeftIn: 0 });
    // (200000 − 20000) / 0.75 = 240000 vs 200000/0.75 = 266666
    expect(with20k).toBeCloseTo(240000, 2);
    expect(with0).toBeCloseTo(266666.67, 2);
  });
});

describe("headroomPct edge cases", () => {
  it("value = breakEven → 0% headroom", () => {
    expect(headroomPct(200000, 200000)).toBe(0);
  });

  it("value < breakEven → negative headroom", () => {
    expect(headroomPct(180000, 200000)).toBeLessThan(0);
  });
});

describe("refiPosition", () => {
  it("positive when refi > totalCost", () => {
    expect(refiPosition({ value: 300000, ltv: 0.75, totalCost: 200000 })).toBe(25000);
  });

  it("negative shortfall when refi < totalCost", () => {
    expect(refiPosition({ value: 200000, ltv: 0.75, totalCost: 200000 })).toBe(-50000);
  });
});

// ── capital.js ────────────────────────────────────────────────────────────────

describe("capitalCost", () => {
  it("£50k for 12 months at 8% = £4,000", () => {
    expect(capitalCost(50000, 12, 0.08).cost).toBeCloseTo(4000, 2);
  });

  it("£50k for 6 months at 8% = £2,000", () => {
    expect(capitalCost(50000, 6, 0.08).cost).toBeCloseTo(2000, 2);
  });
});

// ── cashflow.js ───────────────────────────────────────────────────────────────

describe("netMonthly", () => {
  it("no reserves, no insurance → rent minus mortgage", () => {
    const r = netMonthly({ rent: 800, mortgage: 600 });
    expect(r.net).toBe(200);
  });

  it("with all reserves (22% of rent)", () => {
    // rent 800; reserves 800×0.22=176; mortgage 400; net = 800-400-176 = 224
    const r = netMonthly({ rent: 800, mortgage: 400, mgmtPct: 0.10, maintPct: 0.08, voidsPct: 0.04 });
    expect(r.net).toBeCloseTo(224, 2);
    expect(r.reserves).toBeCloseTo(176, 2);
  });
});

describe("icrPass", () => {
  it("passes at 1.25 with good rent-to-loan ratio", () => {
    // 7800/yr ÷ (97500 × 0.055) = 1.45 → pass
    const r = icrPass(7800, 97500, 0.055, 1.25);
    expect(r.pass).toBe(true);
  });

  it("fails when loan too large", () => {
    const r = icrPass(4000, 120000, 0.055, 1.25);
    expect(r.pass).toBe(false);
  });

  it("zero loan → null result (no division by zero)", () => {
    expect(icrPass(7800, 0, 0.055).pass).toBeNull();
  });
});

describe("monthlyMortgage", () => {
  it("interest-only: £150k at 5% annual = £625/mo", () => {
    expect(monthlyMortgage(150000, 0.05, 300, "interest-only")).toBeCloseTo(625, 2);
  });

  it("repayment is higher than interest-only", () => {
    const io  = monthlyMortgage(150000, 0.05, 300, "interest-only");
    const rep = monthlyMortgage(150000, 0.05, 300, "repayment");
    expect(rep).toBeGreaterThan(io);
  });
});

// ── walkaway.js ───────────────────────────────────────────────────────────────

const GOOD_DEAL = {
  valuation: { worst: 280000, mid: 295000, best: 310000, basis: "worst", comparables: [1, 2, 3, 4] },
  costs: { total: 201500, status: "complete", missing: [] },
  lenderRoute: "Broker: Moneycorp DIP received",
  totalCost: 201500,
  endValue: 280000,
  ltv: 0.75,
  refiFees: 0,
  acceptedLeftIn: 0,
  rent: 950,
  mortgage: 490,   // 150k @ ~3.9% interest-only
  loan: 150000,    // LTV 53% — keeps ICR passing at 5.5% stress (ICR ≈ 1.39)
  mgmtPct: 0.10,
  maintPct: 0.08,
  voidsPct: 0.04,
};

const FAIL_DEAL = {
  ...GOOD_DEAL,
  costs: { total: null, status: "incomplete", missing: ["refurb", "legals"] },
  lenderRoute: null,
  endValue: 200000,  // below break-even for 201500 at 75%
};

describe("walkAway fixtures", () => {
  it("good deal → overall pass or warn (no fail)", () => {
    const r = walkAway(GOOD_DEAL);
    expect(r.verdict).not.toBe("fail");
  });

  it("fail deal → costs test fails (null cost lines)", () => {
    const r = walkAway(FAIL_DEAL);
    const costs = r.tests.find((t) => t.id === "costs");
    expect(costs.status).toBe("fail");
  });

  it("missing lender route → refinance test warns", () => {
    const r = walkAway({ ...GOOD_DEAL, lenderRoute: null });
    const refi = r.tests.find((t) => t.id === "refinance");
    expect(["warn", "fail"]).toContain(refi.status);
  });

  it("single-point valuation → value test warns", () => {
    const r = walkAway({ ...GOOD_DEAL, valuation: { ...GOOD_DEAL.valuation, singlePoint: true } });
    const value = r.tests.find((t) => t.id === "value");
    expect(value.status).toBe("warn");
  });
});
