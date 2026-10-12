// P06 — Construction-type keyword detection from EPC walls-description.
// Source: training (Bootle/Norton Street case study) + MHCLG EPC API typical descriptions.
// isLikelyNonStandard() is a SUGGESTION only — Paul must confirm each property manually.
// RULE 11: keyword list is illustrative; non-standard construction lowers lender appetite.

export const NON_STANDARD_KEYWORDS = [
  "system built",
  "timber frame",
  "park home",
  "cob",
  "granite or whinstone", // treat as review — may affect mortgage availability
  "prefab",
];

/**
 * Returns true if the EPC walls-description matches a known non-standard construction indicator.
 * Returns false for null/empty (can't tell → not flagged).
 * @param {string|null|undefined} wallsDescription
 */
export function isLikelyNonStandard(wallsDescription) {
  if (!wallsDescription) return false;
  const lower = wallsDescription.toLowerCase();
  return NON_STANDARD_KEYWORDS.some((kw) => lower.includes(kw));
}
