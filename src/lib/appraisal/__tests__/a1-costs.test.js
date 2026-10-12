// Phase A1 golden tests — lump/detail cost helpers.
// Covers: legalTotal, refurbTotal, holdingMonthlyRate, holdingCostLine,
//         totalProjectMonths, bridgeLump.

import { describe, it, expect } from "vitest";
import {
  legalTotal,
  refurbTotal,
  holdingMonthlyRate,
  holdingCostLine,
  totalProjectMonths,
} from "../costs.js";
import { bridgeLump } from "../bridging.js";

// ── legalTotal ────────────────────────────────────────────────────────────────

describe("legalTotal — lump mode", () => {
  it("returns lumpTotal when mode is lump", () => {
    expect(legalTotal({ mode: "lump", lumpTotal: 5000 })).toBe(5000);
  });

  it("returns null when lumpTotal is null", () => {
    expect(legalTotal({ mode: "lump", lumpTotal: null })).toBeNull();
  });

  it("defaults to lump behaviour when mode is absent", () => {
    expect(legalTotal({ lumpTotal: 3500 })).toBe(3500);
    expect(legalTotal({ lumpTotal: null })).toBeNull();
  });

  it("returns null for a null config", () => {
    expect(legalTotal(null)).toBeNull();
  });
});

describe("legalTotal — detail mode", () => {
  const full = {
    mode: "detail",
    solicitor: 1500, searches: 300, survey: 500,
    broker: 200,    valuation: 250, landReg: 300, other: 100,
  };

  it("sums all seven fields", () => {
    expect(legalTotal(full)).toBe(3150);
  });

  it("propagates null when any field is null (RULE 7)", () => {
    expect(legalTotal({ ...full, survey: null })).toBeNull();
  });

  it("propagates null when any field is undefined (RULE 7)", () => {
    const { broker: _b, ...noField } = full;
    expect(legalTotal({ ...noField, mode: "detail" })).toBeNull();
  });
});

// ── refurbTotal ───────────────────────────────────────────────────────────────

describe("refurbTotal — lump mode", () => {
  it("applies contingency to lumpTotal", () => {
    expect(refurbTotal({ mode: "lump", lumpTotal: 20000, contingencyPct: 0.15 })).toBe(23000);
  });

  it("returns lumpTotal unchanged when no contingency", () => {
    expect(refurbTotal({ mode: "lump", lumpTotal: 10000 })).toBe(10000);
  });

  it("returns null when lumpTotal is null", () => {
    expect(refurbTotal({ mode: "lump", lumpTotal: null })).toBeNull();
  });

  it("returns null for a null config", () => {
    expect(refurbTotal(null)).toBeNull();
  });
});

describe("refurbTotal — detail mode, point values", () => {
  it("sums items and applies contingency", () => {
    const refurb = {
      mode: "detail",
      items: [{ amount: 5000 }, { amount: 3000 }],
      contingencyPct: 0.10,
      scenario: "high",
    };
    expect(refurbTotal(refurb)).toBe(8800);
  });

  it("returns null when any item amount is null (RULE 7)", () => {
    const refurb = {
      mode: "detail",
      items: [{ amount: 5000 }, { amount: null }],
      contingencyPct: 0.10,
      scenario: "high",
    };
    expect(refurbTotal(refurb)).toBeNull();
  });

  it("returns null for empty items array", () => {
    expect(refurbTotal({ mode: "detail", items: [], scenario: "high", contingencyPct: 0 })).toBeNull();
  });
});

describe("refurbTotal — detail mode, range items", () => {
  const base = {
    mode: "detail",
    contingencyPct: 0.15,
  };

  it("uses high value at scenario high (RULE 9 default)", () => {
    const refurb = { ...base, items: [{ low: 4000, high: 6000 }], scenario: "high" };
    expect(refurbTotal(refurb)).toBe(6900); // 6000 × 1.15
  });

  it("uses midpoint at scenario mid", () => {
    const refurb = { ...base, items: [{ low: 4000, high: 6000 }], scenario: "mid" };
    expect(refurbTotal(refurb)).toBe(5750); // 5000 × 1.15
  });

  it("uses low value at scenario low", () => {
    const refurb = { ...base, items: [{ low: 4000, high: 6000 }], scenario: "low" };
    expect(refurbTotal(refurb)).toBe(4600); // 4000 × 1.15
  });

  it("defaults to high when scenario is absent", () => {
    const refurb = { ...base, items: [{ low: 4000, high: 6000 }] };
    expect(refurbTotal(refurb)).toBe(6900);
  });

  it("falls back to amount field when no low/high", () => {
    const refurb = { ...base, items: [{ amount: 5000 }], scenario: "high" };
    expect(refurbTotal(refurb)).toBe(5750); // 5000 × 1.15
  });

  it("returns null when item has neither range nor amount", () => {
    const refurb = { ...base, items: [{ label: "Electrics" }], scenario: "high" };
    expect(refurbTotal(refurb)).toBeNull();
  });
});

// ── holdingMonthlyRate ────────────────────────────────────────────────────────

describe("holdingMonthlyRate — lump mode", () => {
  it("returns lumpMonthly", () => {
    expect(holdingMonthlyRate({ mode: "lump", lumpMonthly: 800 })).toBe(800);
  });

  it("returns null when lumpMonthly is null", () => {
    expect(holdingMonthlyRate({ mode: "lump", lumpMonthly: null })).toBeNull();
  });

  it("defaults to lump behaviour when mode is absent", () => {
    expect(holdingMonthlyRate({ lumpMonthly: 600 })).toBe(600);
  });

  it("returns null for a null config", () => {
    expect(holdingMonthlyRate(null)).toBeNull();
  });
});

describe("holdingMonthlyRate — detail mode", () => {
  const full = { mode: "detail", ctax: 200, insurance: 50, utilities: 150, other: 0 };

  it("sums the four detail fields", () => {
    expect(holdingMonthlyRate(full)).toBe(400);
  });

  it("propagates null when any field is null (RULE 7)", () => {
    expect(holdingMonthlyRate({ ...full, utilities: null })).toBeNull();
  });
});

// ── holdingCostLine ───────────────────────────────────────────────────────────

describe("holdingCostLine", () => {
  it("multiplies monthly rate by total months", () => {
    const line = holdingCostLine({ mode: "lump", lumpMonthly: 800 }, 6);
    expect(line.amount).toBe(4800);
    expect(line.key).toBe("holding");
    expect(line.source).toContain("6 mo");
    expect(line.source).toContain("£800");
  });

  it("returns null amount when monthly rate is null", () => {
    const line = holdingCostLine({ mode: "lump", lumpMonthly: null }, 6);
    expect(line.amount).toBeNull();
  });

  it("returns null amount when totalMonths is 0", () => {
    const line = holdingCostLine({ mode: "lump", lumpMonthly: 800 }, 0);
    expect(line.amount).toBeNull();
  });

  it("returns null amount for a null holding config", () => {
    const line = holdingCostLine(null, 6);
    expect(line.amount).toBeNull();
  });
});

// ── totalProjectMonths ────────────────────────────────────────────────────────

describe("totalProjectMonths", () => {
  it("converts weeks to months (4.33 weeks/month)", () => {
    // 16 weeks → 3.70 → rounds to 4
    expect(totalProjectMonths([{ weeks: 4 }, { weeks: 8 }, { weeks: 4 }])).toBe(4);
  });

  it("rounds 12 months correctly", () => {
    // 52 weeks → 12.01 → 12
    expect(totalProjectMonths([{ weeks: 52 }])).toBe(12);
  });

  it("returns 0 for an empty phases array", () => {
    expect(totalProjectMonths([])).toBe(0);
  });

  it("returns 0 for null phases", () => {
    expect(totalProjectMonths(null)).toBe(0);
  });
});

// ── bridgeLump ────────────────────────────────────────────────────────────────

describe("bridgeLump", () => {
  it("sets financeCost and totalCostAt to the supplied amount", () => {
    const result = bridgeLump(15000);
    expect(result.financeCost).toBe(15000);
    expect(result.totalCostAt(1)).toBe(15000);
    expect(result.totalCostAt(12)).toBe(15000); // same at any month
  });

  it("sets dayOneRelease to null (cannot compute without LTV)", () => {
    expect(bridgeLump(15000).dayOneRelease).toBeNull();
  });

  it("sets redemptionAt to return null", () => {
    expect(bridgeLump(15000).redemptionAt(6)).toBeNull();
  });

  it("sets extensionCostPerMonth to null", () => {
    expect(bridgeLump(15000).extensionCostPerMonth).toBeNull();
  });

  it("sets monthlyServicing to 0", () => {
    expect(bridgeLump(15000).monthlyServicing).toBe(0);
  });

  it("treats null input as zero cost", () => {
    const result = bridgeLump(null);
    expect(result.financeCost).toBe(0);
    expect(result.totalCostAt(6)).toBe(0);
  });
});
