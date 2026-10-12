// Appraisal v2 tab — surfaces the P01 engine inside the deal detail view.
// Answers at a glance: maximum offer, fragility, walk-away verdict.
// RULE 7: null costs render "Unknown" and block a Pass verdict.
// RULE 9: worst-case value is the default basis.
// RULE 10: refinance proceeds are borrowing, not profit — four separate outputs.

import React, { useState, useMemo } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Info, ExternalLink, Calculator } from "lucide-react";
import {
  basisValue, toValuation,
  sumCosts, costLine,
  legalTotal, refurbTotal, holdingCostLine, holdingMonthlyRate, totalProjectMonths,
  flipBudget, flipBreakEvenSale, flipTargetSale,
  brrrBudget, breakEvenValuation, headroomPct, refiPosition,
  splitBudget,
  netMonthly, icrPass, monthlyMortgage,
  walkAway,
  runStress,
  sdlt as sdltDetail,
  bridgeRelease, bridgeLump,
} from "../lib/appraisal/index.js";
import { capitalCost, recycling } from "../lib/appraisal/capital.js";
import { DEFAULT_APPRAISAL_SETTINGS } from "../lib/migrations/v2.js";
import { round2 } from "../lib/utils.js";

// ── Local formatting ─────────────────────────────────────────────────────────
const fmtGBP  = (n) => n == null ? "—" : "£" + Math.round(n).toLocaleString("en-GB");
const fmtGBP2 = (n) => n == null ? "—" : "£" + (+(n).toFixed(2)).toLocaleString("en-GB", { minimumFractionDigits: 2 });
const fmtPct  = (n) => n == null ? "—" : (n * 100).toFixed(1) + "%";
const newId   = () => Math.random().toString(36).slice(2, 9);

// ── Local UI primitives (match App.jsx palette) ───────────────────────────────
function A2Card({ children, className = "" }) {
  return <div className={`bg-vx-bg border border-vx-divider rounded p-4 ${className}`}>{children}</div>;
}
function A2KPI({ label, value, sub, tone = "default" }) {
  const t = { default: "text-vx-text", good: "text-vx-positive", bad: "text-vx-negative", warn: "text-vx-caution" }[tone] || "text-vx-text";
  return (
    <div className="bg-vx-bg border border-vx-divider rounded p-3 flex flex-col gap-0.5">
      <div className="text-xs uppercase tracking-wide text-vx-muted font-medium leading-tight">{label}</div>
      <div className={`font-mono text-xl font-semibold tabular-nums ${t}`}>{value ?? "—"}</div>
      {sub && <div className="text-xs text-vx-muted">{sub}</div>}
    </div>
  );
}
function A2Badge({ children, tone = "default" }) {
  const map = {
    default: "bg-vx-surface-2 text-vx-muted",
    good: "bg-vx-surface text-vx-positive",
    bad: "bg-vx-surface text-vx-negative",
    warn: "bg-vx-surface text-vx-caution",
    info: "bg-vx-surface text-vx-accent-strong",
    unknown: "bg-vx-surface-2 text-vx-caution border border-vx-caution border-dashed",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[tone] || map.default}`}>{children}</span>;
}
function A2Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-vx-text border-b border-vx-divider pb-1">{title}</h4>
      {children}
    </div>
  );
}
function A2NumField({ label, value, onChange, prefix = "£", step = 1, min, placeholder, disabled = false }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>
      <div className={`flex items-center border border-vx-border rounded overflow-hidden bg-vx-bg focus-within:ring-2 focus-within:ring-vx-accent ${disabled ? "opacity-50" : ""}`}>
        {prefix && <span className="px-2 text-vx-muted text-sm font-mono">{prefix}</span>}
        <input
          type="number" step={step} min={min ?? 0} value={value ?? ""} disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full py-1.5 pr-2 text-sm font-mono outline-none tabular-nums bg-vx-bg"
        />
      </div>
    </label>
  );
}
function A2TextField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>
      <input type="text" value={value || ""} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full py-1.5 px-2 text-sm border border-vx-border rounded outline-none focus:ring-2 focus:ring-vx-accent bg-vx-bg"
      />
    </label>
  );
}
function A2PctField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-vx-muted mb-1">{label}</span>
      <div className="flex items-center border border-vx-border rounded overflow-hidden bg-vx-bg focus-within:ring-2 focus-within:ring-vx-accent">
        <input type="number" step="0.1" min="0" max="100"
          value={value != null ? round2(value * 100) : ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? null : round2(Number(e.target.value) / 100))}
          className="w-full py-1.5 pl-2 text-sm font-mono outline-none tabular-nums bg-vx-bg"
        />
        <span className="px-2 text-vx-muted text-sm">%</span>
      </div>
    </label>
  );
}
function A2Illustrative() {
  return <span className="text-xs text-vx-caution ml-1" title="Illustrative — verify before bidding">Illustrative</span>;
}
function A2ModeToggle({ mode, onChange }) {
  return (
    <div className="flex rounded overflow-hidden border border-vx-border text-xs font-medium">
      {[["lump", "Lump sum"], ["detail", "Itemised"]].map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={`px-3 py-1 ${mode === k ? "bg-vx-accent text-vx-accent-fg" : "bg-vx-bg text-vx-muted hover:bg-vx-surface"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Verdict helpers ───────────────────────────────────────────────────────────
const VERDICT_TONE  = { pass: "good",     warn: "warn",    fail: "bad"  };
const STATUS_TONE   = { pass: "good",     warn: "warn",    fail: "bad", ok: "good" };
const STATUS_ICON   = { pass: "✓",        warn: "⚠",       fail: "✗",   ok: "✓"   };
const BASIS_OPTIONS = [["worst", "Worst"], ["mid", "Mid"], ["best", "Best"]];
const STRATEGY_OPTIONS = [["flip", "Flip"], ["brrr", "BRRR"]];
const BASIS_LABELS = { quote: "Quote", estimate: "Estimate", benchmark: "Benchmark", illustrative: "Illustrative" };
const BASIS_TONE   = { quote: "good", estimate: "default", benchmark: "warn", illustrative: "warn" };

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Appraisal v2 tab rendered inside DealDetailView.
 * @param {{ deal, onChange, settings, buyBox }} props
 *   buyBox — the deal's linked Playbook (or null); drives strategy + threshold defaults
 */
export default function AppraisalV2Tab({ deal, onChange, settings, buyBox = null }) {
  const [stressExpanded, setStressExpanded] = useState(false);
  const [overridesOpen, setOverridesOpen] = useState(false);

  // ── v2 state helpers ────────────────────────────────────────────────────────
  const v2 = deal.v2 || {};
  function setV2(patch) {
    onChange({ v2: { ...v2, ...patch } });
  }
  function setValuation(patch) {
    setV2({ valuation: { ...(v2.valuation || {}), ...patch } });
  }
  function setRefinance(patch) {
    setV2({ refinance: { ...(v2.refinance || {}), ...patch } });
  }
  function setLegal(patch) {
    setV2({ legal: { ...(v2.legal || {}), ...patch } });
  }
  function setRefurb(patch) {
    setV2({ refurb: { ...(v2.refurb || {}), ...patch } });
  }
  function setHolding(patch) {
    setV2({ holding: { ...(v2.holding || {}), ...patch } });
  }

  // Project duration from phases — used by holding cost calculation
  const projMonths = totalProjectMonths(deal.phases || []);

  // ── Resolved settings — priority: per-deal override → Playbook → global ──
  const apprCfg = settings?.appraisal || DEFAULT_APPRAISAL_SETTINGS;
  // bbVal reads a single value from the linked Playbook's assumptions (null if absent)
  const bbVal = (key) => buyBox?.assumptions?.[key]?.value ?? null;

  const strategy       = v2.strategy ?? buyBox?.strategy ?? "flip";
  const profitPct      = v2.profitPct      ?? bbVal("targetProfitOnCostPct") ?? apprCfg.profitPctDefault;
  const ltv            = v2.refinance?.ltv ?? bbVal("refiLtvPct") ?? 0.75;
  const refiFees       = v2.refinance?.refiFees ?? 0;
  const acceptedLeftIn = v2.refinance?.acceptedLeftIn ?? bbVal("maxMoneyLeftInGBP") ?? apprCfg.acceptedLeftInDefault ?? 0;
  const icrThreshold   = v2.icr         ?? bbVal("icrThresholdPct")  ?? apprCfg.icr;
  const icrStressRate  = bbVal("icrStressRatePct") ?? apprCfg.icrStressRate;
  const minNetMonthly  = v2.minNetMonthly ?? apprCfg.minNetMonthly;
  const minHeadroom    = v2.minHeadroomPct ?? apprCfg.minHeadroomPct;
  const reserves       = v2.reserves ?? {
    mgmt:  bbVal("managementPct")  ?? apprCfg.reserves?.mgmt  ?? 0.10,
    maint: bbVal("maintenancePct") ?? apprCfg.reserves?.maint ?? 0.08,
    voids: bbVal("voidPct")        ?? apprCfg.reserves?.voids ?? 0.04,
  };
  const rent           = v2.rent?.monthly ?? 0;
  const btlRate        = deal.btlRate ?? 0.065;
  const valuation      = v2.valuation || { worst: null, mid: null, best: null, basis: "worst", comparables: [], singlePoint: false };
  const valBasis       = valuation.basis || "worst";

  // ── Bridge calculator ───────────────────────────────────────────────────────
  // Computed from funding sources when a bridge source exists.
  const bridgeCalc = useMemo(() => {
    const src = (v2.funding?.sources || []).find(s => s.type === "bridge");
    if (!src || !deal.price) return null;
    const gross = round2(deal.price * (src.ltvPct || 0));
    if (!gross) return null;
    const result = bridgeRelease({
      gross,
      monthlyRate:   src.monthlyRate  || 0,
      termMonths:    src.termMonths   || 12,
      interestMode:  src.interestMode || "retained",
      entryFeePct:   src.arrangementPct || 0,
      exitFeePct:    src.exitPct        || 0,
      exitFeeTiming: src.exitFeeTiming  || "redemption",
      brokerFee:     src.brokerFee      || 0,
      valuationFee:  src.valuationFee   || 0,
      lenderLegal:   src.lenderLegal    || 0,
      admin:         src.admin          || 0,
      extensionRate: src.extensionRate  ?? null,
    });
    // Finance cost = total cost at planned term
    const term = src.termMonths || 12;
    const financeCost = result.totalCostAt(term);
    // Redemption table at standard checkpoints
    const redemptionTable = [6, 9, 12, 15].map(m => ({
      month: m, redemption: result.redemptionAt(m), totalCost: result.totalCostAt(m),
    }));
    return { ...result, gross, financeCost, redemptionTable, term, src };
  }, [v2.funding, deal.price]);

  // ── Engine computations ─────────────────────────────────────────────────────
  const computed = useMemo(() => {
    // Structured cost sub-blocks (Phase A1/A2)
    const legalCost   = legalTotal(v2.legal);
    const refurbCost  = refurbTotal(v2.refurb);
    const holdingCost = holdingCostLine(v2.holding, projMonths).amount;
    const miscSummary = sumCosts(v2.costLines || []);

    // If ANY structured sub-block has been entered, use the structured path.
    // All entered sub-blocks must be non-null for a complete result (RULE 7).
    // Legacy path (all null): fall back to miscSummary alone.
    const hasStructured  = legalCost !== null || refurbCost !== null || holdingCost !== null;
    let costsSummary, totalCosts;
    if (hasStructured) {
      const structMissing = [
        ...(legalCost   === null ? ["legal"]   : []),
        ...(refurbCost  === null ? ["refurb"]  : []),
        ...(holdingCost === null ? ["holding"] : []),
        ...(miscSummary.missing || []),
      ];
      const isComplete = structMissing.length === 0;
      const sum = round2((legalCost ?? 0) + (refurbCost ?? 0) + (holdingCost ?? 0) + (miscSummary.total ?? 0));
      costsSummary = { total: isComplete ? sum : null, status: isComplete ? "complete" : "incomplete", missing: structMissing };
      totalCosts   = costsSummary.total;
    } else {
      costsSummary = miscSummary;
      totalCosts   = miscSummary.total;
    }

    const endValue = valuation.worst != null || valuation.mid != null || valuation.best != null
      ? basisValue(valuation)
      : null;

    // Finance cost from bridge source — always included when a source is configured (Phase A2)
    const financeFromSource = bridgeCalc ? bridgeCalc.financeCost : 0;

    // Budget = what we can spend on price + SDLT
    let budgetResult;
    if (strategy === "flip") {
      budgetResult = totalCosts !== null && endValue !== null
        ? flipBudget({ gdv: valuation, profitPct, refurb: totalCosts, legals: 0, saleCosts: 0, finance: financeFromSource, holding: 0 })
        : { status: "incomplete", missing: totalCosts === null ? (costsSummary.missing || ["costs"]) : ["valuation"] };
    } else {
      budgetResult = totalCosts !== null && endValue !== null
        ? brrrBudget({ endValue, ltv, refiFees: refiFees || 0, acceptedLeftIn, refurb: totalCosts, legals: 0, finance: financeFromSource, holding: 0 })
        : { status: "incomplete", missing: totalCosts === null ? (costsSummary.missing || ["costs"]) : ["valuation"] };
    }

    const isOk    = typeof budgetResult === "number";
    const budget  = isOk ? budgetResult : null;
    // splitBudget: price + SDLT = budget (company buyer, England — illustrative)
    const split   = isOk && budget > 0
      ? splitBudget(budget, { buyer: "company", nation: "ENG" })
      : null;

    const sdltInfo = split
      ? sdltDetail(split.price, { buyer: "company", nation: "ENG" })
      : null;

    // Total project cost = price + SDLT + all cost lines + reFiFees
    const totalProjectCost = split && totalCosts != null
      ? round2(split.price + split.sdlt + totalCosts + (refiFees || 0))
      : null;

    // BRRR analytics
    const bev = totalProjectCost != null
      ? breakEvenValuation({ totalCost: totalProjectCost, ltv, refiFees: refiFees || 0, acceptedLeftIn })
      : null;
    const hw = bev != null && endValue != null ? headroomPct(endValue, bev) : null;
    const rp = totalProjectCost != null && endValue != null
      ? refiPosition({ value: endValue, ltv, totalCost: totalProjectCost })
      : null;

    // Flip analytics
    const flipBreakEven = split
      ? flipBreakEvenSale({ price: split.price, buyer: "company", nation: "ENG",
          refurb: totalCosts || 0, legals: 0, saleCosts: 0, finance: 0, holding: 0 })
      : null;
    const targetProfit  = endValue != null ? round2(profitPct * endValue) : null;
    const flipTarget    = flipBreakEven != null && targetProfit != null
      ? flipTargetSale({ price: split?.price || 0, buyer: "company", nation: "ENG",
          refurb: totalCosts || 0, legals: 0, saleCosts: 0, finance: 0, holding: 0 }, targetProfit)
      : null;

    // Four measures (RULE 10: separate outputs, never summed)
    const grossRefi    = endValue != null ? round2(endValue * ltv) : null;
    const netRefi      = grossRefi != null ? round2(grossRefi - (refiFees || 0)) : null;
    const cashReleased = rp != null ? Math.max(0, rp) : null;
    const cashLeftInVal = totalProjectCost != null && netRefi != null
      ? Math.max(0, totalProjectCost - netRefi)
      : null;
    const equity       = endValue != null ? round2(endValue - endValue * ltv) : null;

    // Cash flow (BTL/BRRR)
    const refiLoan    = endValue != null ? round2(endValue * ltv) : 0;
    const mortgage    = refiLoan ? monthlyMortgage(refiLoan, btlRate, 300) : 0;
    const cfResult    = netMonthly({
      rent, mortgage,
      mgmtPct: reserves.mgmt, maintPct: reserves.maint, voidsPct: reserves.voids,
    });
    const icrResult = rent > 0 && refiLoan
      ? icrPass(rent * 12, refiLoan, icrStressRate, icrThreshold)
      : null;

    // Walk-away tests
    const walkResult = endValue != null
      ? walkAway({
          valuation,
          costs: costsSummary,
          lenderRoute: v2.refinance?.lenderRoute || null,
          totalCost: totalProjectCost || 0,
          endValue,
          ltv,
          refiFees: refiFees || 0,
          acceptedLeftIn,
          rent,
          mortgage,
          loan: refiLoan,
          mgmtPct: reserves.mgmt,
          maintPct: reserves.maint,
          voidsPct: reserves.voids,
        }, { minHeadroom, minNetMonthly, icrThreshold, icrStressRate })
      : null;

    // Stress tests (BRRR only when we have enough data)
    const stressResults = strategy === "brrr" && endValue != null && totalProjectCost != null
      ? runStress({ endValue, ltv, totalCost: totalProjectCost, acceptedLeftIn, refiFees,
          rent, mortgage,
          mgmtPct: reserves.mgmt, maintPct: reserves.maint, voidsPct: reserves.voids })
      : [];

    return {
      costsSummary, budget, split, sdltInfo,
      totalProjectCost, bev, hw, rp,
      flipBreakEven, targetProfit, flipTarget,
      cashReleased, cashLeftInVal, equity,
      refiLoan, mortgage, cfResult, icrResult,
      walkResult, stressResults,
      endValue, financeFromSource,
      legalCost, refurbCost, holdingCost,
    };
  }, [v2, strategy, profitPct, ltv, refiFees, acceptedLeftIn, rent, btlRate,
      reserves, icrThreshold, icrStressRate, minHeadroom, minNetMonthly, bridgeCalc, projMonths]);

  const { costsSummary, budget, split, sdltInfo, totalProjectCost,
    bev, hw, rp, flipBreakEven, flipTarget, cashReleased, cashLeftInVal, financeFromSource,
    equity, mortgage, cfResult, icrResult, walkResult, stressResults, endValue,
    legalCost, refurbCost, holdingCost } = computed;

  // ── Verdict bar tone ────────────────────────────────────────────────────────
  const verdict = walkResult?.verdict || "pass";
  const verdictTone = VERDICT_TONE[verdict] || "default";

  // ── Cost line helpers ───────────────────────────────────────────────────────
  function addCostLine() {
    const lines = [...(v2.costLines || []), costLine(newId(), "New line", null, "estimate")];
    setV2({ costLines: lines });
  }
  function updateCostLine(idx, patch) {
    const lines = (v2.costLines || []).map((l, i) => i === idx ? { ...l, ...patch } : l);
    setV2({ costLines: lines });
  }
  function removeCostLine(idx) {
    setV2({ costLines: (v2.costLines || []).filter((_, i) => i !== idx) });
  }

  // ── Comparables helpers ─────────────────────────────────────────────────────
  function addComp() {
    setValuation({ comparables: [...(valuation.comparables || []), { address: "", price: null, date: "", type: deal.propertyType || "", source: "", construction: "", frontage: "" }] });
  }
  function updateComp(idx, patch) {
    const comps = (valuation.comparables || []).map((c, i) => i === idx ? { ...c, ...patch } : c);
    setValuation({ comparables: comps });
  }
  function removeComp(idx) {
    setValuation({ comparables: (valuation.comparables || []).filter((_, i) => i !== idx) });
  }

  // ── Funding source helpers ──────────────────────────────────────────────────
  const bridgeSrcIdx = (v2.funding?.sources || []).findIndex(s => s.type === "bridge");
  const bridgeSrc    = bridgeSrcIdx >= 0 ? v2.funding.sources[bridgeSrcIdx] : null;

  function setBridgeSrc(patch) {
    const sources = [...(v2.funding?.sources || [])];
    if (bridgeSrcIdx >= 0) {
      sources[bridgeSrcIdx] = { ...sources[bridgeSrcIdx], ...patch };
    } else {
      // Create default bridge source
      sources.push({
        type: "bridge", ltvPct: 0.75, monthlyRate: 0.0085, termMonths: 12,
        interestMode: "retained", arrangementPct: 0.02, exitPct: 0.01,
        exitFeeTiming: "redemption", brokerFee: null, valuationFee: null,
        lenderLegal: null, admin: null, extensionRate: null,
        ...patch,
      });
    }
    setV2({ funding: { ...(v2.funding || {}), sources } });
  }

  function removeBridgeSrc() {
    const sources = (v2.funding?.sources || []).filter((_, i) => i !== bridgeSrcIdx);
    setV2({ funding: { ...(v2.funding || {}), sources } });
  }

  const nullLineCount = (v2.costLines || []).filter(l => l.amount == null).length;
  const compCount     = (valuation.comparables || []).length;

  // Stress: sorted worst-first, show bottom 3 unless expanded
  const stressSorted  = [...stressResults].sort((a, b) => {
    const order = { fail: 0, warn: 1, ok: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });
  const stressVisible = stressExpanded ? stressSorted : stressSorted.slice(0, 3);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Verdict bar ─────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between rounded px-4 py-3 text-sm font-semibold border ${
        verdict === "pass" ? "bg-vx-surface border-vx-positive text-vx-positive"
          : verdict === "warn" ? "bg-vx-surface border-vx-caution text-vx-caution"
          : "bg-vx-surface border-vx-negative text-vx-negative"
      }`}>
        <span>Appraisal v2</span>
        <span className="font-mono text-lg">
          {STATUS_ICON[verdict]} {verdict.toUpperCase()}
          {walkResult && walkResult.tests.some(t => t.status === "fail") && (
            <span className="text-xs font-normal ml-2 opacity-80">
              {walkResult.tests.filter(t => t.status === "fail").map(t => t.id).join(", ")}
            </span>
          )}
        </span>
      </div>

      {/* ── Strategy + Max offer ────────────────────────────────────────── */}
      <A2Card>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-vx-text">Maximum offer</h4>
          <div className="flex rounded overflow-hidden border border-vx-border text-xs font-medium">
            {STRATEGY_OPTIONS.map(([k, label]) => (
              <button key={k} type="button"
                onClick={() => setV2({ strategy: k })}
                className={`px-3 py-1 ${strategy === k ? "bg-vx-accent text-vx-accent-fg" : "bg-vx-bg text-vx-muted hover:bg-vx-surface"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Playbook badge — shows which playbook's strategy + thresholds are in effect */}
        {buyBox && (
          <div className="flex items-center gap-1.5 mb-3 text-xs text-vx-muted">
            <span>Playbook:</span>
            <A2Badge tone="info">{buyBox.name}</A2Badge>
            <A2Badge tone="default">{(buyBox.strategy || "flip").toUpperCase()}</A2Badge>
            {v2.strategy && v2.strategy !== buyBox.strategy && (
              <A2Badge tone="warn">strategy overridden</A2Badge>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <A2KPI label="Max price" value={fmtGBP(split?.price)} tone={split ? "good" : "default"} />
          <A2KPI label="SDLT" value={fmtGBP2(split?.sdlt)}
            sub={sdltInfo?.effectiveFrom ? `Effective ${sdltInfo.effectiveFrom}` : undefined} />
          <A2KPI label="Price + SDLT budget" value={fmtGBP(budget)} />
          <A2KPI label="Total project cost" value={fmtGBP(totalProjectCost)} />
        </div>

        {split && (
          <p className="text-xs text-vx-muted">
            {strategy === "flip"
              ? <>Stacked on {valBasis}-case value {fmtGBP(endValue)}. Profit target {fmtPct(profitPct)} ({fmtGBP(computed.targetProfit)}) taken first.<A2Illustrative /></>
              : <>Refi at {fmtPct(ltv)} LTV on {valBasis}-case value {fmtGBP(endValue)}. Accepted cash left in {fmtGBP(acceptedLeftIn)}.<A2Illustrative /></>
            }
          </p>
        )}
        {sdltInfo?.verifyAt && (
          <p className="text-xs text-vx-muted mt-1">
            SDLT company/additional-dwelling rates (effective {sdltInfo.effectiveFrom}).{" "}
            <a href={sdltInfo.verifyAt} target="_blank" rel="noreferrer" className="text-vx-accent underline">
              Verify at GOV.UK <ExternalLink size={10} className="inline" />
            </a>
          </p>
        )}
        {!split && (
          <p className="text-xs text-vx-caution">
            {typeof budgetResult === "object" ? `Incomplete — missing: ${(budgetResult?.missing || []).join(", ") || "enter valuation and cost lines"}` : "Enter valuation and cost lines to compute."}
          </p>
        )}
      </A2Card>

      {/* ── Valuation ───────────────────────────────────────────────────── */}
      <A2Card>
        <A2Section title="Valuation">
          <div className="flex items-center gap-2 mb-2 text-xs text-vx-muted">
            <span>Appraisal basis (RULE 9 — worst default):</span>
            <div className="flex rounded overflow-hidden border border-vx-border text-xs font-medium">
              {BASIS_OPTIONS.map(([k, label]) => (
                <button key={k} type="button"
                  onClick={() => setValuation({ basis: k })}
                  className={`px-3 py-0.5 ${valBasis === k ? "bg-vx-accent text-vx-accent-fg" : "bg-vx-bg text-vx-muted hover:bg-vx-surface"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[["worst", "Worst (default)"], ["mid", "Mid"], ["best", "Best"]].map(([k, label]) => (
              <A2NumField key={k} label={label} value={valuation[k]}
                onChange={(v) => setValuation({ [k]: v, singlePoint: false })} />
            ))}
          </div>

          {compCount < 3 && (
            <div className="mt-2 text-xs text-vx-caution flex items-center gap-1">
              <Info size={12} /> {compCount} comparable{compCount !== 1 ? "s" : ""} — recommend ≥ 3 before bidding.
            </div>
          )}

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-vx-muted">Comparables ({compCount})</span>
              <button type="button" onClick={addComp}
                className="text-xs text-vx-accent flex items-center gap-1 hover:underline">
                <Plus size={12} /> Add comparable
              </button>
            </div>
            {(valuation.comparables || []).map((c, i) => (
              <div key={i} className="p-2 bg-vx-surface rounded text-xs space-y-1.5">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                  <A2TextField label="Address" value={c.address} onChange={(v) => updateComp(i, { address: v })} />
                  <A2NumField  label="Price" value={c.price} onChange={(v) => updateComp(i, { price: v })} />
                  <A2TextField label="Date" value={c.date} placeholder="YYYY-MM-DD" onChange={(v) => updateComp(i, { date: v })} />
                  <A2TextField label="Type" value={c.type} onChange={(v) => updateComp(i, { type: v })} />
                  <div className="flex items-end gap-1">
                    <A2TextField label="Source" value={c.source} placeholder="e.g. Rightmove" onChange={(v) => updateComp(i, { source: v })} />
                    <button type="button" onClick={() => removeComp(i)} className="mb-0.5 text-vx-muted hover:text-vx-negative"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 items-end">
                  <A2TextField label="Construction" value={c.construction || ""} placeholder="e.g. cavity brick, timber frame" onChange={(v) => updateComp(i, { construction: v })} />
                  <A2TextField label="Frontage" value={c.frontage || ""} placeholder="e.g. pebbledash, render, brick" onChange={(v) => updateComp(i, { frontage: v })} />
                </div>
              </div>
            ))}
          </div>
        </A2Section>
      </A2Card>

      {/* ── Legal & acquisition costs ───────────────────────────────────── */}
      <A2Card>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-vx-text">Legal &amp; acquisition costs</h4>
          <A2ModeToggle mode={v2.legal?.mode || "lump"} onChange={(m) => setLegal({ mode: m })} />
        </div>

        {(v2.legal?.mode === "detail") ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <A2NumField label="Solicitor" value={v2.legal?.solicitor} onChange={(v) => setLegal({ solicitor: v })} />
              <A2NumField label="Searches" value={v2.legal?.searches} onChange={(v) => setLegal({ searches: v })} />
              <A2NumField label="Survey" value={v2.legal?.survey} onChange={(v) => setLegal({ survey: v })} />
              <A2NumField label="Broker fee" value={v2.legal?.broker} onChange={(v) => setLegal({ broker: v })} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <A2NumField label="Valuation fee" value={v2.legal?.valuation} onChange={(v) => setLegal({ valuation: v })} />
              <A2NumField label="Land Registry" value={v2.legal?.landReg} onChange={(v) => setLegal({ landReg: v })} />
              <A2NumField label="Other" value={v2.legal?.other} onChange={(v) => setLegal({ other: v })} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <A2NumField label="Total legal & acquisition costs" value={v2.legal?.lumpTotal}
              onChange={(v) => setLegal({ lumpTotal: v })} />
            <div>
              <span className="block text-xs font-medium text-vx-muted mb-1">Basis</span>
              <select value={v2.legal?.lumpBasis || "estimate"}
                onChange={(e) => setLegal({ lumpBasis: e.target.value })}
                className="w-full py-1.5 px-2 text-xs border border-vx-border rounded bg-vx-bg outline-none">
                {Object.entries(BASIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-end gap-2">
          {legalCost == null
            ? <A2Badge tone="unknown">Unknown — enter to unlock engine</A2Badge>
            : <span className="text-xs font-mono font-semibold text-vx-positive">{fmtGBP(legalCost)}</span>
          }
        </div>
      </A2Card>

      {/* ── Refurbishment ───────────────────────────────────────────────── */}
      <A2Card>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-vx-text">Refurbishment</h4>
          <A2ModeToggle mode={v2.refurb?.mode || "lump"} onChange={(m) => setRefurb({ mode: m })} />
        </div>

        {(v2.refurb?.mode === "detail") ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs text-vx-muted">
              <span>Scenario (RULE 9 — worst default):</span>
              <div className="flex rounded overflow-hidden border border-vx-border font-medium">
                {[["high", "Worst"], ["mid", "Mid"], ["low", "Best"]].map(([k, label]) => (
                  <button key={k} type="button"
                    onClick={() => setRefurb({ scenario: k })}
                    className={`px-3 py-0.5 ${(v2.refurb?.scenario || "high") === k ? "bg-vx-accent text-vx-accent-fg" : "bg-vx-bg text-vx-muted hover:bg-vx-surface"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {(v2.refurb?.items || []).map((item, i) => (
                <div key={i} className="grid grid-cols-3 md:grid-cols-4 gap-2 items-end bg-vx-surface p-2 rounded text-xs">
                  <A2TextField label={i === 0 ? "Item" : ""}
                    value={item.label || ""}
                    onChange={(v) => {
                      const items = (v2.refurb?.items || []).map((it, j) => j === i ? { ...it, label: v } : it);
                      setRefurb({ items });
                    }} />
                  <A2NumField label={i === 0 ? "Low (£)" : ""}
                    value={item.low}
                    onChange={(v) => {
                      const items = (v2.refurb?.items || []).map((it, j) => j === i ? { ...it, low: v } : it);
                      setRefurb({ items });
                    }} />
                  <A2NumField label={i === 0 ? "High (£)" : ""}
                    value={item.high}
                    onChange={(v) => {
                      const items = (v2.refurb?.items || []).map((it, j) => j === i ? { ...it, high: v } : it);
                      setRefurb({ items });
                    }} />
                  <div className="flex items-end justify-between gap-1">
                    {item.low != null && item.high != null ? (
                      <span className="text-xs font-mono text-vx-muted">
                        {(v2.refurb?.scenario || "high") === "high" ? fmtGBP(item.high)
                          : (v2.refurb?.scenario || "high") === "low" ? fmtGBP(item.low)
                          : fmtGBP(round2((Number(item.low) + Number(item.high)) / 2))}
                      </span>
                    ) : <span />}
                    <button type="button"
                      onClick={() => setRefurb({ items: (v2.refurb?.items || []).filter((_, j) => j !== i) })}
                      className="text-vx-muted hover:text-vx-negative"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button type="button"
                onClick={() => setRefurb({ items: [...(v2.refurb?.items || []), { label: "New item", low: null, high: null, amount: null }] })}
                className="text-xs text-vx-accent flex items-center gap-1 hover:underline">
                <Plus size={12} /> Add item
              </button>
              <A2PctField label={<>Contingency %<A2Illustrative /></>}
                value={v2.refurb?.contingencyPct ?? 0.15}
                onChange={(v) => setRefurb({ contingencyPct: v })} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <A2NumField label="Total refurb cost (ex. contingency)" value={v2.refurb?.lumpTotal}
              onChange={(v) => setRefurb({ lumpTotal: v })} />
            <A2PctField label={<>Contingency %<A2Illustrative /></>}
              value={v2.refurb?.contingencyPct ?? 0.15}
              onChange={(v) => setRefurb({ contingencyPct: v })} />
          </div>
        )}

        <div className="mt-2 flex items-center justify-end gap-2">
          {refurbCost == null
            ? <A2Badge tone="unknown">Unknown — enter to unlock engine</A2Badge>
            : <>
                <span className="text-xs font-mono font-semibold text-vx-positive">{fmtGBP(refurbCost)}</span>
                {(v2.refurb?.contingencyPct ?? 0) > 0 && (
                  <span className="text-xs text-vx-muted">(incl. {fmtPct(v2.refurb.contingencyPct)} contingency)</span>
                )}
              </>
          }
        </div>
      </A2Card>

      {/* ── Holding costs ───────────────────────────────────────────────── */}
      <A2Card>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-vx-text">Holding costs (non-finance)</h4>
          <A2ModeToggle mode={v2.holding?.mode || "lump"} onChange={(m) => setHolding({ mode: m })} />
        </div>

        {(v2.holding?.mode === "detail") ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <A2NumField label="Council tax (£/mo)" value={v2.holding?.ctax} onChange={(v) => setHolding({ ctax: v })} />
            <A2NumField label="Insurance (£/mo)" value={v2.holding?.insurance} onChange={(v) => setHolding({ insurance: v })} />
            <A2NumField label="Utilities (£/mo)" value={v2.holding?.utilities} onChange={(v) => setHolding({ utilities: v })} />
            <A2NumField label="Other (£/mo)" value={v2.holding?.other} onChange={(v) => setHolding({ other: v })} />
          </div>
        ) : (
          <A2NumField label="Monthly holding cost (£/mo)" value={v2.holding?.lumpMonthly}
            onChange={(v) => setHolding({ lumpMonthly: v })} />
        )}

        <div className="mt-3 text-xs text-vx-muted">
          {projMonths > 0
            ? <>Project duration: <strong>{projMonths} months</strong> (from timeline phases — update in the Progress tab).</>
            : <>Add timeline phases in the Progress tab to auto-compute the holding period.</>
          }
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          {holdingCost == null
            ? <A2Badge tone="unknown">Unknown — enter to unlock engine</A2Badge>
            : <span className="text-xs font-mono font-semibold text-vx-positive">
                {fmtGBP(holdingCost)}
                {holdingMonthlyRate(v2.holding) != null && projMonths > 0 && (
                  <span className="text-vx-muted font-normal ml-1">
                    ({projMonths} mo × {fmtGBP(holdingMonthlyRate(v2.holding))}/mo)
                  </span>
                )}
              </span>
          }
        </div>
      </A2Card>

      {/* ── Other cost lines ─────────────────────────────────────────────── */}
      <A2Card>
        <A2Section title="Other cost lines">
          {nullLineCount > 0 && (
            <div className="text-xs text-vx-caution flex items-center gap-1 mb-2">
              <Info size={12} /> Incomplete — {nullLineCount} unknown cost line{nullLineCount !== 1 ? "s" : ""}. Cannot produce a Pass verdict until all costs are entered.
            </div>
          )}

          <div className="space-y-2">
            {(v2.costLines || []).map((line, i) => (
              <div key={line.key || i} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end p-2 bg-vx-surface rounded text-xs">
                <A2TextField label="Label" value={line.label}
                  onChange={(v) => updateCostLine(i, { label: v, key: v.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) })} />
                <div>
                  <span className="block text-xs font-medium text-vx-muted mb-1">Amount</span>
                  {line.amount == null
                    ? (
                      <div className="flex items-center gap-1">
                        <A2Badge tone="unknown">Unknown</A2Badge>
                        <button type="button" className="text-xs text-vx-accent underline"
                          onClick={() => updateCostLine(i, { amount: 0 })}>Enter</button>
                      </div>
                    )
                    : (
                      <div className="flex items-center border border-vx-border rounded overflow-hidden bg-vx-bg">
                        <span className="px-2 text-vx-muted text-sm font-mono">£</span>
                        <input type="number" step="100" min="0" value={line.amount}
                          onChange={(e) => updateCostLine(i, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                          className="w-full py-1.5 pr-2 text-sm font-mono outline-none tabular-nums bg-vx-bg" />
                      </div>
                    )}
                </div>
                <div>
                  <span className="block text-xs font-medium text-vx-muted mb-1">Basis</span>
                  <select value={line.basis || "estimate"}
                    onChange={(e) => updateCostLine(i, { basis: e.target.value })}
                    className="w-full py-1.5 px-2 text-xs border border-vx-border rounded bg-vx-bg outline-none">
                    {Object.entries(BASIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <A2TextField label="Source" value={line.source} placeholder="e.g. trade quote"
                  onChange={(v) => updateCostLine(i, { source: v })} />
                <div className="flex items-end justify-between gap-1">
                  <A2Badge tone={BASIS_TONE[line.basis] || "default"}>{BASIS_LABELS[line.basis] || line.basis}</A2Badge>
                  <button type="button" onClick={() => removeCostLine(i)} className="text-vx-muted hover:text-vx-negative"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-2">
            <button type="button" onClick={addCostLine}
              className="text-xs text-vx-accent flex items-center gap-1 hover:underline">
              <Plus size={12} /> Add cost line
            </button>
            <span className={`text-xs font-mono font-semibold ${nullLineCount > 0 ? "text-vx-caution" : "text-vx-positive"}`}>
              {nullLineCount > 0 ? `Incomplete (${nullLineCount} unknown)` : fmtGBP((v2.costLines || []).reduce((s, l) => s + (l.amount || 0), 0))}
            </span>
          </div>
          <p className="text-xs text-vx-muted mt-1">Miscellaneous costs not covered by legal, refurb, or holding above. Avoid double-counting items already entered in the structured sections.</p>
        </A2Section>
      </A2Card>

      {/* ── Funding sources & bridging calculator ───────────────────────── */}
      <A2Card>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-vx-text flex items-center gap-1.5">
            <Calculator size={14} /> Funding &amp; bridging
          </h4>
          {!bridgeSrc && (
            <button type="button" onClick={() => setBridgeSrc({})}
              className="text-xs text-vx-accent flex items-center gap-1 hover:underline">
              <Plus size={12} /> Add bridge source
            </button>
          )}
        </div>

        {!bridgeSrc ? (
          <p className="text-xs text-vx-muted">No bridge source added. The maximum-offer calculation uses £0 for finance cost.</p>
        ) : (
          <div className="space-y-4">
            {/* Bridge source inputs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <A2PctField label="Bridge LTV %" value={bridgeSrc.ltvPct}
                onChange={(v) => setBridgeSrc({ ltvPct: v })} />
              <A2PctField label="Monthly rate %" value={bridgeSrc.monthlyRate}
                onChange={(v) => setBridgeSrc({ monthlyRate: v })} />
              <A2NumField label="Term (months)" value={bridgeSrc.termMonths}
                prefix="" step={1} min={1} placeholder="12"
                onChange={(v) => setBridgeSrc({ termMonths: v })} />
              <div>
                <span className="block text-xs font-medium text-vx-muted mb-1">Interest mode</span>
                <select value={bridgeSrc.interestMode || "retained"}
                  onChange={(e) => setBridgeSrc({ interestMode: e.target.value })}
                  className="w-full py-1.5 px-2 text-xs border border-vx-border rounded bg-vx-bg outline-none">
                  <option value="retained">Retained (day-one deduction)</option>
                  <option value="rolled">Rolled up (pay at redemption)</option>
                  <option value="serviced">Serviced (monthly payments)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <A2PctField label="Arrangement fee %" value={bridgeSrc.arrangementPct}
                onChange={(v) => setBridgeSrc({ arrangementPct: v })} />
              <A2PctField label="Exit fee %" value={bridgeSrc.exitPct}
                onChange={(v) => setBridgeSrc({ exitPct: v })} />
              <div>
                <span className="block text-xs font-medium text-vx-muted mb-1">Exit fee timing</span>
                <select value={bridgeSrc.exitFeeTiming || "redemption"}
                  onChange={(e) => setBridgeSrc({ exitFeeTiming: e.target.value })}
                  className="w-full py-1.5 px-2 text-xs border border-vx-border rounded bg-vx-bg outline-none">
                  <option value="redemption">At redemption</option>
                  <option value="start">At start (day one)</option>
                </select>
              </div>
              <A2PctField label="Extension rate %" value={bridgeSrc.extensionRate}
                placeholder={bridgeSrc.monthlyRate ? String(round2((bridgeSrc.monthlyRate || 0) * 100)) : "same as monthly"}
                onChange={(v) => setBridgeSrc({ extensionRate: v })} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <A2NumField label="Broker fee (£)" value={bridgeSrc.brokerFee}
                placeholder="0" onChange={(v) => setBridgeSrc({ brokerFee: v })} />
              <A2NumField label="Valuation fee (£)" value={bridgeSrc.valuationFee}
                placeholder="0" onChange={(v) => setBridgeSrc({ valuationFee: v })} />
              <A2NumField label="Lender legal (£)" value={bridgeSrc.lenderLegal}
                placeholder="0" onChange={(v) => setBridgeSrc({ lenderLegal: v })} />
              <A2NumField label="Admin / drawdown (£)" value={bridgeSrc.admin}
                placeholder="0" onChange={(v) => setBridgeSrc({ admin: v })} />
            </div>

            {/* Bridge calculator outputs — finance cost always included in engine when a source is configured */}
            {bridgeCalc ? (
              <div className="space-y-3 pt-2 border-t border-vx-divider">
                <h5 className="text-xs font-semibold text-vx-muted uppercase tracking-wide">Bridging calculator</h5>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <A2KPI label="Gross loan"
                    value={fmtGBP(bridgeCalc.gross)}
                    sub={`${deal.price ? fmtPct(bridgeSrc.ltvPct) : "—"} of purchase price`} />
                  <A2KPI label="Day-one release"
                    value={fmtGBP(bridgeCalc.dayOneRelease)}
                    tone={bridgeCalc.dayOneRelease > 0 ? "good" : "bad"} />
                  <A2KPI label="Finance cost at term"
                    value={fmtGBP(bridgeCalc.financeCost)}
                    sub={`${bridgeCalc.term} months`} />
                  <A2KPI label="Extension cost/month"
                    value={fmtGBP(bridgeCalc.extensionCostPerMonth)} />
                </div>

                {/* Shortfall warning */}
                {(() => {
                  const completionNeeded = (deal.price || 0) + (split?.sdlt || 0);
                  const shortfall = completionNeeded > 0 ? completionNeeded - bridgeCalc.dayOneRelease : null;
                  return shortfall != null && shortfall > 0 ? (
                    <div className="flex items-start gap-1.5 text-xs text-vx-caution bg-vx-surface border border-vx-caution rounded p-2">
                      <Info size={12} className="mt-0.5 flex-shrink-0" />
                      Day-one release {fmtGBP(bridgeCalc.dayOneRelease)} is {fmtGBP(shortfall)} short of completion funds
                      (price {fmtGBP(deal.price)} + SDLT {fmtGBP(split?.sdlt)}). Paul must bring{" "}
                      <strong>{fmtGBP(shortfall)}</strong> to completion.
                    </div>
                  ) : null;
                })()}

                {/* Redemption table */}
                <div>
                  <h6 className="text-xs font-medium text-vx-muted mb-1">Redemption schedule</h6>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-vx-muted border-b border-vx-divider">
                          <th className="text-left py-1 pr-4 font-medium">Month</th>
                          <th className="text-right py-1 pr-4 font-medium">Redemption amount</th>
                          <th className="text-right py-1 font-medium">Total finance cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bridgeCalc.redemptionTable.map(row => (
                          <tr key={row.month} className={`border-b border-vx-divider last:border-0 ${row.month === bridgeCalc.term ? "font-semibold text-vx-text" : "text-vx-muted"}`}>
                            <td className="py-1.5 pr-4">Month {row.month}{row.month === bridgeCalc.term ? " ← planned exit" : ""}</td>
                            <td className="py-1.5 pr-4 text-right font-mono tabular-nums">{fmtGBP(row.redemption)}</td>
                            <td className="py-1.5 text-right font-mono tabular-nums">{fmtGBP(row.totalCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Lender note (P04 spec) */}
                <p className="text-xs text-vx-muted italic">
                  Note: Daniel's actual quote was £850/month; the classroom golden case used 1% (£750). Always use
                  the lender's own illustration — these figures are indicative only.
                </p>
              </div>
            ) : (
              <p className="text-xs text-vx-caution">Enter deal purchase price to compute bridging figures.</p>
            )}

            <div className="flex justify-end">
              <button type="button" onClick={removeBridgeSrc}
                className="text-xs text-vx-muted hover:text-vx-negative flex items-center gap-1">
                <Trash2 size={12} /> Remove bridge source
              </button>
            </div>
          </div>
        )}
      </A2Card>

      {/* ── BRRR: Refinance inputs ───────────────────────────────────────── */}
      {strategy === "brrr" && (
        <A2Card>
          <A2Section title="Refinance">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <A2PctField label={<>Refi LTV<A2Illustrative /></>} value={ltv}
                onChange={(v) => setRefinance({ ltv: v })} />
              <A2NumField label="Refi fees (£)" value={refiFees || null}
                placeholder="0" onChange={(v) => setRefinance({ refiFees: v || 0 })} />
              <A2NumField label={<>Accepted cash left in<A2Illustrative /></>}
                value={v2.refinance?.acceptedLeftIn ?? null}
                placeholder={fmtGBP(apprCfg.acceptedLeftInDefault)}
                onChange={(v) => setRefinance({ acceptedLeftIn: v })} />
              <A2TextField label="Lender route" value={v2.refinance?.lenderRoute}
                placeholder="e.g. Broker: Moneycorp"
                onChange={(v) => setRefinance({ lenderRoute: v })} />
            </div>
          </A2Section>
        </A2Card>
      )}

      {/* ── BRRR: Rent ─────────────────────────────────────────────────── */}
      {strategy === "brrr" && (
        <A2Card>
          <A2Section title="Rental income">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <A2NumField label="Monthly rent (£)" value={v2.rent?.monthly || null}
                placeholder="0"
                onChange={(v) => setV2({ rent: { ...(v2.rent || {}), monthly: v } })} />
              <A2KPI label="Monthly mortgage (IO)" value={fmtGBP(mortgage)}
                sub={`${deal.btlRate ? (deal.btlRate * 100).toFixed(2) : "6.50"}% annual`} />
              <A2KPI label="Net monthly cash flow" value={fmtGBP(cfResult?.net)}
                tone={cfResult?.net != null ? (cfResult.net >= minNetMonthly ? "good" : cfResult.net >= 0 ? "warn" : "bad") : "default"}
                sub={cfResult?.net != null && cfResult.net < minNetMonthly ? `Below £${minNetMonthly} threshold` : undefined} />
            </div>
            {icrResult && (
              <div className={`mt-2 text-xs flex items-center gap-1 ${icrResult.pass ? "text-vx-positive" : "text-vx-negative"}`}>
                {icrResult.pass ? "✓" : "✗"} ICR {icrResult.icr?.toFixed(2) ?? "—"}
                {" "}(threshold {icrResult.threshold}× at {(icrStressRate * 100).toFixed(1)}% stress rate<A2Illustrative />)
              </div>
            )}
          </A2Section>
        </A2Card>
      )}

      {/* ── Four measures (RULE 10: refinance is borrowing, not profit) ── */}
      {strategy === "brrr" && (
        <A2Card>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-vx-text">Four measures</h4>
            <span className="text-xs text-vx-muted flex items-center gap-1"><Info size={12} /> Refinance money is borrowing, not profit</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <A2KPI label="Cash released on refi" value={fmtGBP(cashReleased)}
              tone={cashReleased != null ? (cashReleased > 0 ? "good" : "warn") : "default"}
              sub="Money back above costs" />
            <A2KPI label="Cash left in deal" value={fmtGBP(cashLeftInVal)}
              tone={cashLeftInVal != null ? (cashLeftInVal <= acceptedLeftIn ? "good" : "warn") : "default"}
              sub={`Target ≤ ${fmtGBP(acceptedLeftIn)}`} />
            <A2KPI label="Equity in property" value={fmtGBP(equity)}
              sub={`${fmtPct(equity != null && endValue ? equity / endValue : null)} of value`} />
            <A2KPI label="Net monthly cash flow" value={fmtGBP(cfResult?.net)}
              tone={cfResult?.net != null ? (cfResult.net >= minNetMonthly ? "good" : cfResult.net >= 0 ? "warn" : "bad") : "default"}
              sub="After mortgage + reserves" />
          </div>
        </A2Card>
      )}

      {/* ── Fragility ───────────────────────────────────────────────────── */}
      <A2Card>
        <A2Section title="Fragility">
          {strategy === "brrr" ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <A2KPI label="Break-even valuation" value={fmtGBP(bev)}
                sub="Minimum value for refi to cover costs" />
              <A2KPI label="Headroom" value={fmtPct(hw)}
                tone={hw == null ? "default" : hw >= minHeadroom ? "good" : hw >= 0 ? "warn" : "bad"}
                sub={`Threshold ${fmtPct(minHeadroom)}`} />
              <A2KPI label="Refi surplus / shortfall" value={fmtGBP(rp)}
                tone={rp == null ? "default" : rp >= 0 ? "good" : "bad"} />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <A2KPI label="Break-even sale price" value={fmtGBP(flipBreakEven)}
                sub="Zero profit" />
              <A2KPI label="Target sale price" value={fmtGBP(flipTarget)}
                sub={`At ${fmtPct(profitPct)} profit`} />
              <A2KPI label="Margin above break-even"
                value={flipBreakEven && flipTarget ? fmtGBP(flipTarget - flipBreakEven) : "—"}
                tone={flipBreakEven && endValue && endValue > flipBreakEven ? "good" : "warn"} />
            </div>
          )}
        </A2Section>
      </A2Card>

      {/* ── Stress tests (BRRR only) ────────────────────────────────────── */}
      {strategy === "brrr" && stressResults.length > 0 && (
        <A2Card>
          <A2Section title="Stress tests">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-vx-muted border-b border-vx-divider">
                    <th className="text-left py-1 pr-3 font-medium">Scenario</th>
                    <th className="text-right py-1 pr-3 font-medium">Position / Metric</th>
                    <th className="text-right py-1 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {stressVisible.map((s) => (
                    <tr key={s.id} className="border-b border-vx-divider last:border-0">
                      <td className="py-1.5 pr-3">{s.scenario}</td>
                      <td className={`py-1.5 pr-3 text-right font-mono ${s.severity === "ok" ? "text-vx-positive" : s.severity === "warn" ? "text-vx-caution" : "text-vx-negative"}`}>
                        {s.metric != null ? (s.metric > 10000 || s.metric < -10000 ? fmtGBP(s.metric) : fmtPct(s.headroom ?? s.metric)) : "—"}
                      </td>
                      <td className={`py-1.5 text-right ${s.severity === "ok" ? "text-vx-positive" : s.severity === "warn" ? "text-vx-caution" : "text-vx-negative"}`}>
                        {STATUS_ICON[s.severity] || "—"} {s.severity.toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stressResults.length > 3 && (
              <button type="button" onClick={() => setStressExpanded(e => !e)}
                className="text-xs text-vx-accent flex items-center gap-1 mt-2 hover:underline">
                {stressExpanded ? <><ChevronUp size={12} /> Show fewer</> : <><ChevronDown size={12} /> Show all {stressResults.length} scenarios</>}
              </button>
            )}
          </A2Section>
        </A2Card>
      )}

      {/* ── Walk-away tests ─────────────────────────────────────────────── */}
      {walkResult && (
        <A2Card>
          <A2Section title="Walk-away tests">
            <div className="space-y-2">
              {walkResult.tests.map((t) => (
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
          </A2Section>
        </A2Card>
      )}

      {/* ── Private capital allocation ───────────────────────────────────── */}
      <A2Card>
        <A2Section title="Private capital allocation">
          {(() => {
            const poolCfg = apprCfg.privateCapital || DEFAULT_APPRAISAL_SETTINGS.privateCapital;
            const allocated = v2.capitalAllocated;
            const costResult = allocated && v2.capitalDeployedAt && v2.capitalExpectedReturnAt
              ? (() => {
                  const ms = new Date(v2.capitalExpectedReturnAt) - new Date(v2.capitalDeployedAt);
                  const months = Math.max(0, ms / (1000 * 60 * 60 * 24 * 30.4375));
                  return capitalCost(allocated, months, poolCfg.ratePct || 0.08);
                })()
              : null;
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <A2NumField label="Capital allocated (£)" value={allocated}
                    placeholder="0" onChange={(v) => setV2({ capitalAllocated: v })} />
                  <A2TextField label="Date deployed" value={v2.capitalDeployedAt}
                    placeholder="YYYY-MM-DD" onChange={(v) => setV2({ capitalDeployedAt: v })} />
                  <A2TextField label="Expected return date" value={v2.capitalExpectedReturnAt}
                    placeholder="YYYY-MM-DD" onChange={(v) => setV2({ capitalExpectedReturnAt: v })} />
                  <A2TextField label="Actual return date" value={v2.capitalReturnedAt}
                    placeholder="YYYY-MM-DD" onChange={(v) => setV2({ capitalReturnedAt: v })} />
                </div>
                {costResult && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-vx-muted">
                    <span>Interest cost: <strong className="text-vx-text font-mono">{fmtGBP(costResult.cost)}</strong></span>
                    <span>({round2(costResult.months)} months at {fmtPct(poolCfg.ratePct || 0.08)} p.a. simple<A2Illustrative />)</span>
                  </div>
                )}
                {allocated && !v2.capitalReturnedAt && v2.capitalExpectedReturnAt && (() => {
                  const deadlineMs = new Date(v2.capitalExpectedReturnAt) - Date.now();
                  const termEnd = poolCfg.termMonths || 12;
                  const extCap  = poolCfg.extensionCapMonths || 3;
                  const deployedMs = v2.capitalDeployedAt ? Date.now() - new Date(v2.capitalDeployedAt) : 0;
                  const monthsHeld = deployedMs / (1000 * 60 * 60 * 24 * 30.4375);
                  if (monthsHeld > termEnd + extCap) {
                    return (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-vx-negative">
                        <Info size={12} /> Capital overrun — held {round2(monthsHeld)} months, beyond {termEnd + extCap}-month limit.
                      </div>
                    );
                  }
                  if (deadlineMs < 0) {
                    return (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-vx-caution">
                        <Info size={12} /> Expected return date has passed — update "Actual return date" when capital is back.
                      </div>
                    );
                  }
                  return null;
                })()}
                <p className="text-xs text-vx-muted mt-2">
                  Pool: {fmtGBP(poolCfg.pool || 50000)} at {fmtPct(poolCfg.ratePct || 0.08)} p.a. simple,{" "}
                  {poolCfg.termMonths || 12}-month bullet + {poolCfg.extensionCapMonths || 3}-month extension cap.{" "}
                  <A2Illustrative /> — tracked in Business Planner.
                </p>
              </>
            );
          })()}
        </A2Section>
      </A2Card>

      {/* ── Per-deal threshold overrides ────────────────────────────────── */}
      <A2Card>
        <button type="button" onClick={() => setOverridesOpen(o => !o)}
          className="flex items-center justify-between w-full text-sm font-semibold text-vx-text">
          <span>Thresholds (per-deal overrides)</span>
          {overridesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {overridesOpen && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
            <A2PctField label={<>Profit target % GDV<A2Illustrative /></>}
              value={v2.profitPct}
              placeholder={fmtPct(bbVal("targetProfitOnCostPct") ?? apprCfg.profitPctDefault)}
              onChange={(v) => setV2({ profitPct: v })} />
            <A2PctField label={<>ICR threshold<A2Illustrative /></>}
              value={v2.icr}
              placeholder={String(bbVal("icrThresholdPct") ?? apprCfg.icr)}
              onChange={(v) => setV2({ icr: v })} />
            <A2NumField label={<>Min net monthly £<A2Illustrative /></>}
              value={v2.minNetMonthly} placeholder={String(apprCfg.minNetMonthly)}
              onChange={(v) => setV2({ minNetMonthly: v })} />
            <A2PctField label={<>Min headroom %<A2Illustrative /></>}
              value={v2.minHeadroomPct} placeholder={fmtPct(apprCfg.minHeadroomPct)}
              onChange={(v) => setV2({ minHeadroomPct: v })} />
            <A2NumField label={<>Accepted cash left in £<A2Illustrative /></>}
              value={v2.refinance?.acceptedLeftIn}
              placeholder={String(bbVal("maxMoneyLeftInGBP") ?? apprCfg.acceptedLeftInDefault)}
              onChange={(v) => setRefinance({ acceptedLeftIn: v })} />
            <A2PctField label={<>Refi LTV<A2Illustrative /></>}
              value={v2.refinance?.ltv}
              placeholder={String(round2((bbVal("refiLtvPct") ?? 0.75) * 100))}
              onChange={(v) => setRefinance({ ltv: v })} />
          </div>
        )}
        <p className="text-xs text-vx-muted mt-2">
          Leave blank to use defaults from{buyBox ? <> Playbook &ldquo;{buyBox.name}&rdquo;, then</> : ""} Settings &rsaquo; Appraisal thresholds.
        </p>
      </A2Card>

    </div>
  );
}
