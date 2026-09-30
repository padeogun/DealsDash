/* Build the initial survey for a deal from data DealsDash already holds.
   Every pre-filled answer carries confirmed:false and a source, so the site
   walkthrough still requires a tap on each one. Nothing here is authoritative.

   Reads from the DealsDash deal (all optional):
     address, town, postcode, propertyType ("Terrace"|"Semi"|"Detached"|"Flat"), bedrooms,
     floorArea (SQ FT — DealsDash convention), price, listingType ("auction"|"agent"|…)
     epcCheck { postcode, properties:[{ address, band, registrationDate, ...optional descriptive fields }] }
     areaIntelligence { flood:{ areaCount, areas }, crime, adminDistrict }
     legalPackDocuments[].review { tenureSummary, flags:[{ urgency, category, summary }], unreadableSections } */

export const SQFT_PER_M2 = 10.7639;
const TYPE_TO_SURVEY = { terrace: "terraced", semi: "semi", detached: "detached", flat: "flat" };
export const TYPE_TO_DEAL = { terraced: "Terrace", endTerrace: "Terrace", semi: "Semi", detached: "Detached", flat: "Flat" };

function ageBandFromEpc(s = "") {
  s = String(s).toLowerCase();
  if (/before 1900|1900-1929/.test(s)) return "pre1919";
  if (/1930-1949/.test(s)) return "1919_44";
  if (/1950-1966|1967-1975/.test(s)) return "1945_64";
  if (/1976-1982/.test(s)) return "1965_80";
  if (/198\d|199\d|20\d\d/.test(s)) return "post1980";
  return null;
}
// "12 Example Street" vs "12, EXAMPLE STREET, ROCHDALE" → match on house number + first street token
function sameAddress(a = "", b = "") {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const A = norm(a), B = norm(b);
  if (!A.length || !B.length) return false;
  return A[0] === B[0] && A.slice(1).some((t) => t.length > 2 && B.includes(t));
}
const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== "") return o[k]; return undefined; };

export function prefillFromDeal(deal = {}) {
  const epcProps = deal.epcCheck?.properties || [];
  const e = epcProps.find((p) => sameAddress(deal.address, p.address)) || (epcProps.length === 1 ? epcProps[0] : {}) || {};
  const areaSqFt = +deal.floorArea || 0;
  const epcArea = +pick(e, "totalFloorArea", "total-floor-area") || 0;
  const property = {
    address: [deal.address, deal.town, deal.postcode].filter(Boolean).join(", "),
    type: TYPE_TO_SURVEY[String(deal.propertyType || "").toLowerCase()] || "terraced",
    age: ageBandFromEpc(pick(e, "constructionAgeBand", "construction-age-band")) || "pre1919",
    area: Math.round(epcArea || (areaSqFt ? areaSqFt / SQFT_PER_M2 : 80)),
    storeys: deal.propertyType === "Flat" ? 1 : 2, beds: +deal.bedrooms || 2, baths: 1, receptions: 1, kitchenSize: 9, windows: 8, frontage: "",
  };
  const answers = {}; const compliance = {}; const verify = [];
  const exp = (id, action, source, why) => { answers[id] = { action, confirmed: false, source, note: why }; };

  // EPC-derived expected states — only when the certificate carries the descriptive fields
  const walls = String(pick(e, "wallsDescription", "walls-description") || "").toLowerCase();
  if (walls.includes("cavity") && walls.includes("no insulation")) exp("cwi", "fill", "epc", "EPC: cavity walls, no insulation");
  const roof = String(pick(e, "roofDescription", "roof-description") || "").toLowerCase();
  if (roof && /no insulation|\b(0|25|50|75|100|150)\s?mm/.test(roof)) exp("loft", "insulate", "epc", "EPC: " + roof);
  const win = String(pick(e, "windowsDescription", "windows-description") || "").toLowerCase();
  if (win.includes("single")) exp("windows", "all", "epc", "EPC: single glazing");
  const heat = String(pick(e, "mainheatDescription", "mainheat-description") || "").toLowerCase();
  if (/no system|room heaters|electric storage|back boiler/.test(heat)) exp("boiler", "full", "epc", "EPC: " + heat);
  if (property.age === "pre1919") exp("alarms", "install", "desk", "Older stock — assume alarms absent or non-compliant");
  const band = String(pick(e, "band", "currentEnergyRating", "current-energy-rating") || "").toUpperCase();
  if (band) { compliance.epc = "ABCDE".includes(band) ? "yes" : "no"; if (!"ABCDE".includes(band)) verify.push(`EPC band ${band} — works must lift to E minimum (C preferred)`); }

  // Area Intelligence
  const flood = deal.areaIntelligence?.flood;
  if (flood && !flood.error) { compliance.flood = (flood.areaCount || 0) > 0 ? "verify" : "yes"; if ((flood.areaCount || 0) > 0) verify.push(`${flood.areaCount} flood risk area(s) within 3 km — check the Environment Agency long-term map for the exact address`); }

  // Legal Pack Review flags → compliance + verify list
  const reviews = (deal.legalPackDocuments || []).map((d) => d.review).filter(Boolean);
  for (const r of reviews) {
    if (r.tenureSummary && /leasehold/i.test(r.tenureSummary)) { compliance.title = "verify"; verify.push("Tenure: " + r.tenureSummary); }
    for (const f of r.flags || []) {
      const text = `${f.category || ""} ${f.summary || ""}`;
      const low = text.toLowerCase();
      const urgent = f.urgency === "Raise with solicitor before bidding";
      if (/tenan|occup|vacant|possession|ast|sitting/.test(low)) compliance.tenants = "verify";
      if (/title|covenant|easement|right of way|flying freehold|boundar|charge|restriction/.test(low)) compliance.title = "verify";
      if (/planning|building reg|completion cert|enforcement|extension|loft conversion/.test(low)) { compliance.buildregs = "verify"; compliance.planning = "verify"; }
      if (/fensa|window/.test(low)) compliance.fensa = "verify";
      if (/electric|eicr/.test(low)) compliance.eicr = "verify";
      if (/gas/.test(low)) compliance.gas = "verify";
      if (/knotweed/.test(low)) exp("vegetation", "knotweed", "legalpack", "Legal pack: knotweed mentioned");
      if (/asbestos/.test(low)) exp("ceilings", "survey", "legalpack", "Legal pack: asbestos mentioned");
      if (/damp|subsidence|structural|movement|underpin/.test(low)) exp("cracks", "monitor", "legalpack", "Legal pack: " + (f.category || "structural item"));
      if (urgent || /knotweed|asbestos|subsidence|tenan|title/.test(low)) verify.push(`${f.category || "Legal pack"}: ${f.summary || ""}`.trim());
    }
    for (const u of r.unreadableSections || []) verify.push("Legal pack section not read by review: " + u);
  }
  const route = deal.listingType === "auction" ? "auction" : "market";
  if (route === "auction") compliance.legalpack = reviews.length ? "yes" : "unknown";

  return {
    version: 1, createdAt: Date.now(), updatedAt: Date.now(),
    strategy: "flip", route,
    property, answers, compliance, verify: [...new Set(verify)],
    contingencyPct: property.age === "pre1919" ? 15 : 10,   // percent in the survey; written to the deal as a fraction
    ratesSnapshot: null,
  };
}
