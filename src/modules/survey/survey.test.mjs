/* Run: node src/modules/survey/survey.test.mjs   (no framework needed) */
import assert from "node:assert/strict";
import { priceSurvey } from "./lib/costing.js";
import { prefillFromDeal } from "./lib/prefill.js";
import { surveyToDealPatch, mergeRefurbItems } from "./lib/applyToDeal.js";
import { defaultRates, BENCHMARK_HIGH_FACTOR } from "./data/rates.js";
import { CHECKLIST } from "./data/checklist.js";

const rates = defaultRates();
const prop = { type: "terraced", age: "pre1919", area: 80, storeys: 2, beds: 2, baths: 1, kitchenSize: 9, windows: 8 };
let n = 0; const t = (name, fn) => { fn(); n++; console.log("✓", name); };

t("every checklist action prices to a finite non-negative number", () => {
  for (const s of CHECKLIST) for (const it of s.items) for (const a of it.actions) {
    const { lines } = priceSurvey(prop, { [it.id]: { action: a.id, qty: 2 } }, rates);
    if (a.id !== "none") { assert.equal(lines.length, 1); assert.ok(Number.isFinite(lines[0].cost) && lines[0].cost >= 0, `${it.id}/${a.id}`); }
    else assert.equal(lines.length, 0);
  }
});
t("full rewire scales with bedrooms", () => {
  const two = priceSurvey(prop, { electrics: { action: "full" } }, rates).total;
  const four = priceSurvey({ ...prop, beds: 4 }, { electrics: { action: "full" } }, rates).total;
  assert.equal(four - two, 2 * rates.rewire_bed);
});
t("quote overrides benchmark and is flagged", () => {
  const { lines, total } = priceSurvey(prop, { kitchen: { action: "replace", override: "5000" } }, rates);
  assert.equal(total, 5000); assert.equal(lines[0].quoted, true); assert.equal(lines[0].calc, rates.kitchen_m);
});
t("unconfirmed prefilled items count in total but are reported", () => {
  const r = priceSurvey(prop, { windows: { action: "all", confirmed: false, source: "epc" } }, rates);
  assert.equal(r.unconfirmed, 1); assert.equal(r.total, rates.window * 8);
});
t("prefill maps DealsDash deal, epcCheck, area intelligence and legal pack flags", () => {
  const s = prefillFromDeal({ address: "12 Example Street", town: "Rochdale", postcode: "OL16 1AA", propertyType: "Terrace", bedrooms: 3, floorArea: 861, listingType: "auction",
    epcCheck: { properties: [{ address: "12, EXAMPLE STREET, ROCHDALE", band: "F", "windows-description": "Single glazed", "construction-age-band": "England and Wales: before 1900" }, { address: "14, EXAMPLE STREET", band: "D" }] },
    areaIntelligence: { flood: { areaCount: 2, areas: [] } },
    legalPackDocuments: [{ review: { tenureSummary: "Leasehold, 84 years remaining", flags: [{ urgency: "Raise with solicitor before bidding", category: "Occupation", summary: "Property let on an AST" }, { urgency: "Informational", category: "Environmental", summary: "Japanese knotweed noted in seller's answers" }] } }] });
  assert.equal(s.property.type, "terraced"); assert.equal(s.property.area, 80); assert.equal(s.property.age, "pre1919"); assert.equal(s.route, "auction");
  assert.equal(s.answers.windows.action, "all"); assert.equal(s.answers.windows.confirmed, false);
  assert.equal(s.answers.vegetation.action, "knotweed"); assert.equal(s.compliance.epc, "no"); assert.equal(s.compliance.flood, "verify");
  assert.equal(s.compliance.tenants, "verify"); assert.equal(s.compliance.title, "verify"); assert.equal(s.compliance.legalpack, "yes");
  assert.ok(s.verify.some((v) => v.includes("AST"))); assert.equal(s.contingencyPct, 15);
});
t("prefill on an empty deal yields safe defaults", () => {
  const s = prefillFromDeal({}); assert.equal(s.property.area, 80); assert.deepEqual(s.verify, []);
});
t("apply-to-deal writes DealsDash units and preserves quoted lines", () => {
  const survey = { ...prefillFromDeal({}), property: { ...prefillFromDeal({}).property, area: 80, beds: 3 }, answers: { kitchen: { action: "replace" }, bathrooms: { action: "replace", override: "4000" } }, contingencyPct: 12 };
  const p = surveyToDealPatch(survey, rates);
  assert.equal(p.refurbItems.length, 2); assert.equal(p.contingencyPct, 0.12); assert.equal(p.floorArea, 861); assert.equal(p.bedrooms, 3); assert.equal(p.propertyType, "Terrace");
  const k = p.refurbItems.find((x) => x.surveyItemId === "kitchen"); assert.equal(k.low, rates.kitchen_m); assert.equal(k.high, Math.round(rates.kitchen_m * BENCHMARK_HIGH_FACTOR));
  const b = p.refurbItems.find((x) => x.surveyItemId === "bathrooms"); assert.equal(b.low, 4000); assert.equal(b.high, 4000); assert.equal(b.quoted, true);
  assert.equal(p.condition, 3); assert.equal(p.surveyApplied.total, rates.kitchen_m + 4000);
});
t("merge keeps manual trades, drops zero rows, lead placeholder and old survey lines", () => {
  const existing = [{ name: "Kitchen", low: 0, high: 0 }, { name: "Scaffolding", low: 800, high: 1000 }, { name: "Estimated refurb (from lead — replace with trade-by-trade)", low: 20000, high: 20000 }, { name: "old", low: 1, high: 1, surveyItemId: "roof" }];
  const merged = mergeRefurbItems(existing, [{ name: "Roof — Full re-cover", low: 5000, high: 6000, surveyItemId: "roof" }]);
  assert.deepEqual(merged.map((i) => i.name), ["Scaffolding", "Roof — Full re-cover"]);
});
console.log(`\n${n} tests passed`);
