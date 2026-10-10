// P05 — Auction Assessment v2.
// Runs the v2 flip engine on a lead before Paul registers to bid.
// Surfaces: max bid, break-even price, walk-away verdict, bid sheet.
// RULE 7: null cost lines (unmapped legal pack fees) block a Pass verdict.
// RULE 9: worst-case valuation is the default basis.

import React, { useState, useMemo } from "react";
import { Info, Printer, ChevronDown, ChevronUp } from "lucide-react";
import {
  basisValue,
  flipBudget, flipBreakEvenSale, flipTargetSale,
  splitBudget,
  sdlt as sdltDetail,
  sumCosts, costLine,
  mapLegalPackCostLines, auctionFlipWalkAway,
} from "../lib/appraisal/index.js";
import { round2 } from "../lib/utils.js";

// ── Formatting ────────────────────────────────────────────────────────────────
const fmtGBP  = (n) => n == null ? "—" : "£" + Math.round(n).toLocaleString("en-GB");
const fmtPct  = (n) => n == null ? "—" : (n * 100).toFixed(1) + "%";

// ── Shared small primitives ───────────────────────────────────────────────────
function ACard({ children, className = "" }) {
  return <div className={`bg-vx-bg border border-vx-divider rounded p-4 ${className}`}>{children}</div>;
}
function AKpi({ label, value, sub, tone = "default" }) {
  const t = { default: "text-vx-text", good: "text-vx-positive", bad: "text-vx-negative", warn: "text-vx-caution" }[tone] || "text-vx-text";
  return (
    <div className="bg-vx-bg border border-vx-divider rounded p-3 flex flex-col gap-0.5">
      <div className="text-xs uppercase tracking-wide text-vx-muted font-medium">{label}</div>
      <div className={`font-mono text-xl font-semibold tabular-nums ${t}`}>{value ?? "—"}</div>
      {sub && <div className="text-xs text-vx-muted">{sub}</div>}
    </div>
  );
}
function ASection({ title, children }) {
  return (
    <div className="space-y-3">
      <h5 className="text-xs font-semibold text-vx-text border-b border-vx-divider pb-1 uppercase tracking-wide">{title}</h5>
      {children}
    </div>
  );
}
const STATUS_ICON = { pass: "✓", warn: "⚠", fail: "✗" };
const BASIS_LABELS = { quote: "Quote", estimate: "Estimate", benchmark: "Benchmark" };

// ── Main component ────────────────────────────────────────────────────────────
export default function AuctionAssessmentV2({ lead, onChange }) {
  const [bidSheetOpen, setBidSheetOpen] = useState(false);
  const [overrideInput, setOverrideInput] = useState("");

  const auctionV2 = lead.auctionV2 || {};

  function setAuctionV2(patch) {
    onChange({ auctionV2: { ...auctionV2, ...patch } });
  }
  function setValuation(patch) {
    setAuctionV2({ valuation: { ...(auctionV2.valuation || {}), ...patch } });
  }

  // Valuation — per-deal overrides fall back to lead's estimated resale values
  const valuation = useMemo(() => ({
    worst: auctionV2.valuation?.worst ?? (Number(lead.estResaleLow)  || null),
    mid:   auctionV2.valuation?.mid   ?? (lead.estResaleLow && lead.estResaleHigh
             ? Math.round((Number(lead.estResaleLow) + Number(lead.estResaleHigh)) / 2)
             : null),
    best:  auctionV2.valuation?.best  ?? (Number(lead.estResaleHigh) || null),
    basis: auctionV2.valuation?.basis || "worst",
    comparables: auctionV2.valuation?.comparables || [],
    singlePoint: false,
  }), [auctionV2.valuation, lead.estResaleLow, lead.estResaleHigh]);

  const profitPct  = auctionV2.profitPct ?? 0.15;
  const aipRecorded = !!auctionV2.aipRecorded;

  // Legal pack cost lines (derived — not stored)
  const legalPackLines = useMemo(() => mapLegalPackCostLines(lead), [lead.legalPackDocuments]);
  const hasLegalPackFees = legalPackLines.length > 0;

  // All cost lines for display (lead fields + legal pack)
  const allCostLines = useMemo(() => {
    const lines = [];
    if (Number(lead.estRefurb) > 0)
      lines.push(costLine("refurb", "Refurb estimate", Number(lead.estRefurb), "estimate", "Lead estimate"));
    if (Number(lead.buyerPremium) > 0)
      lines.push(costLine("buyer_premium", "Buyer's premium", Number(lead.buyerPremium), "quote", "Auction house"));
    if (Number(lead.sellerFeeReimbursements) > 0)
      lines.push(costLine("seller_fees", "Seller fee reimbursements", Number(lead.sellerFeeReimbursements), "quote", "Auction house"));
    if (Number(lead.estLegalFinance) > 0)
      lines.push(costLine("legal_finance", "Legal & finance", Number(lead.estLegalFinance), "estimate", "Lead estimate"));
    lines.push(...legalPackLines);
    return lines;
  }, [lead.estRefurb, lead.buyerPremium, lead.sellerFeeReimbursements, lead.estLegalFinance, legalPackLines]);

  // ── Engine ──────────────────────────────────────────────────────────────────
  const computed = useMemo(() => {
    const endValue = valuation.worst != null ? basisValue(valuation) : null;
    if (!endValue) return { status: "incomplete", reason: "Enter worst-case valuation." };

    const hasNullLines  = allCostLines.some(l => l.amount == null);
    const costsSummary  = sumCosts(allCostLines);
    const totalCosts    = costsSummary.total;   // null if any line unknown

    // Separate refurb from other costs for flipBudget parameters
    const refurbAmt = allCostLines.find(l => l.key === "refurb")?.amount || 0;
    const legalsAmt = totalCosts != null ? round2(totalCosts - refurbAmt) : 0;

    const budgetResult = totalCosts !== null
      ? flipBudget({ gdv: valuation, profitPct, refurb: refurbAmt, legals: legalsAmt, saleCosts: 0, finance: 0, holding: 0 })
      : null;

    const split = budgetResult && budgetResult > 0
      ? splitBudget(budgetResult, { buyer: "company", nation: "ENG" })
      : null;

    const sdltInfo = split ? sdltDetail(split.price, { buyer: "company", nation: "ENG" }) : null;

    const breakEvenSale = split
      ? flipBreakEvenSale({ price: split.price, buyer: "company", nation: "ENG",
          refurb: refurbAmt, legals: legalsAmt, saleCosts: 0, finance: 0, holding: 0 })
      : null;

    const targetProfit = round2(profitPct * endValue);
    const targetSale   = breakEvenSale != null
      ? flipTargetSale({ price: split.price, buyer: "company", nation: "ENG",
          refurb: refurbAmt, legals: legalsAmt, saleCosts: 0, finance: 0, holding: 0 }, targetProfit)
      : null;

    // Use lead.comparables for comp count — these are the sold comparable prices added on the lead
    const compCount    = (lead.comparables || []).length;
    const walkResult   = auctionFlipWalkAway({
      valuation, hasNullLines, totalCosts, split, endValue, profitPct, compCount, aipRecorded,
    });

    return { endValue, hasNullLines, totalCosts, refurbAmt, legalsAmt, budgetResult, split, sdltInfo, breakEvenSale, targetSale, targetProfit, walkResult, compCount };
  }, [valuation, allCostLines, profitPct, aipRecorded, lead.comparables]);

  const verdict     = computed.walkResult?.verdict || "pass";
  const isFail      = verdict === "fail";
  const overrideSet = !!auctionV2.overrideReason;

  const BASIS_OPTIONS = [["worst", "Worst"], ["mid", "Mid"], ["best", "Best"]];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pt-2" data-testid="auction-assessment-v2">

      {/* Verdict bar */}
      <div className={`flex items-center justify-between rounded px-4 py-3 text-sm font-semibold border ${
        verdict === "pass" ? "bg-vx-surface border-vx-positive text-vx-positive"
          : verdict === "warn" ? "bg-vx-surface border-vx-caution text-vx-caution"
          : "bg-vx-surface border-vx-negative text-vx-negative"
      }`}>
        <span className="flex items-center gap-2">Auction assessment v2
          {overrideSet && <span className="text-xs font-normal opacity-70">(overridden)</span>}
        </span>
        <span className="font-mono text-lg">{STATUS_ICON[verdict]} {verdict.toUpperCase()}</span>
      </div>

      {/* Valuation */}
      <ACard>
        <ASection title="Valuation (worst-case basis — RULE 9)">
          <div className="flex items-center gap-2 mb-2 text-xs text-vx-muted">
            <span>Basis:</span>
            <div className="flex rounded overflow-hidden border border-vx-border text-xs font-medium">
              {BASIS_OPTIONS.map(([k, label]) => (
                <button key={k} type="button"
                  onClick={() => setValuation({ basis: k })}
                  className={`px-3 py-0.5 ${(valuation.basis||"worst") === k ? "bg-vx-accent text-vx-accent-fg" : "bg-vx-bg text-vx-muted hover:bg-vx-surface"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["worst","Worst (default)"],["mid","Mid"],["best","Best"]].map(([k,label]) => (
              <label key={k} className="block">
                <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>
                <div className="flex items-center border border-vx-border rounded overflow-hidden bg-vx-bg focus-within:ring-2 focus-within:ring-vx-accent">
                  <span className="px-2 text-vx-muted text-sm font-mono">£</span>
                  <input type="number" step="1000" min="0"
                    value={auctionV2.valuation?.[k] ?? (k === "worst" ? (lead.estResaleLow || "") : k === "best" ? (lead.estResaleHigh || "") : "")}
                    placeholder={k === "worst" ? String(lead.estResaleLow || "") : k === "best" ? String(lead.estResaleHigh || "") : ""}
                    onChange={(e) => setValuation({ [k]: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full py-1.5 pr-2 text-sm font-mono outline-none tabular-nums bg-vx-bg" />
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-vx-muted mt-2">
            Pre-filled from lead's Est. resale low / high. Override here for a tighter worst-case.
          </p>
          <p className="text-xs text-vx-muted mt-1">
            Comparables: <span className={`font-medium ${(computed.compCount || 0) >= 3 ? "text-vx-positive" : "text-vx-caution"}`}>{computed.compCount || 0} entered</span>
            {(computed.compCount || 0) < 3 && " — add ≥ 3 sold prices on the lead's Property &amp; comps tab to clear this warning."}
          </p>
        </ASection>
      </ACard>

      {/* Cost lines */}
      <ACard>
        <ASection title="Cost lines">
          {allCostLines.length === 0 ? (
            <p className="text-xs text-vx-muted">No costs entered. Add Refurb, Buyer's premium, etc. on the lead.</p>
          ) : (
            <div className="space-y-1.5">
              {allCostLines.map((line, i) => (
                <div key={line.key || i} className="flex items-center justify-between gap-3 text-xs px-2 py-1.5 bg-vx-surface rounded">
                  <span className="flex-1 text-vx-text">{line.label}</span>
                  <span className="text-vx-muted">{BASIS_LABELS[line.basis] || line.basis}</span>
                  <span className="font-mono tabular-nums font-medium text-vx-text w-24 text-right">
                    {line.amount == null
                      ? <span className="text-vx-caution border border-vx-caution border-dashed rounded px-1">Unknown</span>
                      : fmtGBP(line.amount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-end pt-1 text-xs font-semibold font-mono">
                {computed.hasNullLines
                  ? <span className="text-vx-caution">Incomplete — unknown costs</span>
                  : <span className="text-vx-positive">Total {fmtGBP(computed.totalCosts)}</span>}
              </div>
            </div>
          )}
          {hasLegalPackFees && (
            <p className="text-xs text-vx-muted mt-2">Legal pack fees shown above — sourced from the most recent legal pack review.</p>
          )}
          {computed.hasNullLines && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-vx-caution">
              <Info size={12} /> Unknown cost line(s) block a Pass verdict until confirmed.
            </div>
          )}
        </ASection>
      </ACard>

      {/* Max bid */}
      <ACard>
        <ASection title="Maximum offer">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <AKpi label="Max bid (price)" value={fmtGBP(computed.split?.price)}
              tone={computed.split ? "good" : "default"} />
            <AKpi label="SDLT" value={fmtGBP(computed.split?.sdlt)}
              sub={computed.sdltInfo?.effectiveFrom ? `Eff. ${computed.sdltInfo.effectiveFrom}` : undefined} />
            <AKpi label="Break-even sale" value={fmtGBP(computed.breakEvenSale)}
              sub="Zero profit" />
            <AKpi label="Target sale" value={fmtGBP(computed.targetSale)}
              sub={`At ${fmtPct(profitPct)} profit`} />
          </div>

          <div className="flex items-center gap-3 mt-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer text-vx-text">
              <span>Profit target %:</span>
              <input type="number" step="0.5" min="0" max="50"
                value={round2((auctionV2.profitPct ?? 0.15) * 100)}
                onChange={(e) => setAuctionV2({ profitPct: e.target.value === "" ? null : round2(Number(e.target.value) / 100) })}
                className="w-16 py-0.5 px-2 text-xs border border-vx-border rounded font-mono bg-vx-bg outline-none" />
              <span className="text-vx-muted">%</span>
            </label>
          </div>

          {computed.sdltInfo?.verifyAt && (
            <p className="text-xs text-vx-muted mt-1">
              Company additional-dwelling SDLT (effective {computed.sdltInfo.effectiveFrom}).
              <span className="italic ml-1">Illustrative — verify before bidding.</span>
            </p>
          )}
          {!computed.split && computed.status === "incomplete" && (
            <p className="text-xs text-vx-caution mt-2">{computed.reason}</p>
          )}
        </ASection>
      </ACard>

      {/* Walk-away tests */}
      {computed.walkResult && (
        <ACard>
          <ASection title="Walk-away tests">
            <div className="space-y-2">
              {computed.walkResult.tests.map(t => (
                <div key={t.id} className={`p-2 rounded border-l-4 ${
                  t.status === "pass" ? "border-vx-positive bg-vx-surface" :
                  t.status === "warn" ? "border-vx-caution bg-vx-surface" :
                  "border-vx-negative bg-vx-surface"
                }`}>
                  <div className={`text-xs font-semibold flex items-center gap-1 ${
                    t.status === "pass" ? "text-vx-positive" : t.status === "warn" ? "text-vx-caution" : "text-vx-negative"
                  }`}>
                    {STATUS_ICON[t.status]} {t.id.charAt(0).toUpperCase() + t.id.slice(1)}
                  </div>
                  {t.reasons.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {t.reasons.map((r, i) => <li key={i} className="text-xs text-vx-muted">{r}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </ASection>
        </ACard>
      )}

      {/* AIP checkbox */}
      <ACard>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-vx-text">
          <input type="checkbox" checked={aipRecorded}
            onChange={(e) => setAuctionV2({ aipRecorded: e.target.checked })}
            className="w-4 h-4 accent-vx-accent" />
          Bridging Agreement in Principle (AIP) recorded
        </label>
        {!aipRecorded && (
          <p className="mt-1 text-xs text-vx-caution flex items-center gap-1">
            <Info size={12} /> AIP not recorded — shown as a warning on the bid sheet.
          </p>
        )}
      </ACard>

      {/* Fail override */}
      {isFail && !overrideSet && (
        <ACard>
          <ASection title="Override FAIL verdict">
            <p className="text-xs text-vx-muted mb-2">
              The assessment returned FAIL. To unlock "Ready to bid", enter a reason and confirm.
            </p>
            <div className="flex items-center gap-2">
              <input type="text" value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder="Reason for override (stored on lead)"
                className="flex-1 py-1.5 px-2 text-sm border border-vx-border rounded outline-none focus:ring-2 focus:ring-vx-accent bg-vx-bg" />
              <button type="button"
                disabled={!overrideInput.trim()}
                onClick={() => { setAuctionV2({ overrideReason: overrideInput.trim() }); setOverrideInput(""); }}
                className="px-3 py-1.5 text-xs font-medium bg-vx-accent text-vx-accent-fg rounded disabled:opacity-40">
                Confirm override
              </button>
            </div>
          </ASection>
        </ACard>
      )}
      {overrideSet && (
        <div className="text-xs text-vx-caution flex items-center gap-1.5 px-2">
          <Info size={12} /> FAIL overridden: "{auctionV2.overrideReason}"
          <button type="button" onClick={() => setAuctionV2({ overrideReason: null })}
            className="text-vx-muted underline hover:text-vx-negative ml-1">Remove override</button>
        </div>
      )}

      {/* "Ready to bid" action — hidden on FAIL unless overridden */}
      {(!isFail || overrideSet) && computed.split && (
        <div className="flex items-center justify-between bg-vx-surface rounded px-4 py-3 border border-vx-divider">
          <div>
            <div className="text-sm font-semibold text-vx-text">Ready to bid</div>
            <div className="text-xs text-vx-muted">Max bid {fmtGBP(computed.split.price)} · verdict {verdict.toUpperCase()}</div>
          </div>
          <button type="button" onClick={() => setBidSheetOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-vx-accent hover:underline">
            <Printer size={13} /> {bidSheetOpen ? "Hide" : "Open"} bid sheet
            {bidSheetOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      )}

      {/* Bid sheet — printable */}
      {bidSheetOpen && computed.split && (
        <ACard className="print:shadow-none print:border-0">
          <div className="space-y-4" id="auction-bid-sheet">
            <div className="flex items-start justify-between border-b border-vx-divider pb-3">
              <div>
                <h3 className="font-serif text-lg font-semibold text-vx-text">Auction Bid Sheet</h3>
                <p className="text-xs text-vx-muted mt-0.5">{lead.address || "Untitled"} · {lead.auctionDate || "Date TBC"}</p>
              </div>
              <div className={`text-sm font-semibold px-3 py-1 rounded border ${
                verdict === "pass" ? "border-vx-positive text-vx-positive" :
                verdict === "warn" ? "border-vx-caution text-vx-caution" :
                "border-vx-negative text-vx-negative"
              }`}>
                {STATUS_ICON[verdict]} {verdict.toUpperCase()}
                {overrideSet && " (overridden)"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-vx-muted uppercase tracking-wide font-medium mb-1">Maximum bid</div>
                <div className="text-3xl font-mono font-bold text-vx-text tabular-nums">{fmtGBP(computed.split.price)}</div>
                <div className="text-xs text-vx-muted mt-0.5">+ SDLT {fmtGBP(computed.split.sdlt)}</div>
              </div>
              <div>
                <div className="text-xs text-vx-muted uppercase tracking-wide font-medium mb-1">Walk-away (break-even)</div>
                <div className="text-2xl font-mono font-semibold text-vx-text tabular-nums">{fmtGBP(computed.breakEvenSale)}</div>
                <div className="text-xs text-vx-muted mt-0.5">Zero-profit sale price</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-vx-divider">
              <div>
                <div className="text-xs text-vx-muted font-medium mb-1">Worst-case valuation</div>
                <div className="text-sm font-mono text-vx-text">{fmtGBP(computed.endValue)}</div>
              </div>
              <div>
                <div className="text-xs text-vx-muted font-medium mb-1">Total costs</div>
                <div className="text-sm font-mono text-vx-text">{fmtGBP(computed.totalCosts)}</div>
              </div>
              <div>
                <div className="text-xs text-vx-muted font-medium mb-1">Target sale ({fmtPct(profitPct)} profit)</div>
                <div className="text-sm font-mono text-vx-text">{fmtGBP(computed.targetSale)}</div>
              </div>
              <div>
                <div className="text-xs text-vx-muted font-medium mb-1">Bridging AIP</div>
                <div className={`text-sm font-medium ${aipRecorded ? "text-vx-positive" : "text-vx-caution"}`}>
                  {aipRecorded ? "✓ Recorded" : "⚠ Not recorded"}
                </div>
              </div>
            </div>

            {/* Top 3 risks */}
            {computed.walkResult && (() => {
              const failing = computed.walkResult.tests.filter(t => t.status !== "pass");
              const top3    = failing.slice(0, 3);
              return top3.length > 0 ? (
                <div className="pt-2 border-t border-vx-divider">
                  <div className="text-xs text-vx-muted font-medium mb-1">Top risks</div>
                  <ul className="space-y-1">
                    {top3.map(t => (
                      <li key={t.id} className={`text-xs flex items-start gap-1.5 ${t.status === "fail" ? "text-vx-negative" : "text-vx-caution"}`}>
                        <span>{STATUS_ICON[t.status]}</span>
                        <span>{t.id.charAt(0).toUpperCase() + t.id.slice(1)}: {t.reasons[0] || "See assessment"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}

            {lead.auctionHouse && (
              <div className="text-xs text-vx-muted pt-2 border-t border-vx-divider">
                {lead.auctionHouse}{lead.lotNumber ? ` · Lot ${lead.lotNumber}` : ""}
                {lead.completionDays ? ` · ${lead.completionDays}-day completion` : ""}
              </div>
            )}

            <p className="text-xs text-vx-muted italic">
              Illustrative — verify all figures with your professional advisers before bidding.
              SDLT company/additional-dwelling rates effective {computed.sdltInfo?.effectiveFrom || "2025-10-31"}.
            </p>

            <button type="button" onClick={() => window.print()}
              className="print:hidden flex items-center gap-1.5 text-xs text-vx-accent hover:underline">
              <Printer size={13} /> Print / save as PDF
            </button>
          </div>
        </ACard>
      )}
    </div>
  );
}
