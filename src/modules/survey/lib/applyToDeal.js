import { priceSurvey } from "./costing.js";
import { BENCHMARK_HIGH_FACTOR } from "../data/rates.js";
import { SQFT_PER_M2, TYPE_TO_DEAL } from "./prefill.js";

/* Translate a priced survey into the DealsDash deal fields the appraisal engine reads.
   Returns a partial deal — merge with the existing deal, do not replace.
   Units follow DealsDash: contingencyPct is a fraction, floorArea is sq ft, condition is 1 (derelict) – 5 (habitable). */
export function surveyToDealPatch(survey, rates) {
  const { lines, total } = priceSurvey(survey.property, survey.answers, rates);
  const refurbItems = lines.map((l) => ({
    name: `${l.label} — ${l.action}`,
    low: l.cost,
    high: l.quoted ? l.cost : Math.round(l.cost * BENCHMARK_HIGH_FACTOR),
    surveyItemId: l.id, quoted: l.quoted, confirmed: l.confirmed,
  }));
  const heavy = lines.filter((l) => /full|replace|all|recover|inject|dryrot|tank/.test(l.actionId)).length;
  const structural = lines.some((l) => ["cracks", "timber", "floors"].includes(l.id) && l.actionId !== "monitor");
  const condition = total === 0 ? 5 : structural && heavy >= 4 ? 1 : heavy >= 5 ? 2 : heavy >= 2 ? 3 : 4;
  const patch = {
    refurbItems,
    contingencyPct: (+survey.contingencyPct || 10) / 100,
    condition,
    propertyType: TYPE_TO_DEAL[survey.property.type] || undefined,
    surveyApplied: { at: Date.now(), total, lines: lines.length, unconfirmed: lines.filter((l) => !l.confirmed).length, needsEpc: lines.some((l) => l.id === "finish") },
    surveyCompliance: survey.compliance || {},
  };
  if (+survey.property.beds) patch.bedrooms = +survey.property.beds;
  if (+survey.property.area) patch.floorArea = Math.round(+survey.property.area * SQFT_PER_M2);
  return patch;
}

/* Keep manually entered trade lines (non-zero, not survey-originated, not the lead placeholder);
   replace everything the survey owns. */
export function mergeRefurbItems(existing = [], fromSurvey = []) {
  const manual = existing.filter((i) => !i.surveyItemId && (Number(i.low) > 0 || Number(i.high) > 0) && !/from lead/i.test(i.name || ""));
  return [...manual, ...fromSurvey];
}
