// Appraisal v2 schema migration — pure functions, no Firebase imports.
// RULE 14: additive only — never delete or rename existing v1 fields.
// RULE 7:  null is not zero — unknown costs start as null, not 0.
// RULE 11: all defaults tagged "Illustrative — verify".
// schemaVersion bumped 2 → 3.

// ── JSDoc typedefs ─────────────────────────────────────────────────────────────

/**
 * @typedef {{ key:string, label:string, amount:number|null,
 *   basis:'quote'|'estimate'|'benchmark'|'illustrative', source?:string }} CostLine
 */

/**
 * @typedef {{ type:'bridge'|'btlMortgage'|'privateLoan'|'cash'|'jv',
 *   ltvPct?:number, monthlyRate?:number, termMonths?:number|null,
 *   arrangementPct?:number, exitPct?:number,
 *   interestMode?:'retained'|'serviced'|'rolled',
 *   exitFeeTiming?:'start'|'redemption',
 *   brokerFee?:number|null, valuationFee?:number|null,
 *   lenderLegal?:number|null, admin?:number|null,
 *   extensionRate?:number|null }} FundingSource
 */

/**
 * @typedef {{ mode:'lump'|'detail',
 *   lumpTotal:number|null, lumpBasis:'quote'|'estimate'|'benchmark'|'illustrative',
 *   solicitor:number|null, searches:number|null, survey:number|null,
 *   broker:number|null, valuation:number|null, landReg:number|null,
 *   other:number|null }} DealV2Legal
 */

/**
 * @typedef {{ label:string, low:number|null, high:number|null, amount:number|null }} RefurbItem
 */

/**
 * @typedef {{ mode:'lump'|'detail',
 *   lumpTotal:number|null, lumpBasis:'quote'|'estimate'|'benchmark'|'illustrative',
 *   items:RefurbItem[], scenario:'high'|'mid'|'low',
 *   contingencyPct:number }} DealV2Refurb
 */

/**
 * @typedef {{ mode:'lump'|'detail',
 *   lumpMonthly:number|null,
 *   ctax:number|null, insurance:number|null,
 *   utilities:number|null, other:number|null }} DealV2Holding
 */

/**
 * @typedef {{
 *   valuation: { best:number|null, mid:number|null, worst:number|null,
 *     basis:'worst'|'mid'|'best', comparables:object[], singlePoint:boolean },
 *   costLines: CostLine[],
 *   legal: DealV2Legal,
 *   refurb: DealV2Refurb,
 *   holding: DealV2Holding,
 *   funding: { sources: FundingSource[] },
 *   refinance: { ltv:number|null, lenderRoute:string|null,
 *     refiFees:number|null, acceptedLeftIn:number|null },
 *   rent: { monthly:number|null, evidence:object[] },
 *   profitPct: number|null,
 *   acceptedLeftIn: number|null,
 *   icr: number|null,
 *   minNetMonthly: number|null,
 *   minHeadroomPct: number|null,
 *   reserves: { mgmt:number, maint:number, voids:number }|null,
 *   bridgeInterestMode: 'retained'|'serviced'|'rolled'|null,
 *   results: object|null,
 *   walkaway: object|null,
 *   computedAt: number|null,
 *   engineVersion: number,
 * }} DealV2
 */

// ── Global appraisal defaults ──────────────────────────────────────────────────
// All illustrative — editable per deal or via settings (DECISIONS.md §P01).

export const DEFAULT_APPRAISAL_SETTINGS = {
  profitPctDefault:        0.15,   // flip: target profit as % of GDV — Illustrative
  acceptedLeftInDefault:   0,      // BRRR: £0 = all money out — Illustrative
  icr:                     1.25,   // lender ICR threshold — Illustrative
  icrStressRate:           0.055,  // 5.5% stressed rate (company borrower) — Illustrative
  minNetMonthly:           150,    // minimum net monthly cash flow £ — Illustrative
  minHeadroomPct:          0.05,   // 5% break-even headroom — Illustrative
  reserves: { mgmt: 0.10, maint: 0.08, voids: 0.04 },  // Illustrative
  stress: {
    valuationDrops:  [0.05, 0.10, 0.15],
    lowerLtv:        0.70,
    refurbOverruns:  [0.10, 0.20],
    rentDrops:       [0.05, 0.10],
    voidMonths:      2,
    rateShockPp:     0.02,
    delayMonths:     3,
  },
  viewingTargetPerMonth: 20,       // Illustrative
  privateCapital: { pool: 50000, ratePct: 0.08, termMonths: 12, extensionCapMonths: 3 },
  showV1Comparison: true,          // show v1 appraisal result alongside v2 until Paul retires v1
};

// ── Empty v2 block ─────────────────────────────────────────────────────────────

/** Create a fresh, empty v2 block for a new deal. All costs start null (RULE 7). */
export function emptyV2Block() {
  return {
    valuation: { best: null, mid: null, worst: null, basis: "worst", comparables: [], singlePoint: false },
    costLines: [],
    funding:   { sources: [] },
    refinance: { ltv: null, lenderRoute: null, refiFees: null, acceptedLeftIn: null },
    rent:      { monthly: null, evidence: [] },
    // Per-deal overrides — null means "use global default from settings" (DECISIONS.md §P01)
    profitPct:        null,
    acceptedLeftIn:   null,
    icr:              null,
    minNetMonthly:    null,
    minHeadroomPct:   null,
    reserves:         null,
    bridgeInterestMode: null,  // null → 'retained'; override to 'serviced' per deal
    // Structured cost sub-blocks — lump or detail mode per cost group (Phase A1)
    legal: {
      mode: "lump", lumpTotal: null, lumpBasis: "estimate",
      solicitor: null, searches: null, survey: null,
      broker: null, valuation: null, landReg: null, other: null,
    },
    refurb: {
      mode: "lump", lumpTotal: null, lumpBasis: "estimate",
      items: [], scenario: "high", contingencyPct: 0.15,
    },
    holding: {
      mode: "lump", lumpMonthly: null,
      ctax: null, insurance: null, utilities: null, other: null,
    },
    // Private capital pool allocation for this deal (P04)
    capitalAllocated:       null,   // £ from the private pool
    capitalDeployedAt:      null,   // ISO date string "YYYY-MM-DD"
    capitalExpectedReturnAt: null,  // ISO date string
    capitalReturnedAt:      null,   // ISO date string — set when capital is returned
    // Bridge source toggle: use computed finance cost in engine rather than manual cost line
    useComputedFinance:     false,
    // Cached engine outputs — written by v2 engine, not by user edits
    results:        null,
    walkaway:       null,
    computedAt:     null,
    engineVersion:  1,
  };
}

// ── Pre-fill helpers ───────────────────────────────────────────────────────────

/**
 * Map v1 GDV/comps to a v2 valuation object.
 * Priority: estResaleLow/High (lead promotion) → gdvOverride (single point) → comps.
 * Using low as worst preserves worst-case discipline when a range is known (RULE 9).
 */
function prefillValuation(deal) {
  const low  = Number(deal.estResaleLow)  || 0;
  const high = Number(deal.estResaleHigh) || 0;
  if (low > 0 || high > 0) {
    const eLow  = low  > 0 ? low  : high;
    const eHigh = high > 0 ? high : low;
    return {
      best:        eHigh,
      mid:         Math.round((eLow + eHigh) / 2),
      worst:       eLow,
      basis:       "worst",
      comparables: [],
      singlePoint: eLow === eHigh,
    };
  }
  const gdv = Number(deal.gdvOverride) || 0;
  if (gdv > 0) {
    return { best: gdv, mid: gdv, worst: gdv, basis: "worst", comparables: [], singlePoint: true };
  }
  const validComps = (deal.comps || []).filter((c) => c.price > 0);
  return {
    best: null, mid: null, worst: null,
    basis: "worst",
    comparables: validComps.map((c) => ({
      address: c.address || "",
      price:   c.price,
      date:    c.date   || "",
      type:    deal.propertyType || "",
      source:  "v1 comps",
    })),
    singlePoint: false,
  };
}

/** Map v1 refurb items to v2 CostLines. Zero-both-ends → null (unknown). */
function prefillCostLines(deal) {
  return (deal.refurbItems || [])
    .filter((i) => i.low > 0 || i.high > 0)
    .map((i) => {
      const avg = Math.round((Number(i.low) + Number(i.high)) / 2);
      return {
        key:    i.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40),
        label:  i.name,
        amount: avg > 0 ? avg : null,
        basis:  "estimate",
        source: "v1 refurb items (average of low/high)",
      };
    });
}

/** Return a fresh empty legal cost block (no direct v1 equivalent). */
function prefillLegal(/* deal */) {
  return {
    mode: "lump", lumpTotal: null, lumpBasis: "estimate",
    solicitor: null, searches: null, survey: null,
    broker: null, valuation: null, landReg: null, other: null,
  };
}

/**
 * Map v1 refurbItems to a v2 refurb block.
 * Items with low/high values → detail mode. No items → lump mode.
 */
function prefillRefurb(deal) {
  const src = (deal.refurbItems || []).filter((i) => Number(i.low) > 0 || Number(i.high) > 0);
  if (src.length > 0) {
    return {
      mode: "detail", lumpTotal: null, lumpBasis: "estimate",
      items: src.map((i) => ({
        label:  i.name,
        low:    Number(i.low)  || null,
        high:   Number(i.high) || null,
        amount: null,
      })),
      scenario:       "high",
      contingencyPct: 0.15,
    };
  }
  return {
    mode: "lump", lumpTotal: null, lumpBasis: "estimate",
    items: [], scenario: "high", contingencyPct: 0.15,
  };
}

/** Return a fresh empty holding cost block (no direct v1 equivalent). */
function prefillHolding(/* deal */) {
  return {
    mode: "lump", lumpMonthly: null,
    ctax: null, insurance: null, utilities: null, other: null,
  };
}

/** Map v1 funding mode to a v2 funding source entry. */
function prefillFunding(deal) {
  if (deal.fundingMode === "bridge" || !deal.fundingMode) {
    return {
      sources: [{
        type:           "bridge",
        ltvPct:         Number(deal.bridgeLTV)         || 0.75,
        monthlyRate:    Number(deal.bridgeMonthlyRate)  || 0.0085,
        termMonths:     null,  // v1 derives this from phases; not stored directly
        arrangementPct: Number(deal.arrangementPct)    || 0.02,
        exitPct:        Number(deal.exitPct)            || 0.01,
        interestMode:   deal.interestMode || "retained",
        exitFeeTiming:  "redemption",
      }],
    };
  }
  return { sources: [] };
}

// ── Idempotent migration functions ─────────────────────────────────────────────

/**
 * Add appraisal defaults to a settings document.
 * Idempotent: if settings.appraisal already exists it is not overwritten.
 */
export function migrateV2Settings(settings) {
  if (settings?.appraisal) return settings;
  return { ...settings, appraisal: { ...DEFAULT_APPRAISAL_SETTINGS } };
}

/**
 * Add v2 appraisal fields to a deal document, pre-filling from v1 where unambiguous.
 * v1 → v2: full migration when deal.v2 is absent.
 * v2 → v3: additive upgrade — adds legal/refurb/holding sub-blocks if missing (RULE 14).
 * Never deletes or renames v1 fields.
 */
export function migrateV2Deal(deal) {
  if (!deal?.v2) {
    // v1 → v2: full migration
    const v2 = emptyV2Block();
    v2.valuation = prefillValuation(deal);
    v2.costLines = prefillCostLines(deal);
    v2.funding   = prefillFunding(deal);
    v2.refinance = {
      ltv:            Number(deal.btlLtv) || 0.75,
      lenderRoute:    null,
      refiFees:       null,
      acceptedLeftIn: null,
    };
    v2.rent = {
      monthly:  Number(deal.monthlyRent) > 0 ? Number(deal.monthlyRent) : null,
      evidence: [],
    };
    v2.legal   = prefillLegal(deal);
    v2.refurb  = prefillRefurb(deal);
    v2.holding = prefillHolding(deal);
    return { ...deal, v2 };
  }

  // v2 → v3: add missing sub-blocks (RULE 14: additive only, never overwrites)
  const additions = {};
  if (!deal.v2.legal)   additions.legal   = prefillLegal(deal);
  if (!deal.v2.refurb)  additions.refurb  = prefillRefurb(deal);
  if (!deal.v2.holding) additions.holding = prefillHolding(deal);
  if (Object.keys(additions).length === 0) return deal;
  return { ...deal, v2: { ...deal.v2, ...additions } };
}

/**
 * Summary of what was pre-filled, for the migration log.
 * @param {object[]} deals  Array of migrated deal objects (already have .v2)
 */
export function migrationSummary(deals) {
  let valuation = 0, costLines = 0, rent = 0;
  for (const d of deals) {
    if (d.v2?.valuation?.worst != null || (d.v2?.valuation?.comparables || []).length > 0) valuation++;
    if ((d.v2?.costLines || []).length > 0) costLines++;
    if (d.v2?.rent?.monthly != null) rent++;
  }
  return { total: deals.length, prefilled: { valuation, costLines, rent } };
}
