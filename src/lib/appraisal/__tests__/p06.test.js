// P06 tests — construction-type keyword detection.
// Fixtures: 10 typical MHCLG EPC walls-description strings for Rochdale postcodes.
// Rule 6 & Rule 16: fixtures stay in tests, never shipped in the production bundle.

import { describe, it, expect } from "vitest";
import { isLikelyNonStandard, NON_STANDARD_KEYWORDS } from "../construction.js";

// ── Typical EPC walls-description strings (Rochdale / Greater Manchester) ─────
// Source: live EPC register — confirmed field name: walls-description (kebab-case in API JSON).
const STANDARD = [
  "Cavity wall, as built, no insulation (assumed)",
  "Cavity wall, as built, partial insulation (assumed)",
  "Cavity wall, with internal insulation (assumed)",
  "Solid brick, as built, no insulation (assumed)",
  "Sandstone or limestone, as built, no insulation (assumed)",
  "Cavity wall, filled cavity (assumed)",
];
const NON_STANDARD = [
  "System built, as built, no insulation (assumed)",
  "Timber frame, as built, no insulation (assumed)",
  "Granite or whinstone, as built, no insulation (assumed)",
  "Park home, as built, no insulation (assumed)",
];

describe("isLikelyNonStandard — standard constructions", () => {
  for (const desc of STANDARD) {
    it(`returns false for: "${desc}"`, () => {
      expect(isLikelyNonStandard(desc)).toBe(false);
    });
  }
});

describe("isLikelyNonStandard — non-standard constructions", () => {
  for (const desc of NON_STANDARD) {
    it(`returns true for: "${desc}"`, () => {
      expect(isLikelyNonStandard(desc)).toBe(true);
    });
  }
});

describe("isLikelyNonStandard — edge cases", () => {
  it("returns false for null", () => {
    expect(isLikelyNonStandard(null)).toBe(false);
  });
  it("returns false for undefined", () => {
    expect(isLikelyNonStandard(undefined)).toBe(false);
  });
  it("returns false for empty string", () => {
    expect(isLikelyNonStandard("")).toBe(false);
  });
  it("is case-insensitive — upper-case TIMBER FRAME matches", () => {
    expect(isLikelyNonStandard("TIMBER FRAME, as built, no insulation (assumed)")).toBe(true);
  });
  it("does not flag 'cavity' as non-standard", () => {
    expect(isLikelyNonStandard("Cavity wall")).toBe(false);
  });
  it("exports NON_STANDARD_KEYWORDS as a non-empty array", () => {
    expect(Array.isArray(NON_STANDARD_KEYWORDS)).toBe(true);
    expect(NON_STANDARD_KEYWORDS.length).toBeGreaterThan(0);
  });
});
