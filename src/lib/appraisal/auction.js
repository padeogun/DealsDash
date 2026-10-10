// P05 — Auction assessment pure helpers.
// Extracted from AuctionAssessmentV2.jsx so they can be unit-tested without jsdom.
// RULE 7: unmappable legal pack fees become null cost lines — they block a Pass verdict.

import { costLine } from "./costs.js";
import { round2 } from "../utils.js";

const fmtGBP = (n) => n == null ? "—" : "£" + Math.round(n).toLocaleString("en-GB");
const fmtPct = (n) => n == null ? "—" : (n * 100).toFixed(1) + "%";

// ── Legal pack cost lines ─────────────────────────────────────────────────────
// Maps the most recent legal pack review's additionalFees into CostLine objects.
// Any fee with no label or unparseable amount becomes amount:null (RULE 7).
export function mapLegalPackCostLines(lead) {
  const docs = (lead.legalPackDocuments || []).filter(d => d.review?.additionalFees);
  if (docs.length === 0) return [];
  const latest = docs[docs.length - 1];
  const fees   = latest.review.additionalFees;
  const withVat = (amount, vat) => round2((Number(amount) || 0) * (vat ? 1.2 : 1));
  const lines  = [];

  if (Number(fees.buyerPremium) > 0) {
    lines.push(costLine("lp_buyer_premium", "Buyer's premium (legal pack)", withVat(fees.buyerPremium, fees.buyerPremiumVatApplied), "quote", "Legal pack"));
  }
  if (Number(fees.sellerLegalReimbursement) > 0) {
    lines.push(costLine("lp_seller_legal", "Seller's legal reimbursement", withVat(fees.sellerLegalReimbursement, fees.sellerLegalReimbursementVatApplied), "quote", "Legal pack"));
  }
  if (Number(fees.rentalReimbursement) > 0) {
    lines.push(costLine("lp_rental_reimb", "Rental reimbursement", withVat(fees.rentalReimbursement, fees.rentalReimbursementVatApplied), "quote", "Legal pack"));
  }
  for (const f of (fees.otherFees || [])) {
    const key    = (f.label || "unknown_fee").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    // No label or no parseable amount → null (RULE 7)
    const amount = f.label && f.amount != null ? withVat(f.amount, f.vatApplied) : null;
    lines.push(costLine("lp_" + key, f.label || "Unknown fee (legal pack)", amount, "quote", "Legal pack"));
  }
  return lines;
}

// ── Flip walk-away tests for auction ─────────────────────────────────────────
// 5 tests: value quality, cost completeness, profit margin, resilience (−10%), AIP.
// Returns { verdict: "pass"|"warn"|"fail", tests: Array<{ id, status, reasons }> }.
export function auctionFlipWalkAway({ valuation, hasNullLines, totalCosts, split, endValue, profitPct, compCount, aipRecorded }) {
  const tests = [];

  // 1. Value
  {
    const reasons = [];
    let status = "pass";
    if (!valuation.worst) { reasons.push("No worst-case valuation entered."); status = "fail"; }
    if (compCount < 3) {
      reasons.push(`Only ${compCount} comparable(s) — recommend ≥ 3 before bidding.`);
      if (status !== "fail") status = "warn";
    }
    tests.push({ id: "value", status, reasons });
  }

  // 2. Costs
  {
    const reasons = [];
    let status = "pass";
    if (hasNullLines)     { reasons.push("Unknown cost line(s) from legal pack — confirm before bidding."); status = "fail"; }
    if (totalCosts == null) { reasons.push("Cannot sum costs — some lines incomplete."); status = "fail"; }
    tests.push({ id: "costs", status, reasons });
  }

  // 3. Profit margin
  {
    const reasons = [];
    let status = "pass";
    if (!split) {
      reasons.push("Cannot compute max bid — enter valuation and costs first.");
      status = "fail";
    } else {
      const impliedProfit    = endValue - split.price - split.sdlt - (totalCosts || 0);
      const impliedProfitPct = endValue > 0 ? impliedProfit / endValue : 0;
      if (impliedProfitPct < profitPct * 0.5) {
        reasons.push(`Implied profit ${fmtPct(impliedProfitPct)} is less than half the ${fmtPct(profitPct)} target.`);
        status = "fail";
      } else if (impliedProfitPct < profitPct) {
        reasons.push(`Implied profit ${fmtPct(impliedProfitPct)} is below the ${fmtPct(profitPct)} target.`);
        status = "warn";
      }
    }
    tests.push({ id: "profit", status, reasons });
  }

  // 4. Resilience: −10% value stress
  {
    const reasons = [];
    let status = "pass";
    if (endValue && split && totalCosts != null) {
      const stressedValue  = round2(endValue * 0.90);
      const stressedMargin = stressedValue - split.price - split.sdlt - totalCosts;
      if (stressedMargin < 0) {
        reasons.push(`Under −10% value (${fmtGBP(stressedValue)}): margin is negative (${fmtGBP(stressedMargin)}).`);
        status = "fail";
      } else if (stressedMargin < 5000) {
        reasons.push(`Under −10% value (${fmtGBP(stressedValue)}): margin is only ${fmtGBP(stressedMargin)} — thin.`);
        status = "warn";
      }
    }
    tests.push({ id: "resilience", status, reasons });
  }

  // 5. AIP
  {
    const reasons = [];
    const status = aipRecorded ? "pass" : "warn";
    if (!aipRecorded) reasons.push("No Bridging Agreement in Principle recorded — arrange before bidding.");
    tests.push({ id: "aip", status, reasons });
  }

  const order    = ["pass", "warn", "fail"];
  const worstIdx = Math.max(...tests.map(t => order.indexOf(t.status)));
  return { verdict: order[worstIdx] || "pass", tests };
}
