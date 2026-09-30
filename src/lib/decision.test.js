import { describe, it, expect } from "vitest";
import {
  evaluateDecision,
  resolveRules,
  legalPackRedFlags,
  buildRiskRegister,
  buildOpenQuestions,
  DEFAULT_DECISION_RULES,
} from "./decision.js";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeAppraisal(overrides = {}) {
  return {
    gdv: 100000,
    netProfit: 25000,
    totalCost: 100000, // profitOnCost = 25%
    cashLeftIn: 5000,
    funding: { fundsRequired: 80000, refurb: { total: 15000 } },
    timeline: { months: 6 },
    ...overrides,
  };
}

function makeIcr(pass = true, icrVal = 1.35) {
  return {
    icr: { value: icrVal },
    pass,
    threshold: 1.25,
    maxLoanAtThreshold: { value: 90000 },
    limitsRefi: !pass,
  };
}

function makeDeal(overrides = {}) {
  return {
    id: "deal-1",
    price: 75000,
    postcode: "OL16 1AB",
    propertyType: "Terrace",
    fundingMode: "bridge",
    legalPackDocuments: [],
    refurbItems: [],
    comps: [],
    ...overrides,
  };
}

const defaultRules = DEFAULT_DECISION_RULES;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("evaluateDecision", () => {
  it("returns BUY when all thresholds are met", () => {
    const result = evaluateDecision({
      appraisal: makeAppraisal({ netProfit: 30000, totalCost: 100000 }),
      icrResult: makeIcr(true),
      fundingBrrr: null,
      triage: null,
      buyBoxGate: null,
      rules: defaultRules,
      deal: makeDeal(),
    });
    expect(result.verdict).toBe("BUY");
    expect(result.reasons).toHaveLength(0);
  });

  it("returns PASS when profit on cost is below minimum", () => {
    // netProfit 5000 on totalCost 100000 = 5% < 15% minimum
    const result = evaluateDecision({
      appraisal: makeAppraisal({ netProfit: 5000, totalCost: 100000 }),
      icrResult: null,
      fundingBrrr: null,
      triage: null,
      buyBoxGate: null,
      rules: defaultRules,
      deal: makeDeal(),
    });
    expect(result.verdict).toBe("PASS");
    expect(result.reasons[0]).toMatch(/Profit on cost.*minimum/i);
  });

  it("returns PASS when legal pack has a red flag", () => {
    const deal = makeDeal({
      legalPackDocuments: [{
        filename: "pack.pdf",
        review: {
          flags: [{ urgency: "Raise with solicitor before bidding", category: "Short lease", summary: "68 years remaining", pageHint: "p.3" }],
        },
      }],
    });
    const result = evaluateDecision({
      appraisal: makeAppraisal({ netProfit: 30000, totalCost: 100000 }),
      icrResult: null,
      fundingBrrr: null,
      triage: null,
      buyBoxGate: null,
      rules: defaultRules,
      deal,
    });
    expect(result.verdict).toBe("PASS");
    expect(result.reasons[0]).toMatch(/Legal pack.*Short lease/i);
  });

  it("returns PASS when ICR fails on bridge/refi strategy", () => {
    const result = evaluateDecision({
      appraisal: makeAppraisal({ netProfit: 30000, totalCost: 100000 }),
      icrResult: makeIcr(false, 0.95),
      fundingBrrr: null,
      triage: null,
      buyBoxGate: null,
      rules: defaultRules,
      deal: makeDeal({ fundingMode: "bridge" }),
    });
    expect(result.verdict).toBe("PASS");
    expect(result.reasons[0]).toMatch(/ICR.*below/i);
  });

  it("returns PASS when outside buy box on area filter", () => {
    const result = evaluateDecision({
      appraisal: makeAppraisal({ netProfit: 30000, totalCost: 100000 }),
      icrResult: makeIcr(true),
      fundingBrrr: null,
      triage: null,
      buyBoxGate: { areaKnown: false, assetTypeFits: null, tenureFits: null },
      rules: defaultRules,
      deal: makeDeal({ postcode: "SW1A 1AA" }),
    });
    expect(result.verdict).toBe("PASS");
    expect(result.reasons[0]).toMatch(/Outside buy box area/i);
  });

  it("returns WATCH when net profit below minimum but no hard fails", () => {
    // profitOnCost 20% passes; netProfit 10000 < 25000 minimum → WATCH not PASS
    const result = evaluateDecision({
      appraisal: makeAppraisal({ netProfit: 10000, totalCost: 50000 }),
      icrResult: makeIcr(true),
      fundingBrrr: null,
      triage: null,
      buyBoxGate: null,
      rules: defaultRules,
      deal: makeDeal(),
    });
    expect(result.verdict).toBe("WATCH");
    expect(result.reasons[0]).toMatch(/Net profit.*below/i);
  });

  it("ICR fail does not trigger PASS for cash purchase (no refi needed)", () => {
    const result = evaluateDecision({
      appraisal: makeAppraisal({ netProfit: 30000, totalCost: 100000 }),
      icrResult: makeIcr(false, 0.8),
      fundingBrrr: null,
      triage: null,
      buyBoxGate: null,
      rules: defaultRules,
      deal: makeDeal({ fundingMode: "cash" }),
    });
    // ICR fail only triggers PASS when bridge/refi strategy; cash purchase skips it
    expect(result.verdict).toBe("BUY");
  });
});

describe("resolveRules", () => {
  it("reads thresholds from buy box assumptions", () => {
    const buyBox = {
      assumptions: {
        targetProfitOnCostPct: { value: 0.20 },
        targetProfitMinGBP:    { value: 30000 },
        maxMoneyLeftInGBP:     { value: 5000 },
        icrThresholdPct:       { value: 1.30 },
      },
    };
    const rules = resolveRules(buyBox);
    expect(rules.minProfitOnCostPct).toBe(0.20);
    expect(rules.minNetProfitGBP).toBe(30000);
    expect(rules.maxMoneyLeftInGBP).toBe(5000);
    expect(rules.icrThreshold).toBe(1.30);
  });

  it("falls back to defaults when buy box is null", () => {
    const rules = resolveRules(null);
    expect(rules.minProfitOnCostPct).toBe(DEFAULT_DECISION_RULES.minProfitOnCostPct);
    expect(rules.minNetProfitGBP).toBe(DEFAULT_DECISION_RULES.minNetProfitGBP);
  });
});

describe("legalPackRedFlags", () => {
  it("returns only 'Raise with solicitor' urgency flags", () => {
    const docs = [{
      filename: "pack.pdf",
      review: {
        flags: [
          { urgency: "Raise with solicitor before bidding", category: "Restrictive covenant" },
          { urgency: "Worth asking about", category: "Flying freehold" },
          { urgency: "Informational", category: "Standard clause" },
        ],
      },
    }];
    const flags = legalPackRedFlags(docs);
    expect(flags).toHaveLength(1);
    expect(flags[0].category).toBe("Restrictive covenant");
  });

  it("returns empty array for docs with no flags", () => {
    expect(legalPackRedFlags([])).toHaveLength(0);
    expect(legalPackRedFlags([{ filename: "a.pdf", review: { flags: [] } }])).toHaveLength(0);
    expect(legalPackRedFlags(null)).toHaveLength(0);
  });
});

describe("buildRiskRegister", () => {
  it("includes red flag items from legal pack", () => {
    const deal = makeDeal({
      legalPackDocuments: [{
        filename: "pack.pdf",
        review: {
          flags: [{ urgency: "Raise with solicitor before bidding", category: "Subsidence", summary: "Evidence of cracks", pageHint: "p.7" }],
        },
      }],
    });
    const items = buildRiskRegister(deal);
    expect(items.some(i => i.risk === "Subsidence")).toBe(true);
    expect(items.find(i => i.risk === "Subsidence").rating).toBe("High");
  });

  it("adds Med risk when refurb is not estimated", () => {
    const deal = makeDeal({ refurbItems: [] });
    const items = buildRiskRegister(deal);
    expect(items.some(i => i.risk === "Refurb cost not estimated")).toBe(true);
  });
});

describe("buildOpenQuestions", () => {
  it("flags missing comps as illustrative", () => {
    const questions = buildOpenQuestions(makeDeal({ comps: [] }), makeAppraisal(), null);
    expect(questions.some(q => q.isIllustrative && /comparable/i.test(q.question))).toBe(true);
  });

  it("flags ICR refi cap when limitsRefi is true", () => {
    const questions = buildOpenQuestions(makeDeal(), makeAppraisal(), makeIcr(false, 0.9));
    expect(questions.some(q => /ICR caps/i.test(q.question))).toBe(true);
  });
});
