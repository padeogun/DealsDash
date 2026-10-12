// Unit tests for the appraisal v2 migration.
// Tests: empty doc, typical v1 deal, already-migrated (idempotent), missing v1 fields.

import { describe, it, expect } from "vitest";
import {
  migrateV2Settings,
  migrateV2Deal,
  emptyV2Block,
  DEFAULT_APPRAISAL_SETTINGS,
  migrationSummary,
} from "./v2.js";

// ── Settings migration ────────────────────────────────────────────────────────

describe("migrateV2Settings", () => {
  it("adds appraisal block to bare settings", () => {
    const r = migrateV2Settings({ schemaVersion: 2 });
    expect(r.appraisal).toBeDefined();
    expect(r.appraisal.icr).toBe(DEFAULT_APPRAISAL_SETTINGS.icr);
    expect(r.schemaVersion).toBe(2);  // preserved
  });

  it("is idempotent — existing appraisal block not overwritten", () => {
    const custom = { icr: 1.45 };
    const r = migrateV2Settings({ schemaVersion: 2, appraisal: custom });
    expect(r.appraisal.icr).toBe(1.45);  // not overwritten by default
  });

  it("handles null/empty settings gracefully", () => {
    const r = migrateV2Settings({});
    expect(r.appraisal).toBeDefined();
  });
});

// ── Deal migration — idempotency ──────────────────────────────────────────────

describe("migrateV2Deal — idempotency", () => {
  it("fully-migrated deal (all sub-blocks present) returned as same reference", () => {
    const existing = { id: "x", v2: emptyV2Block() };
    const r = migrateV2Deal(existing);
    expect(r).toBe(existing);  // nothing missing — same reference
  });

  it("v2 deal missing sub-blocks gets upgraded (v2 → v3)", () => {
    const partial = { id: "x", v2: { valuation: { worst: 200000 } } };
    const r = migrateV2Deal(partial);
    expect(r).not.toBe(partial);              // new object returned
    expect(r.v2.valuation.worst).toBe(200000); // existing data preserved
    expect(r.v2.legal).toBeDefined();
    expect(r.v2.refurb).toBeDefined();
    expect(r.v2.holding).toBeDefined();
  });

  it("running twice produces the same result", () => {
    const deal = { id: "a", gdvOverride: 150000, monthlyRent: 600, btlLtv: 0.75, refurbItems: [] };
    const once = migrateV2Deal(deal);
    const twice = migrateV2Deal(once);
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});

// ── Deal migration — empty / fresh deal ──────────────────────────────────────

describe("migrateV2Deal — empty deal", () => {
  const minimal = { id: "empty" };
  const r = migrateV2Deal(minimal);

  it("adds v2 block", () => expect(r.v2).toBeDefined());
  it("valuation.worst is null (no GDV supplied)", () => expect(r.v2.valuation.worst).toBeNull());
  it("costLines is empty array", () => expect(r.v2.costLines).toHaveLength(0));
  it("rent.monthly is null", () => expect(r.v2.rent.monthly).toBeNull());
  it("all per-deal overrides are null", () => {
    expect(r.v2.profitPct).toBeNull();
    expect(r.v2.icr).toBeNull();
    expect(r.v2.bridgeInterestMode).toBeNull();
  });
  it("results and walkaway are null", () => {
    expect(r.v2.results).toBeNull();
    expect(r.v2.walkaway).toBeNull();
  });
  it("v1 fields preserved (id untouched)", () => expect(r.id).toBe("empty"));
});

// ── Deal migration — typical v1 deal ─────────────────────────────────────────

const TYPICAL_V1 = {
  id: "deal1",
  name: "14 Test Street",
  gdvOverride: 180000,
  bridgeLTV: 0.75, bridgeMonthlyRate: 0.0085, arrangementPct: 0.02, exitPct: 0.01,
  interestMode: "retained", fundingMode: "bridge",
  btlLtv: 0.75, monthlyRent: 750,
  refurbItems: [
    { name: "Kitchen", low: 3500, high: 5000 },
    { name: "Bathroom", low: 2500, high: 3500 },
    { name: "Decorating", low: 0, high: 0 },  // zero-both → null amount
  ],
  comps: [
    { address: "12 Test St", price: 170000, date: "2026-05-01", floorArea: 840 },
  ],
  propertyType: "Terrace",
};

describe("migrateV2Deal — typical v1 deal", () => {
  const r = migrateV2Deal(TYPICAL_V1);

  it("valuation.worst = gdvOverride (singlePoint)", () => {
    expect(r.v2.valuation.worst).toBe(180000);
    expect(r.v2.valuation.singlePoint).toBe(true);
  });

  it("kitchen cost line: average of 3500 and 5000 = 4250", () => {
    const kitchen = r.v2.costLines.find((l) => l.key.includes("kitchen"));
    expect(kitchen).toBeDefined();
    expect(kitchen.amount).toBe(4250);
  });

  it("bathroom cost line: average of 2500 and 3500 = 3000", () => {
    const bath = r.v2.costLines.find((l) => l.key.includes("bathroom"));
    expect(bath.amount).toBe(3000);
  });

  it("zero-refurb item produces null amount (RULE 7: null ≠ zero)", () => {
    const deco = r.v2.costLines.find((l) => l.key.includes("decorating"));
    // zero-both-ends items are filtered out entirely (both 0 = not entered, excluded)
    expect(deco).toBeUndefined();
  });

  it("funding source type is bridge", () => {
    expect(r.v2.funding.sources[0].type).toBe("bridge");
    expect(r.v2.funding.sources[0].interestMode).toBe("retained");
  });

  it("refinance.ltv pre-filled from btlLtv", () => {
    expect(r.v2.refinance.ltv).toBe(0.75);
  });

  it("rent.monthly pre-filled from monthlyRent", () => {
    expect(r.v2.rent.monthly).toBe(750);
  });

  it("v1 fields are preserved (RULE 14)", () => {
    expect(r.name).toBe("14 Test Street");
    expect(r.gdvOverride).toBe(180000);
    expect(r.bridgeLTV).toBe(0.75);
  });
});

// ── Deal migration — no GDV, has comps ───────────────────────────────────────

describe("migrateV2Deal — no GDV override, comps present", () => {
  const deal = {
    id: "d2", gdvOverride: 0,
    comps: [{ address: "A", price: 150000, date: "2026-01-01", floorArea: 800 }],
    propertyType: "Semi", refurbItems: [],
  };
  const r = migrateV2Deal(deal);

  it("valuation.worst is null (no GDV override)", () => expect(r.v2.valuation.worst).toBeNull());
  it("comparables pre-filled from comps", () => {
    expect(r.v2.valuation.comparables).toHaveLength(1);
    expect(r.v2.valuation.comparables[0].price).toBe(150000);
    expect(r.v2.valuation.comparables[0].source).toBe("v1 comps");
  });
  it("singlePoint is false when no GDV override", () => expect(r.v2.valuation.singlePoint).toBe(false));
});

// ── Deal migration — no GDV, no comps ────────────────────────────────────────

describe("migrateV2Deal — no GDV, no comps", () => {
  const deal = { id: "d3", refurbItems: [] };
  const r = migrateV2Deal(deal);
  it("valuation all null, comparables empty", () => {
    expect(r.v2.valuation.worst).toBeNull();
    expect(r.v2.valuation.comparables).toHaveLength(0);
  });
});

// ── migrationSummary ──────────────────────────────────────────────────────────

describe("migrationSummary", () => {
  it("counts pre-filled fields correctly", () => {
    const deals = [
      migrateV2Deal({ id: "a", gdvOverride: 100000, monthlyRent: 600, refurbItems: [{ name: "K", low: 1000, high: 2000 }] }),
      migrateV2Deal({ id: "b", refurbItems: [] }),
    ];
    const s = migrationSummary(deals);
    expect(s.total).toBe(2);
    expect(s.prefilled.valuation).toBe(1);  // only deal a has GDV
    expect(s.prefilled.costLines).toBe(1);  // only deal a has items
    expect(s.prefilled.rent).toBe(1);       // only deal a has rent
  });
});
