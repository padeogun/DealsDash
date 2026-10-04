// Pure calculation functions for the Funding Planner.
// No external imports; no side effects; no DOM or React references.
// Each auditable sub-value is: { value: number, formula: string, inputsUsed: object }

import { round2 } from "./utils.js";
function av(value, formula, inputsUsed) { return { value: round2(value), formula, inputsUsed }; }
function pctStr(v) { return `${(Number(v) * 100).toFixed(4).replace(/\.?0+$/, "")}%`; }

// ── SDLT ──────────────────────────────────────────────────────────────────────

// SDLT band tables encode the current (post-budget) rates for England only.
// Scotland uses LBTT; Wales uses LTT — a warning is surfaced in the UI when
// the deal's country field is set to Scotland or Wales.
// Additional-property surcharge bands effective 31 October 2024.
// Standard residential bands effective 1 April 2025 (nil-rate threshold back to £125k).
const SDLT_BANDS_ADDITIONAL = [
  [0, 125000, 0.05],
  [125000, 250000, 0.07],
  [250000, 925000, 0.10],
  [925000, 1500000, 0.15],
  [1500000, Infinity, 0.17],
];
const SDLT_BANDS_STANDARD = [
  [0, 125000, 0.0],
  [125000, 250000, 0.02],
  [250000, 925000, 0.05],
  [925000, 1500000, 0.10],
  [1500000, Infinity, 0.12],
];
const SDLT_DISCLAIMER =
  "SDLT rates shown are for England only (Scotland uses LBTT; Wales uses LTT). " +
  "Additional-property surcharge bands are effective 31 October 2024; " +
  "standard residential bands are effective 1 April 2025. " +
  "Verify current rates with HMRC before relying on this figure. Not financial advice.";

export function calcSdltAudit(price, additionalProperty) {
  price = Number(price) || 0;
  if (price <= 0) return { value: 0, bands: [], effectiveDate: null, disclaimer: SDLT_DISCLAIMER };
  if (additionalProperty && price < 40000) {
    return { value: 0, bands: [], effectiveDate: "31 October 2024", disclaimer: SDLT_DISCLAIMER };
  }
  const bands = additionalProperty ? SDLT_BANDS_ADDITIONAL : SDLT_BANDS_STANDARD;
  const effectiveDate = additionalProperty ? "31 October 2024" : "1 April 2025";
  let tax = 0;
  const bandDetail = [];
  for (const [lo, hi, rate] of bands) {
    const taxable = Math.max(0, Math.min(price, hi === Infinity ? price + 1 : hi) - lo);
    const amount = round2(taxable * rate);
    if (taxable > 0) bandDetail.push({ lo, hi: hi === Infinity ? null : hi, rate, taxable, amount });
    tax += amount;
  }
  return { value: round2(tax), bands: bandDetail, effectiveDate, disclaimer: SDLT_DISCLAIMER };
}

// ── Bridge interest ───────────────────────────────────────────────────────────

// Retained (rolled-up): interest compounds monthly — standard for most UK bridging products.
//   No monthly cash outflow; the total is settled at redemption.
// Serviced: interest paid from own cash each month — lower redemption but higher cash-in day 1.
export function calcBridgeInterest(loan, monthlyRate, termMonths, mode) {
  loan = Number(loan) || 0;
  monthlyRate = Number(monthlyRate) || 0;
  termMonths = Number(termMonths) || 0;
  if (mode === "serviced") {
    const monthly = round2(loan * monthlyRate);
    const total = round2(monthly * termMonths);
    return {
      mode: "serviced",
      monthly: av(monthly, `loan × monthly rate = ${loan} × ${pctStr(monthlyRate)}`, { loan, monthlyRate }),
      total: av(total, `monthly payment × term = ${monthly} × ${termMonths}mo`, { monthly, termMonths }),
    };
  }
  // retained (compound)
  const total = round2(loan * (Math.pow(1 + monthlyRate, termMonths) - 1));
  return {
    mode: "retained",
    total: av(total, `loan × ((1 + r)^n − 1) = ${loan} × ((1 + ${pctStr(monthlyRate)})^${termMonths} − 1)`, { loan, monthlyRate, termMonths }),
  };
}

// ── Bridge loan amount ────────────────────────────────────────────────────────

export function calcBridgeLoanAmt(price, ltvPct, basis, valuationOverride) {
  const base = basis === "valuation" && Number(valuationOverride) > 0
    ? Number(valuationOverride)
    : Number(price) || 0;
  const loan = round2(base * (Number(ltvPct) || 0));
  return av(loan, `${pctStr(ltvPct)} × ${basis === "valuation" ? "valuation" : "purchase price"}`, { ltvPct, base, basis });
}

// ── Cash purchase mode ────────────────────────────────────────────────────────

export function calcFundingModeCash({ price, additionalProperty, feesTotal, refurbTotal, holdingCosts }) {
  price = Number(price) || 0;
  feesTotal = Number(feesTotal) || 0;
  refurbTotal = Number(refurbTotal) || 0;
  holdingCosts = Number(holdingCosts) || 0;
  const sdlt = calcSdltAudit(price, additionalProperty !== false);
  const total = av(
    price + sdlt.value + feesTotal + refurbTotal + holdingCosts,
    "price + SDLT + fees + refurb + holding",
    { price, sdlt: sdlt.value, feesTotal, refurbTotal, holdingCosts },
  );
  return {
    sdlt,
    total,
    lines: [
      { label: "Purchase price", value: price },
      { label: "SDLT", value: sdlt.value },
      { label: "Acquisition fees", value: feesTotal },
      { label: "Refurbishment", value: refurbTotal },
      { label: "Holding costs", value: holdingCosts },
    ],
  };
}

// ── Bridging mode (Flip + BRRR exits) ────────────────────────────────────────

export function calcFundingModeBridge({
  price,
  additionalProperty,
  feesTotal,
  refurbTotal,
  holdingCosts,
  bridgeLtvPct,
  bridgeLoanBasis,   // "purchase" | "valuation"
  valuationOverride, // used only when basis === "valuation"
  monthlyRate,
  termMonths,
  arrangementPct,
  exitPct,
  interestMode,      // "retained" | "serviced"
  eaPct,
  solicitorSale,
  epc,
  gdv,
  refiLtvPct,
  mortgageProductFeePct,
}) {
  price = Number(price) || 0;
  gdv = Number(gdv) || 0;
  feesTotal = Number(feesTotal) || 0;
  refurbTotal = Number(refurbTotal) || 0;
  holdingCosts = Number(holdingCosts) || 0;

  const sdlt = calcSdltAudit(price, additionalProperty !== false);
  const bridgeLoan = calcBridgeLoanAmt(price, bridgeLtvPct, bridgeLoanBasis || "purchase", valuationOverride);
  const arrangementFee = av(
    bridgeLoan.value * (Number(arrangementPct) || 0),
    `arrangement ${pctStr(arrangementPct)} × loan`,
    { arrangementPct, bridgeLoan: bridgeLoan.value },
  );
  const exitFee = av(
    bridgeLoan.value * (Number(exitPct) || 0),
    `exit ${pctStr(exitPct)} × loan`,
    { exitPct, bridgeLoan: bridgeLoan.value },
  );
  const interest = calcBridgeInterest(bridgeLoan.value, monthlyRate, termMonths, interestMode || "retained");
  const servicedTotal = interest.mode === "serviced" ? interest.total.value : 0;
  const retainedTotal = interest.mode === "retained" ? interest.total.value : 0;

  // Cash-in = every £ that leaves your account on completion day.
  // For retained interest the bridge rolls up and is repaid at exit — not counted here.
  // For serviced interest the monthly payments come from your pocket — counted here.
  const cashIn = av(
    (price - bridgeLoan.value) + sdlt.value + feesTotal + refurbTotal + arrangementFee.value + holdingCosts + servicedTotal,
    "(price − bridge) + SDLT + fees + refurb + arrangement" +
      (interest.mode === "serviced" ? " + serviced interest" : "") +
      " + holding",
    { price, bridgeLoan: bridgeLoan.value, sdlt: sdlt.value, feesTotal, refurbTotal, arrangementFee: arrangementFee.value, holdingCosts, servicedTotal },
  );

  // Bridge redemption at exit
  const bridgeRedemption = av(
    bridgeLoan.value + retainedTotal + exitFee.value,
    "bridge loan + retained interest + exit fee",
    { bridgeLoan: bridgeLoan.value, retainedInterest: retainedTotal, exitFee: exitFee.value },
  );

  // ── Flip exit ──
  const eaFee = av(gdv * (Number(eaPct) || 0), `EA ${pctStr(eaPct)} × GDV`, { eaPct, gdv });
  const sellingCosts = av(
    eaFee.value + (Number(solicitorSale) || 0) + (Number(epc) || 0),
    "EA fee + legal + EPC",
    { eaFee: eaFee.value, solicitorSale, epc },
  );
  const netSale = av(gdv - sellingCosts.value, "GDV − selling costs", { gdv, sellingCosts: sellingCosts.value });
  const flipProfit = av(
    netSale.value - bridgeRedemption.value - cashIn.value,
    "net sale − bridge redemption − cash in",
    { netSale: netSale.value, bridgeRedemption: bridgeRedemption.value, cashIn: cashIn.value },
  );

  // ── BRRR exit ──
  const refiLoan = av(gdv * (Number(refiLtvPct) || 0), `refi LTV ${pctStr(refiLtvPct)} × GDV`, { refiLtvPct, gdv });
  const mortgageProductFee = av(
    refiLoan.value * (Number(mortgageProductFeePct) || 0),
    `product fee ${pctStr(mortgageProductFeePct)} × refi loan`,
    { mortgageProductFeePct, refiLoan: refiLoan.value },
  );
  // Money left in is the BRRR quality metric: how much of your own cash was NOT
  // returned by the refinance. Zero = perfect recycling; negative = cash released.
  // Target: as close to zero as possible.
  const moneyLeftInRaw = cashIn.value - (refiLoan.value - bridgeRedemption.value - mortgageProductFee.value);
  const cashReleased = moneyLeftInRaw < 0;
  const moneyLeftIn = av(
    cashReleased ? 0 : moneyLeftInRaw,
    "cash in − (refi loan − bridge redemption − product fee)",
    { cashIn: cashIn.value, refiLoan: refiLoan.value, bridgeRedemption: bridgeRedemption.value, mortgageProductFee: mortgageProductFee.value },
  );

  return {
    sdlt,
    bridgeLoan,
    arrangementFee,
    exitFee,
    interest,
    cashIn,
    bridgeRedemption,
    flip: { sellingCosts, eaFee, netSale, profit: flipProfit },
    brrr: { refiLoan, mortgageProductFee, moneyLeftIn, cashReleased },
    lines: [
      { label: "Purchase price", value: price },
      { label: "SDLT", value: sdlt.value },
      { label: "Acquisition fees", value: feesTotal },
      { label: "Refurbishment", value: refurbTotal },
      { label: "Holding costs", value: holdingCosts },
      { label: "Arrangement fee", value: arrangementFee.value },
      ...(interest.mode === "serviced" ? [{ label: "Bridge interest (serviced)", value: servicedTotal }] : []),
      { label: "Cash in", value: cashIn.value, isTotal: true },
      { label: "Bridge redemption", value: bridgeRedemption.value },
    ],
  };
}

// ── BTL mortgage mode ─────────────────────────────────────────────────────────

export function calcFundingModeMortgage({ price, additionalProperty, feesTotal, refurbTotal, ltv }) {
  price = Number(price) || 0;
  feesTotal = Number(feesTotal) || 0;
  refurbTotal = Number(refurbTotal) || 0;
  const sdlt = calcSdltAudit(price, additionalProperty !== false);
  const loan = av(price * (Number(ltv) || 0), `LTV ${pctStr(ltv)} × price`, { ltv, price });
  const deposit = av(price - loan.value, "price − loan", { price, loan: loan.value });
  const cashIn = av(
    deposit.value + sdlt.value + feesTotal + refurbTotal,
    "deposit + SDLT + fees + refurb",
    { deposit: deposit.value, sdlt: sdlt.value, feesTotal, refurbTotal },
  );
  return {
    sdlt,
    loan,
    deposit,
    cashIn,
    lines: [
      { label: "Purchase price", value: price },
      { label: "Mortgage loan", value: -loan.value },
      { label: "Deposit (cash)", value: deposit.value },
      { label: "SDLT", value: sdlt.value },
      { label: "Acquisition fees", value: feesTotal },
      { label: "Refurbishment", value: refurbTotal },
      { label: "Cash in", value: cashIn.value, isTotal: true },
    ],
  };
}

// ── ICR stress test ───────────────────────────────────────────────────────────

// ICR (Interest Coverage Ratio) = annual rent ÷ (loan × stress rate).
// Most UK BTL lenders require ≥ 1.25× at their own stress rate (often 5–5.5%).
// Some lenders use 1.45× as a reference rate for higher-rate taxpayers.
// If the deal's ICR fails, the Decision Brief returns PASS when a debt strategy is in use.
const ICR_DISCLAIMER =
  "Lender criteria (LTV, ICR, stress rate) vary by lender. Illustrative — confirm with your broker. Not a lending offer.";

export function calcIcr(annualRent, loan, stressRate, threshold, ref145 = 1.45) {
  annualRent = Number(annualRent) || 0;
  loan = Number(loan) || 0;
  stressRate = Number(stressRate) || 0;
  threshold = Number(threshold) || 1.25;
  if (loan <= 0 || stressRate <= 0) {
    return { icr: null, pass: null, maxLoanAtThreshold: null, maxLoanAt145: null, limitsRefi: false, disclaimer: ICR_DISCLAIMER };
  }
  const stressedAnnualPayment = round2(loan * stressRate);
  const icrVal = annualRent > 0 ? round2(annualRent / stressedAnnualPayment) : 0;
  const pass = icrVal >= threshold;
  const maxLoanAtThreshold = round2(annualRent / (stressRate * threshold));
  const maxLoanAt145 = round2(annualRent / (stressRate * ref145));
  const limitsRefi = loan > maxLoanAtThreshold;
  return {
    icr: av(icrVal, `annual rent ÷ (loan × stress rate) = ${annualRent} ÷ (${loan} × ${pctStr(stressRate)})`, { annualRent, loan, stressRate }),
    pass,
    threshold,
    maxLoanAtThreshold: av(maxLoanAtThreshold, `annual rent ÷ (stress rate × ${threshold}) = ${annualRent} ÷ (${pctStr(stressRate)} × ${threshold})`, { annualRent, stressRate, threshold }),
    maxLoanAt145: av(maxLoanAt145, `annual rent ÷ (stress rate × 1.45)`, { annualRent, stressRate }),
    limitsRefi,
    disclaimer: ICR_DISCLAIMER,
  };
}

// ── VIXIV revolving fund usage ────────────────────────────────────────────────

// fundTermDays: length of the revolving fund term (default 365 = 12 months)
// fundExtensionDays: available extension (default 90 = 3 months)
export function calcFundUsage(allocation, daysHeld, fundRatePct, fundTermDays = 365, fundExtensionDays = 90) {
  allocation = Number(allocation) || 0;
  daysHeld = Number(daysHeld) || 0;
  fundRatePct = Number(fundRatePct) || 0;
  const costVal = round2(allocation * fundRatePct * daysHeld / 365);
  const cost = av(costVal, `allocation × rate × days ÷ 365 = ${allocation} × ${pctStr(fundRatePct)} × ${daysHeld} ÷ 365`, { allocation, fundRatePct, daysHeld });
  const termOverrun = daysHeld > fundTermDays;
  const extensionOverrun = daysHeld > fundTermDays + fundExtensionDays;
  return { allocation, daysHeld, cost, termOverrun, extensionOverrun, fundTermDays, fundExtensionDays };
}
