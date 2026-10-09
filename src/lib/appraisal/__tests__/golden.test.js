// Golden cases — appraisal v2 engine (P01)
// Source: training day 9 Oct 2026 — Paul's deal walkthrough.
// These tests MUST FAIL before any implementation module is present.
// toBeCloseTo(x, 2) = within 0.005 (rounds correctly to 2 dp).

import { describe, it, expect } from "vitest";
import { flipBudget } from "../flip.js";
import { splitBudget } from "../solve.js";
import { brrrBudget, breakEvenValuation, headroomPct, refiPosition } from "../brrr.js";
import { bridgeRelease } from "../bridging.js";
import { sdlt } from "../sdlt.js";

// Fixture reused for null-propagation test
const FLIP = { gdv: 180000, profitPct: 0.15, refurb: 25000, legals: 3000, saleCosts: 200, finance: 12000, holding: 2000 };

describe("flipBudget — profit-first stack", () => {
  it("GDV £180k, 15% profit target → purchase+SDLT budget £110,800", () => {
    // 180000 − 27000 − 25000 − 3000 − 200 − 12000 − 2000 = 110800
    expect(flipBudget(FLIP)).toBeCloseTo(110800, 2);
  });
});

describe("splitBudget — company, higher rates, ENG", () => {
  it("£110,800 → price £105,523.81, SDLT £5,276.19  (entirely in 0-125k band at 5%)", () => {
    const r = splitBudget(110800, { buyer: "company", nation: "ENG" });
    expect(r.price).toBeCloseTo(105523.81, 2);
    expect(r.sdlt).toBeCloseTo(5276.19, 2);
  });
});

describe("brrrBudget — refi-first stack", () => {
  const BASE = { endValue: 300000, ltv: 0.75, refurb: 20000, legals: 2000, finance: 22500, holding: 500 };

  it("acceptedLeftIn £20k → budget £200,000  (225k + 20k − 45k)", () => {
    expect(brrrBudget({ ...BASE, acceptedLeftIn: 20000 })).toBeCloseTo(200000, 2);
  });

  it("acceptedLeftIn £0 (all money out) → budget £180,000  (225k + 0 − 45k)", () => {
    expect(brrrBudget({ ...BASE, acceptedLeftIn: 0 })).toBeCloseTo(180000, 2);
  });
});

describe("splitBudget — BRRR price split, company, ENG", () => {
  it("£200,000 → price £189,252.34, SDLT £10,747.66  (straddles 5%/7% bands)", () => {
    const r = splitBudget(200000, { buyer: "company", nation: "ENG" });
    expect(r.price).toBeCloseTo(189252.34, 2);
    expect(r.sdlt).toBeCloseTo(10747.66, 2);
  });
});

describe("bridgeRelease — day-one release, retained simple interest", () => {
  it("£75k gross, 1%/mo, 12 months, fees at start → day-one release £63,350", () => {
    // 75000 − (75000×0.01×12 interest) − (750 entry) − (750 exit@start) − 500 broker − 650 val = 63350
    const r = bridgeRelease({
      gross: 75000, monthlyRate: 0.01, termMonths: 12,
      interestMode: "retained",
      entryFeePct: 0.01, exitFeePct: 0.01, exitFeeTiming: "start",
      brokerFee: 500, valuationFee: 650,
    });
    expect(r.dayOneRelease).toBeCloseTo(63350, 2);
  });
});

describe("BRRR analytics — Katie deal", () => {
  it("breakEvenValuation: totalCost £201,500, LTV 75% → £268,666.67", () => {
    // 201500 / 0.75
    expect(breakEvenValuation({ totalCost: 201500, ltv: 0.75, refiFees: 0, acceptedLeftIn: 0 }))
      .toBeCloseTo(268666.67, 2);
  });

  it("headroomPct: value £270k vs break-even £268,666.67 → ≈ 0.49%", () => {
    expect(headroomPct(270000, 268666.67)).toBeCloseTo(0.0049, 2);
  });

  it("refiPosition sensitivity: values 280k–240k → [8500, 1000, −6500, −14000, −21500]", () => {
    const expected = [8500, 1000, -6500, -14000, -21500];
    [280000, 270000, 260000, 250000, 240000].forEach((v, i) => {
      expect(refiPosition({ value: v, ltv: 0.75, totalCost: 201500 })).toBeCloseTo(expected[i], 2);
    });
  });
});

describe("BRRR analytics — Sean deal", () => {
  it("refiPosition: value £85k, LTV 75%, totalCost £51,500 → surplus £12,250", () => {
    expect(refiPosition({ value: 85000, ltv: 0.75, totalCost: 51500 })).toBeCloseTo(12250, 2);
  });
});

describe("Null propagation — RULE 7: null ≠ zero", () => {
  it("flipBudget with legals:null → { status:'incomplete', missing:['legals'] }", () => {
    const r = flipBudget({ ...FLIP, legals: null });
    expect(r).toMatchObject({ status: "incomplete", missing: ["legals"] });
  });
});

describe("Nation guard — RULE 12: Scotland unsupported", () => {
  it("sdlt(150000, { nation:'SCT' }) → { status:'unsupported' }", () => {
    const r = sdlt(150000, { nation: "SCT" });
    expect(r).toMatchObject({ status: "unsupported" });
    expect(r.reason).toBeTruthy();
  });
});

describe("FTB guard — RULE 12: first-time buyer relief never applied", () => {
  it("sdlt with firstTimeBuyer:true → standard rates calculated, warning present", () => {
    const r = sdlt(150000, { buyer: "individual", firstTimeBuyer: true, nation: "ENG" });
    expect(r.value).toBeGreaterThan(0);   // standard rates, not zero
    expect(r.warning).toBeTruthy();       // user warned relief not applied
  });
});
