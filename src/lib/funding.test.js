import { describe, it, expect } from "vitest";
import {
  calcSdltAudit,
  calcBridgeInterest,
  calcFundingModeBridge,
  calcFundingModeCash,
  calcFundingModeMortgage,
  calcIcr,
  calcFundUsage,
} from "./funding.js";

// Shared base inputs for bridge tests (£70k purchase, £130k GDV, £25k refurb)
const BASE = {
  price: 70000, additionalProperty: true, feesTotal: 4470, refurbTotal: 25000, holdingCosts: 0,
  bridgeLtvPct: 0.75, bridgeLoanBasis: "purchase", valuationOverride: 0,
  monthlyRate: 0.0085, termMonths: 12, arrangementPct: 0.02, exitPct: 0.01,
  interestMode: "retained",
  eaPct: 0.012, solicitorSale: 900, epc: 120,
  gdv: 130000, refiLtvPct: 0.75, mortgageProductFeePct: 0.01,
};

// ── SDLT ──────────────────────────────────────────────────────────────────────

describe("calcSdltAudit", () => {
  it("additional property £70k → 5% flat = £3,500", () => {
    expect(calcSdltAudit(70000, true).value).toBe(3500);
  });

  it("additional property under £40k → £0 (surcharge exempt)", () => {
    expect(calcSdltAudit(35000, true).value).toBe(0);
  });

  it("standard residential £200k → £1,500 (0% on first £125k, 2% on next £75k)", () => {
    // 0-125k at 0% = 0; 125k-200k at 2% = 1500
    expect(calcSdltAudit(200000, false).value).toBe(1500);
  });

  it("zero price → £0", () => {
    expect(calcSdltAudit(0, true).value).toBe(0);
  });
});

// ── Bridge interest ───────────────────────────────────────────────────────────

describe("calcBridgeInterest", () => {
  it("retained: compound interest on £52,500 for 12 months at 0.85%/mo", () => {
    const r = calcBridgeInterest(52500, 0.0085, 12, "retained");
    // 52500 × ((1.0085)^12 − 1) ≈ 5612.58 (compound)
    expect(r.mode).toBe("retained");
    expect(r.total.value).toBeCloseTo(5612.58, 1);
  });

  it("serviced: simple monthly payments on £52,500 at 0.85%/mo for 12 months", () => {
    const r = calcBridgeInterest(52500, 0.0085, 12, "serviced");
    expect(r.mode).toBe("serviced");
    expect(r.monthly.value).toBe(446.25); // 52500 × 0.0085
    expect(r.total.value).toBe(5355);     // 446.25 × 12
  });

  it("retained vs serviced: retained interest < serviced total (simple vs compound difference is small; key is cashIn differs)", () => {
    const retained = calcFundingModeBridge({ ...BASE, interestMode: "retained" });
    const serviced = calcFundingModeBridge({ ...BASE, interestMode: "serviced" });
    // Serviced cash in is higher because interest is paid upfront, not rolled in
    expect(serviced.cashIn.value).toBeGreaterThan(retained.cashIn.value);
    // Retained bridge redemption is higher (interest added to loan)
    expect(retained.bridgeRedemption.value).toBeGreaterThan(serviced.bridgeRedemption.value);
  });
});

// ── BRRR exits ───────────────────────────────────────────────────────────────

describe("BRRR exit", () => {
  it("BRRR money left in is positive with £130k GDV", () => {
    const r = calcFundingModeBridge(BASE);
    expect(r.brrr.cashReleased).toBe(false);
    expect(r.brrr.moneyLeftIn.value).toBeGreaterThan(0);
  });

  it("BRRR full cash release with high GDV (£200k)", () => {
    const r = calcFundingModeBridge({ ...BASE, gdv: 200000 });
    expect(r.brrr.cashReleased).toBe(true);
    expect(r.brrr.moneyLeftIn.value).toBe(0);
  });
});

// ── Zero-refurb case ─────────────────────────────────────────────────────────

describe("zero-refurb", () => {
  it("calcFundingModeCash with zero refurb: total = price + SDLT + fees", () => {
    const r = calcFundingModeCash({ price: 80000, additionalProperty: true, feesTotal: 4470, refurbTotal: 0, holdingCosts: 0 });
    // SDLT: 80000 × 5% = 4000
    expect(r.total.value).toBe(80000 + 4000 + 4470);
  });

  it("bridge mode with zero refurb: cashIn does not include refurb", () => {
    const withRefurb = calcFundingModeBridge(BASE);
    const noRefurb = calcFundingModeBridge({ ...BASE, refurbTotal: 0 });
    expect(withRefurb.cashIn.value - noRefurb.cashIn.value).toBe(25000);
  });
});

// ── ICR ───────────────────────────────────────────────────────────────────────

describe("calcIcr", () => {
  it("passes at 1.25 threshold with sufficient rent", () => {
    // rent £650/mo → £7,800/yr; loan £97,500; stress 5.5%
    // ICR = 7800 / (97500 × 0.055) = 7800 / 5362.5 = 1.4545… → rounds to 1.45 → PASS
    const r = calcIcr(7800, 97500, 0.055, 1.25);
    expect(r.pass).toBe(true);
    expect(r.icr.value).toBe(1.45);
    expect(r.limitsRefi).toBe(false);
  });

  it("fails when loan too large for the rent", () => {
    // rent £4,000/yr; loan £120,000; stress 5.5%
    // ICR = 4000 / (120000 × 0.055) = 4000 / 6600 ≈ 0.606 → FAIL
    const r = calcIcr(4000, 120000, 0.055, 1.25);
    expect(r.pass).toBe(false);
    expect(r.limitsRefi).toBe(true);
  });

  it("maxLoanAtThreshold limits the refi correctly", () => {
    const r = calcIcr(7800, 200000, 0.055, 1.25);
    // maxLoan = 7800 / (0.055 × 1.25) = 7800 / 0.06875 = 113,454.55
    expect(r.maxLoanAtThreshold.value).toBeCloseTo(113454.55, 0);
    expect(r.limitsRefi).toBe(true); // 200k > 113k
  });

  it("returns null ICR when loan is zero (prevents division by zero)", () => {
    const r = calcIcr(7800, 0, 0.055, 1.25);
    expect(r.icr).toBeNull();
    expect(r.pass).toBeNull();
  });
});

// ── Fund usage ────────────────────────────────────────────────────────────────

describe("calcFundUsage", () => {
  it("calculates fund cost correctly for 180 days at 8%", () => {
    const r = calcFundUsage(50000, 180, 0.08);
    // 50000 × 0.08 × 180 / 365 ≈ 1972.60
    expect(r.cost.value).toBeCloseTo(1972.60, 1);
  });

  it("no overrun within 12-month term", () => {
    const r = calcFundUsage(50000, 300, 0.08);
    expect(r.termOverrun).toBe(false);
    expect(r.extensionOverrun).toBe(false);
  });

  it("term overrun flag when deal exceeds 365 days", () => {
    const r = calcFundUsage(50000, 400, 0.08);
    expect(r.termOverrun).toBe(true);
    expect(r.extensionOverrun).toBe(false);
  });

  it("extension overrun when deal exceeds 455 days (365 + 90)", () => {
    const r = calcFundUsage(50000, 500, 0.08);
    expect(r.termOverrun).toBe(true);
    expect(r.extensionOverrun).toBe(true);
  });
});
