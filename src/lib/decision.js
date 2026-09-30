// Pure recommendation logic for the one-page Decision Brief.
// No React, Firebase, or DOM references. Accepts pre-computed appraisal / ICR data.
// Audit trail format: { value, source, sourceRef, retrievedAt, isIllustrative, unit }

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_DECISION_RULES = {
  minProfitOnCostPct: 0.15,   // net profit / totalCost ≥ 15%
  minNetProfitGBP:    25000,  // absolute minimum net profit
  maxMoneyLeftInGBP:  0,      // BRRR: max cash not recovered after refi (0 = no limit)
  icrThreshold:       1.25,   // minimum ICR ratio
  requireGateComplete:true,   // all gating questions must be answered for BUY
};

// ── Audit value helper ────────────────────────────────────────────────────────

export function auditVal(value, source, sourceRef, isIllustrative = false, unit = null) {
  return { value, source, sourceRef, retrievedAt: Date.now(), isIllustrative, unit };
}

// ── Legal pack helpers ────────────────────────────────────────────────────────

export function legalPackRedFlags(documents) {
  const flags = [];
  for (const d of documents || []) {
    for (const f of d.review?.flags || []) {
      if (f.urgency === "Raise with solicitor before bidding") {
        flags.push({ ...f, docFilename: d.filename });
      }
    }
  }
  return flags;
}

// ── Rules resolver ────────────────────────────────────────────────────────────

export function resolveRules(buyBox) {
  const a = buyBox?.assumptions || {};
  const v = key => a[key]?.value;
  return {
    minProfitOnCostPct:  v("targetProfitOnCostPct") ?? DEFAULT_DECISION_RULES.minProfitOnCostPct,
    minNetProfitGBP:     v("targetProfitMinGBP")   ?? DEFAULT_DECISION_RULES.minNetProfitGBP,
    maxMoneyLeftInGBP:   v("maxMoneyLeftInGBP")    ?? DEFAULT_DECISION_RULES.maxMoneyLeftInGBP,
    icrThreshold:        v("icrThresholdPct")      ?? DEFAULT_DECISION_RULES.icrThreshold,
    requireGateComplete: DEFAULT_DECISION_RULES.requireGateComplete,
  };
}

// ── Decision evaluation ───────────────────────────────────────────────────────

// Gating keys checked against triage (lead data, optional)
const GATING_KEYS = ["areaKnown", "assetTypeFits", "conditionAddsValue", "liquid12m", "areaStrong"];
const GATING_LABELS = {
  areaKnown:         "Area not known well enough",
  assetTypeFits:     "Asset type does not fit",
  conditionAddsValue:"Condition doesn't add value on refurb",
  liquid12m:         "Not liquid enough",
  areaStrong:        "Area isn't strong enough",
};

// evaluateDecision({ appraisal, icrResult, fundingBrrr, triage, buyBoxGate, rules, deal })
// Returns { verdict: "BUY"|"WATCH"|"PASS", reasons: string[], profitOnCost: number }
export function evaluateDecision({ appraisal, icrResult, fundingBrrr, triage, buyBoxGate, rules, deal }) {
  const r = { ...DEFAULT_DECISION_RULES, ...(rules || {}) };
  const passReasons = [];

  // ── PASS — hard fails ──────────────────────────────────────────────────────

  // 1. Gating question failed (from lead triage, optional)
  if (triage) {
    const failKey = GATING_KEYS.find(k => triage[k] === false);
    if (failKey) passReasons.push(GATING_LABELS[failKey] || failKey);
  }

  // 2. Legal pack red flag unresolved
  const redFlags = legalPackRedFlags(deal?.legalPackDocuments);
  if (redFlags.length > 0) {
    const f = redFlags[0];
    passReasons.push(`Legal pack: ${f.category}${f.pageHint ? ` (${f.pageHint})` : ""}`);
  }

  // 3. Outside buy box on a hard filter
  if (buyBoxGate) {
    if (buyBoxGate.areaKnown === false) {
      passReasons.push(`Outside buy box area: ${deal?.postcode || "unknown postcode"}`);
    }
    if (buyBoxGate.assetTypeFits === false) {
      passReasons.push(`Outside buy box: ${deal?.propertyType || "property type"} not in buy box`);
    }
    if (buyBoxGate.tenureFits === false) {
      passReasons.push(`Outside buy box: ${deal?.tenure || "tenure"} not in buy box`);
    }
  }

  // 4. Profit on cost < minimum
  const totalCost = appraisal?.totalCost || 0;
  const netProfit = appraisal?.netProfit || 0;
  const profitOnCost = totalCost > 0 ? netProfit / totalCost : 0;

  if (r.minProfitOnCostPct > 0 && profitOnCost < r.minProfitOnCostPct) {
    passReasons.push(
      `Profit on cost ${(profitOnCost * 100).toFixed(1)}% < ${(r.minProfitOnCostPct * 100).toFixed(0)}% minimum`
    );
  }

  // 5. ICR fails AND strategy is not cash-only
  const isBridgeOrRefi = (deal?.fundingMode || "bridge") !== "cash";
  if (icrResult && icrResult.pass === false && isBridgeOrRefi) {
    const icrVal = icrResult.icr?.value ?? 0;
    passReasons.push(
      `ICR ${icrVal.toFixed(2)} below ${icrResult.threshold} threshold (refinance strategy)`
    );
  }

  if (passReasons.length > 0) return { verdict: "PASS", reasons: passReasons, profitOnCost };

  // ── BUY — all thresholds must be met ──────────────────────────────────────
  const watchReasons = [];

  // Net profit minimum
  if (netProfit < r.minNetProfitGBP) {
    watchReasons.push(
      `Net profit £${Math.round(netProfit).toLocaleString()} below £${r.minNetProfitGBP.toLocaleString()} minimum`
    );
  }

  // BRRR: money left in check
  if (r.maxMoneyLeftInGBP > 0 && fundingBrrr) {
    const mli = fundingBrrr.moneyLeftIn?.value ?? 0;
    if (mli > r.maxMoneyLeftInGBP) {
      watchReasons.push(
        `Money left in £${Math.round(mli).toLocaleString()} > £${r.maxMoneyLeftInGBP.toLocaleString()} max`
      );
    }
  }

  // Gate items complete
  if (r.requireGateComplete && triage) {
    const incomplete = GATING_KEYS.filter(k => triage[k] === null);
    if (incomplete.length > 0) {
      watchReasons.push(
        `${incomplete.length} Bid Ready gate item${incomplete.length > 1 ? "s" : ""} not answered`
      );
    }
  }

  if (watchReasons.length === 0) return { verdict: "BUY", reasons: [], profitOnCost };

  return { verdict: "WATCH", reasons: watchReasons, profitOnCost };
}

// ── Risk register ─────────────────────────────────────────────────────────────

export function buildRiskRegister(deal) {
  const items = [];

  // Legal pack flags → High risk
  for (const f of legalPackRedFlags(deal?.legalPackDocuments)) {
    items.push({
      risk: f.category,
      detail: f.summary,
      rating: "High",
      mitigation: "Raise with solicitor before bidding",
      source: "legalPack",
      sourceRef: f.docFilename + (f.pageHint ? ` · ${f.pageHint}` : ""),
    });
  }

  // EPC below E
  if (deal?.epcCheck?.rating) {
    const grade = deal.epcCheck.rating.toUpperCase();
    if ("FG".includes(grade)) {
      items.push({
        risk: `EPC ${grade} — potential rental restriction`,
        detail: "Properties below EPC E may face restrictions on new tenancies. Budget for energy upgrades.",
        rating: "High",
        mitigation: "Get EPC assessor quote for improvements before bidding",
        source: "epcApi",
        sourceRef: deal.epcCheck.sourceRef || "EPC Register",
      });
    }
  }

  // Flood risk — areaIntelligence.flood is { areaCount, areas[] } from fetchFloodRisk()
  const floodAreaCount = Number(deal?.areaIntelligence?.flood?.areaCount);
  if (floodAreaCount > 0) {
    const areas = deal.areaIntelligence.flood.areas || [];
    const areaLabel = areas[0]?.label || "a flood risk area";
    items.push({
      risk: `Flood risk — ${floodAreaCount} EA flood area${floodAreaCount > 1 ? "s" : ""} within 3 km`,
      detail: `Property is within 3 km of ${areaLabel}. Check flood insurance availability and annual cost.`,
      rating: floodAreaCount >= 3 ? "High" : "Med",
      mitigation: "Confirm flood insurance quote before bidding",
      source: "areaIntelligence",
      sourceRef: "Environment Agency flood map",
    });
  }

  // Refurb cost not estimated
  const refurbMid = (deal?.refurbItems || []).reduce(
    (s, i) => s + ((Number(i.low) || 0) + (Number(i.high) || 0)) / 2,
    0
  );
  if (refurbMid === 0) {
    items.push({
      risk: "Refurb cost not estimated",
      detail: "No refurbishment costs entered — total cost and profit are provisional.",
      rating: "Med",
      mitigation: "Get builder quotes before bidding",
      source: "dealData",
      sourceRef: "Refurb tab",
    });
  }

  // Survey completed but not applied
  if (deal?.survey && !deal?.surveyApplied) {
    items.push({
      risk: "Viewing survey not applied",
      detail: "A survey has been completed but items haven't been applied to refurb estimates.",
      rating: "Med",
      mitigation: "Apply survey from the Viewing Survey tab",
      source: "dealData",
      sourceRef: "Viewing survey tab",
    });
  }

  return items;
}

// ── Open questions ────────────────────────────────────────────────────────────

export function buildOpenQuestions(deal, appraisal, icrResult) {
  const questions = [];

  // No verified comps
  const validComps = (deal?.comps || []).filter(c => c.address && Number(c.price) > 0);
  if (validComps.length === 0) {
    questions.push({
      question: "No verified comparable sales entered — GDV is illustrative",
      source: "dealData",
      isIllustrative: true,
    });
  }

  // Floor area missing
  if (!Number(deal?.floorArea)) {
    questions.push({
      question: "Floor area not entered — GDV derived from comps only",
      source: "dealData",
      isIllustrative: true,
    });
  }

  // IMD deprivation — imd is an object { decile, rank, lsoa, ... } not a number
  const imdDecile = Number(deal?.areaIntelligence?.imd?.decile);
  if (imdDecile > 0 && imdDecile <= 3) {
    questions.push({
      question: `Area in IMD decile ${imdDecile}/10 (most deprived) — confirm exit demand and rental demand support strategy`,
      source: "areaIntelligence",
      isIllustrative: false,
    });
  }

  // ICR limits refi loan
  if (icrResult?.limitsRefi) {
    const cap = Math.round(icrResult.maxLoanAtThreshold?.value || 0);
    questions.push({
      question: `ICR caps refinance loan at £${cap.toLocaleString()} — confirm rental income with letting agent`,
      source: "fundingCalculation",
      isIllustrative: false,
    });
  }

  return questions;
}

// ── Brief snapshot ────────────────────────────────────────────────────────────

// Builds the full data payload stored in Firestore.
// PDF is regenerated on demand; we store the input snapshot, not binary.
export function buildBriefSnapshot({ deal, appraisal, icrResult, fundingBrrr, triage, buyBox, buyBoxGate, version }) {
  const rules = resolveRules(buyBox);
  const decision = evaluateDecision({ appraisal, icrResult, fundingBrrr, triage, buyBoxGate, rules, deal });
  const riskRegister = buildRiskRegister(deal);
  const openQuestions = buildOpenQuestions(deal, appraisal, icrResult);

  return {
    id: null, // caller fills with uid() before saving
    dealId: deal.id,
    generatedAt: Date.now(),
    version: version || 1,
    verdict:  decision.verdict,
    reasons:  decision.reasons,

    stats: {
      price:         auditVal(deal.price || 0,                       "dealData",    "Purchase & funding tab",   false, "gbp"),
      gdv:           auditVal(appraisal?.gdv || 0,                   "dealCalc",    "GDV from comps or override", false, "gbp"),
      netProfit:     auditVal(appraisal?.netProfit || 0,             "dealCalc",    "Appraisal engine",          false, "gbp"),
      totalCost:     auditVal(appraisal?.totalCost || 0,             "dealCalc",    "Appraisal engine",          false, "gbp"),
      cashIn:        auditVal(appraisal?.funding?.fundsRequired || 0,"dealCalc",    "Funding calculation",       false, "gbp"),
      profitOnCost:  auditVal(decision.profitOnCost || 0,            "dealCalc",    "netProfit / totalCost",     false, "pct"),
      cashLeftIn:    auditVal(appraisal?.cashLeftIn || 0,            "dealCalc",    "BRRR: cash not recovered",  false, "gbp"),
      timelineMonths:auditVal(appraisal?.timeline?.months || 0,     "dealData",    "Timeline & holding tab",    false, "months"),
    },

    funding: {
      mode:    deal.fundingMode || "bridge",
      icr:     icrResult ? auditVal(icrResult.icr?.value ?? null, "fundingCalculation", "ICR calculation", false, "ratio") : null,
      icrPass: icrResult?.pass ?? null,
    },

    valuation: {
      guidePrice:   auditVal(deal.guidePrice || deal.price || 0, "dealData",  "Property & comps tab",   false, "gbp"),
      maxBid:       auditVal(deal.maxBid || null,                 "dealCalc",  "Max bid solver",          false, "gbp"),
      gdv:          auditVal(appraisal?.gdv || 0,                "dealCalc",  "GDV calculation",         false, "gbp"),
      compsCount:   (deal.comps || []).filter(c => c.price > 0).length,
      compsDateRange: _compDateRange(deal.comps),
    },

    riskRegister,
    openQuestions,

    inputSnapshot: {
      price:          deal.price || 0,
      gdvOverride:    deal.gdvOverride || 0,
      refurbTotal:    appraisal?.funding?.refurb?.total || 0,
      bridgeMonthlyRate: deal.bridgeMonthlyRate || 0,
      fundingMode:    deal.fundingMode || "bridge",
      timelineMonths: appraisal?.timeline?.months || 0,
      rules,
    },
  };
}

function _compDateRange(comps) {
  const dates = (comps || []).filter(c => c.date).map(c => c.date);
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}
