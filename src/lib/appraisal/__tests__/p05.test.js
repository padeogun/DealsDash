// P05 tests — Auction Assessment v2: flip engine, walk-away, legal pack cost lines.
// Rule 6: tests written from golden cases before or alongside implementation.

import { describe, it, expect } from "vitest";
import { flipBudget, splitBudget } from "../flip.js";
import { splitBudget as splitBudgetSolve } from "../solve.js";
import { mapLegalPackCostLines, auctionFlipWalkAway } from "../auction.js";
import { sumCosts } from "../costs.js";

// ── Daniel flip golden case ───────────────────────────────────────────────────
// 22 Gladstone Street, Rochdale. Auction guide £85k.
// Worst-case value £120k, refurb £18k, legals £7,600 (buyer's premium £3,600 + seller £1,500 + legal/finance £2,500).
// 15% profit target → flipBudget = 120,000 × 0.85 − 18,000 − 7,600 = 76,400.
describe("Daniel flip golden case", () => {
  const valuation = { worst: 120000, mid: 130000, best: 140000, basis: "worst", singlePoint: false };
  const refurb    = 18000;
  const legals    = 7600;  // buyer premium + seller fees + legal/finance
  const profitPct = 0.15;

  it("flipBudget = 76,400 (120k worst × 0.85 − 18k refurb − 7.6k legals)", () => {
    const result = flipBudget({ gdv: valuation, profitPct, refurb, legals, saleCosts: 0, finance: 0, holding: 0 });
    expect(result).toBe(76400);
  });

  it("splitBudget: price + SDLT = flipBudget (company, ENG)", () => {
    const budget = flipBudget({ gdv: valuation, profitPct, refurb, legals, saleCosts: 0, finance: 0, holding: 0 });
    const split  = splitBudgetSolve(budget, { buyer: "company", nation: "ENG" });
    expect(split.price + split.sdlt).toBeCloseTo(budget, 0);
    expect(split.price).toBeGreaterThan(0);
  });

  it("auctionFlipWalkAway passes when all conditions met: ≥3 comps, all costs known, AIP recorded", () => {
    const budget = flipBudget({ gdv: valuation, profitPct, refurb, legals, saleCosts: 0, finance: 0, holding: 0 });
    const split  = splitBudgetSolve(budget, { buyer: "company", nation: "ENG" });
    const result = auctionFlipWalkAway({
      valuation,
      hasNullLines: false,
      totalCosts:   refurb + legals,
      split,
      endValue:     valuation.worst,
      profitPct,
      compCount:    3,
      aipRecorded:  true,
    });
    expect(result.verdict).toBe("pass");
    expect(result.tests.every(t => t.status === "pass")).toBe(true);
  });
});

// ── £1,500 buyer's premium impact ────────────────────────────────────────────
// Adding £1,500 buyer's premium must reduce flipBudget by exactly £1,500.
describe("buyer's premium impact on max bid", () => {
  const valuation = { worst: 120000, mid: 130000, best: 140000, basis: "worst", singlePoint: false };
  const refurb    = 18000;
  const profitPct = 0.15;

  it("£1,500 buyer's premium reduces flipBudget by £1,500", () => {
    const baseLegals    = 4000; // seller fees + legal/finance
    const without = flipBudget({ gdv: valuation, profitPct, refurb, legals: baseLegals,       saleCosts: 0, finance: 0, holding: 0 });
    const with_   = flipBudget({ gdv: valuation, profitPct, refurb, legals: baseLegals + 1500, saleCosts: 0, finance: 0, holding: 0 });
    expect(without - with_).toBe(1500);
  });

  it("buyer's premium does not change price+SDLT split ratio — only the total budget", () => {
    const budget1 = flipBudget({ gdv: valuation, profitPct, refurb, legals: 4000,       saleCosts: 0, finance: 0, holding: 0 });
    const budget2 = flipBudget({ gdv: valuation, profitPct, refurb, legals: 4000 + 1500, saleCosts: 0, finance: 0, holding: 0 });
    const split1  = splitBudgetSolve(budget1, { buyer: "company", nation: "ENG" });
    const split2  = splitBudgetSolve(budget2, { buyer: "company", nation: "ENG" });
    // Both splits should each be internally consistent (price + sdlt = respective budget)
    expect(split1.price + split1.sdlt).toBeCloseTo(budget1, 0);
    expect(split2.price + split2.sdlt).toBeCloseTo(budget2, 0);
  });
});

// ── Legal pack fixture: 3 fees, 1 unmappable ─────────────────────────────────
// otherFees: [management £500, drainage £150, no-label/no-amount]
// → 3 cost lines: 2 with amounts (£500, £150), 1 with null amount.
describe("mapLegalPackCostLines — 3 fees, 1 unmappable", () => {
  const lead = {
    legalPackDocuments: [
      {
        review: {
          additionalFees: {
            otherFees: [
              { label: "Management fee",    amount: 500,  vatApplied: false },
              { label: "Drainage search",   amount: 150,  vatApplied: false },
              { label: null,                amount: null                    }, // unmappable — RULE 7
            ],
          },
        },
      },
    ],
  };

  it("returns exactly 3 cost lines", () => {
    const lines = mapLegalPackCostLines(lead);
    expect(lines.length).toBe(3);
  });

  it("first two lines have correct amounts (£500, £150)", () => {
    const lines = mapLegalPackCostLines(lead);
    expect(lines[0].amount).toBe(500);
    expect(lines[1].amount).toBe(150);
  });

  it("third line has null amount — RULE 7 blocks Pass verdict", () => {
    const lines = mapLegalPackCostLines(lead);
    expect(lines[2].amount).toBeNull();
  });

  it("sumCosts of these 3 lines is incomplete due to null", () => {
    const lines  = mapLegalPackCostLines(lead);
    const result = sumCosts(lines);
    expect(result.status).toBe("incomplete");
    expect(result.total).toBeNull();
  });

  it("auctionFlipWalkAway fails costs test when hasNullLines is true", () => {
    const result = auctionFlipWalkAway({
      valuation:    { worst: 120000 },
      hasNullLines: true,
      totalCosts:   null,
      split:        null,
      endValue:     120000,
      profitPct:    0.15,
      compCount:    3,
      aipRecorded:  true,
    });
    const costsTest = result.tests.find(t => t.id === "costs");
    expect(costsTest.status).toBe("fail");
    expect(result.verdict).toBe("fail");
  });
});
