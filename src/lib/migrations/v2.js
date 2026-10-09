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
 *   exitFeeTiming?:'start'|'redemption' }} FundingSource
 */

/**
 * @typedef {{
 *   valuation: { best:number|null, mid:number|null, worst:number|null,
 *     basis:'worst'|'mid'|'best', comparables:object[], singlePoint:boolean },
 *   costLines: CostLine[],
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
    // Cached engine outputs — written by v2 engine, not by user edits
    results:        null,
    walkaway:       null,
    computedAt:     null,
    engineVersion:  1,
  };
}

// ── Pre-fill helpers ───────────────────────────────────────────────────────────

/** Map v1 GDV/comps to a v2 valuation object. Single GDV → singlePoint:true. */
function prefillValuation(deal) {
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
 * Idempotent: if deal.v2 already exists it is returned unchanged.
 * Never deletes or renames v1 fields.
 */
export function migrateV2Deal(deal) {
  if (deal?.v2) return deal;

  const v2 = emptyV2Block();
  v2.valuation = prefillValuation(deal);
  v2.costLines = prefillCostLines(deal);
  v2.funding   = prefillFunding(deal);
  v2.refinance = {
    ltv:          Number(deal.btlLtv)      || 0.75,
    lenderRoute:  null,
    refiFees:     null,
    acceptedLeftIn: null,
  };
  v2.rent = {
    monthly:  Number(deal.monthlyRent) > 0 ? Number(deal.monthlyRent) : null,
    evidence: [],
  };

  return { ...deal, v2 };
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
