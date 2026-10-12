// P07 tests — sourcing funnel maths and standing-offer sort.
// Golden case from P07 spec: 25 viewings, 6 offers, 1 accepted → 24% / 17%.

import { describe, it, expect } from "vitest";
import {
  calcFunnelMonth,
  calcFunnelRolling,
  sortStandingOffers,
  calcPaceIndicator,
  isFollowUpDue,
} from "../funnel.js";

// ── Fixture helpers ─────────────────────────────────────────────────────────

function viewing(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    date: "2026-10-01",
    type: "in_person",
    agentId: "",
    offerMade: false,
    offerAmount: null,
    outcome: "none",
    followUpDate: "",
    notes: "",
    ...overrides,
  };
}

function lead(viewings = []) {
  return { id: Math.random().toString(36).slice(2), viewings };
}

// ── calcFunnelMonth — golden case ───────────────────────────────────────────

describe("calcFunnelMonth — golden case (spec: 25 viewings, 6 offers, 1 accepted)", () => {
  const leads = [
    lead([
      ...Array(19).fill(null).map(() => viewing({ date: "2026-10-05" })),
      ...Array(5).fill(null).map(() => viewing({ date: "2026-10-10", offerMade: true })),
      viewing({ date: "2026-10-15", offerMade: true, outcome: "accepted" }),
    ]),
  ];

  const result = calcFunnelMonth(leads, "2026-10");

  it("counts 25 viewings", () => expect(result.viewings).toBe(25));
  it("counts 6 offers", () => expect(result.offers).toBe(6));
  it("counts 1 accepted", () => expect(result.accepted).toBe(1));
  it("offerRate is 0.24 (24%)", () => expect(result.offerRate).toBe(0.24));
  it("acceptRate rounds to 0.17 (17%)", () => expect(result.acceptRate).toBe(0.17));
});

describe("calcFunnelMonth — empty leads", () => {
  it("returns zeros with no leads", () => {
    const r = calcFunnelMonth([], "2026-10");
    expect(r.viewings).toBe(0);
    expect(r.offerRate).toBe(0);
    expect(r.acceptRate).toBe(0);
  });
  it("returns zeros when no viewings match the month", () => {
    const r = calcFunnelMonth([lead([viewing({ date: "2025-01-01" })])], "2026-10");
    expect(r.viewings).toBe(0);
  });
});

// ── sortStandingOffers ───────────────────────────────────────────────────────

describe("sortStandingOffers", () => {
  const l1 = lead([viewing({ outcome: "standing", followUpDate: "2026-11-10" })]);
  const l2 = lead([viewing({ outcome: "standing", followUpDate: "2026-10-25" })]);
  const l3 = lead([viewing({ outcome: "none" }), viewing({ outcome: "standing", followUpDate: "2026-12-01" })]);
  const l4 = lead([viewing({ outcome: "rejected" })]);

  const sorted = sortStandingOffers([l1, l2, l3, l4]);

  it("excludes non-standing viewings", () => expect(sorted.length).toBe(3));
  it("sorts by followUpDate ascending — earliest first", () => {
    expect(sorted[0].viewing.followUpDate).toBe("2026-10-25");
    expect(sorted[1].viewing.followUpDate).toBe("2026-11-10");
    expect(sorted[2].viewing.followUpDate).toBe("2026-12-01");
  });
  it("each item carries the parent lead", () => {
    expect(sorted[0].lead).toBe(l2);
  });
  it("returns empty array when no standing offers", () => {
    expect(sortStandingOffers([l4])).toEqual([]);
  });
  it("puts no-date entries last", () => {
    const withNoDate = lead([viewing({ outcome: "standing", followUpDate: "" })]);
    const out = sortStandingOffers([withNoDate, l2]);
    expect(out[0].lead).toBe(l2);
  });
});

// ── isFollowUpDue ────────────────────────────────────────────────────────────

describe("isFollowUpDue", () => {
  it("returns true for a past date", () =>
    expect(isFollowUpDue(viewing({ followUpDate: "2020-01-01" }))).toBe(true));
  it("returns false for a future date", () =>
    expect(isFollowUpDue(viewing({ followUpDate: "2099-01-01" }))).toBe(false));
  it("returns false for empty string", () =>
    expect(isFollowUpDue(viewing({ followUpDate: "" }))).toBe(false));
});

// ── calcPaceIndicator ────────────────────────────────────────────────────────

describe("calcPaceIndicator", () => {
  it("returns null for 0 months", () =>
    expect(calcPaceIndicator([], 0)).toBeNull());
  it("projects 4 deals/year from 1 accepted in 3 months", () => {
    const leads = [lead([viewing({ date: "2026-10-01", outcome: "accepted", offerMade: true })])];
    // 1 accepted / 3 months * 12 = 4
    expect(calcPaceIndicator(leads, 3).perYear).toBe(4);
  });
});
