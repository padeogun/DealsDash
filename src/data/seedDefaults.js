// SEED DATA — illustrative placeholders only. Runs once per user if no buy boxes
// exist. After seeding, all values are stored in Firestore and edited in the app.
// Never read these literals anywhere else; they exist only for the initial seed.

import { getDocs } from "firebase/firestore";
import * as repo from "./repo.js";

function a(value, unit, sourceHint) {
  return { value, unit, source: `Placeholder — ${sourceHint}`, lastVerified: null, isIllustrative: true };
}

function buildSeedAssumptions(legacyProfile, legacyThresholds) {
  const p = legacyProfile || {};
  const t = legacyThresholds || {};
  return {
    // Acquisition fees
    legalFeesBuy:          a(1400,   "£",        "confirm with conveyancer"),
    searchesFee:           a(350,    "£",        "confirm with conveyancer"),
    surveyFee:             a(600,    "£",        "confirm with surveyor"),
    brokerFee:             a(1200,   "£",        "confirm with broker"),
    valuationFee:          a(450,    "£",        "confirm with lender"),
    landRegFee:            a(270,    "£",        "confirm with conveyancer"),
    // Bridging
    bridgeLtvPct:          a(0.70,   "%",        "confirm with broker"),
    bridgeMonthlyRatePct:  a(0.0085, "%/month",  "confirm with broker"),
    bridgeArrangementPct:  a(0.02,   "%",        "confirm with broker"),
    bridgeExitPct:         a(0.01,   "%",        "confirm with broker"),
    bridgeTermMonths:      a(12,     "months",   "confirm with broker"),
    // Refurb
    refurbContingencyPct:  a(p.contingencyPct ?? 0.10, "%",   "confirm with builder / mentor"),
    worksMonths:           a(3,      "months",   "based on typical deal type"),
    marketingMonths:       a(3,      "months",   "based on local market conditions"),
    // Selling
    eaPct:                 a(0.012,  "%",        "confirm with estate agent"),
    legalFeesSell:         a(900,    "£",        "confirm with conveyancer"),
    epcCost:               a(120,    "£",        "confirm with EPC assessor"),
    // BTL / BRRR
    voidPct:               a(0.05,   "%",        "confirm with letting agent"),
    managementPct:         a(0.10,   "%",        "confirm with letting agent"),
    maintenancePct:        a(0.08,   "%",        "confirm with experience"),
    llInsuranceAnnual:     a(250,    "£/yr",     "confirm with insurance broker"),
    refiLtvPct:            a(0.75,   "%",        "confirm with broker"),
    mortgageRatePct:       a(0.065,  "%",        "confirm with broker"),
    mortgageProductFeePct: a(0.01,   "%",        "confirm with broker"),
    // ICR placeholders — no calculation wired yet; mark verified when you have real numbers
    icrStressRatePct:      a(0.055,  "%",        "confirm with broker (ltd co stress rate)"),
    icrThresholdPct:       a(1.25,   "ratio",    "confirm with broker (125% ICR threshold)"),
    // Decision thresholds (from legacy settings if present, else seed)
    targetProfitMinGBP:    a(t.minNetProfit   ?? 25000, "£",     "set to your minimum acceptable profit"),
    targetProfitOnCostPct: a(p.minProfitPctOfGDV ?? 0.15, "%",   "min profit as % of GDV"),
    targetNetYieldPct:     a(p.targetYieldPct ?? 0.07, "%",      "min net yield for BRRR holds"),
    minRoi:                a(t.minRoi         ?? 0.20, "%",      "min ROI on own cash"),
    minAnnualRoi:          a(t.minAnnualRoi   ?? 0.25, "%",      "min annualised ROI"),
    minRiskScore:          a(t.minRiskScore   ?? 3.0, "score",   "min area risk score (1–5)"),
    maxMoneyLeftInGBP:     a(0,      "£",        "max cash left in deal after refinance (0 = no limit)"),
  };
}

function buildSeedFilters(legacyProfile) {
  const p = legacyProfile || {};
  return {
    postcodeAreas:    p.postcodeAreas    || ["OL", "M", "SK", "HD", "HX"],
    postcodeDistricts:p.postcodeDistricts|| [],
    propertyTypes:    p.assetTypes       || ["Terrace", "Semi"],
    tenure:           p.tenure           || ["freehold"],
    conditionPref:    p.conditionPref    || "needs_work",
    priceMin:         0,
    priceMax:         p.maxGuide         || 150000,
    bedroomsMin:      2,
    leaseYearsMin:    90,
    epcMin:           null,
    excludeArticle4:  false,
    maxFloodZone:     1,
  };
}

export async function seedDefaultBuyBoxIfNeeded(db, uid, legacySettings) {
  const existing = await getDocs(repo.buyBoxesColRef(db, uid));
  if (!existing.empty) return;

  const p = (legacySettings || {}).strategyProfile || null;
  const t = (legacySettings || {}).thresholds || null;

  const box = {
    id: (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : "bb-" + Date.now(),
    name:       "Default buy box",
    strategy:   "hybrid",
    isDefault:  true,
    filters:    buildSeedFilters(p),
    assumptions:buildSeedAssumptions(p, t),
    updatedAt:  Date.now(),
  };

  await repo.saveBuyBox(db, uid, box);
}
