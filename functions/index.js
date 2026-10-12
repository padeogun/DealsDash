// Runtime: Node.js 22
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const EPC_API_KEY = defineSecret("EPC_API_KEY");
const ESTATELY_API_KEY = defineSecret("ESTATELY_API_KEY");
const ESTATELY_WEBHOOK_SECRET = defineSecret("ESTATELY_WEBHOOK_SECRET");
// ALLOWED_EMAIL — also defined in src/App.jsx:52 and firestore.rules:7 — update all three together.
const ALLOWED_EMAIL = "paul.a.adeogun@gmail.com";

// Overridable only for local emulator testing (set via functions/.env.local) —
// in production this always resolves to the real Anthropic endpoint.
const ANTHROPIC_API_URL = process.env.ANTHROPIC_API_URL_OVERRIDE || "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

exports.reviewDeal = onCall({ secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 60 }, async (request) => {
  const email = (request.auth && request.auth.token && request.auth.token.email) || "";
  if (!request.auth || email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    throw new HttpsError("permission-denied", "Not authorized to use this feature.");
  }

  const deal = request.data && request.data.deal;
  const metrics = request.data && request.data.metrics;
  if (!deal || !metrics) {
    throw new HttpsError("invalid-argument", "Missing deal or metrics in the request.");
  }

  const prompt = buildPrompt(deal, metrics);

  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY.value(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    logger.error("Network error calling Anthropic", e);
    throw new HttpsError("unavailable", "Couldn't reach the AI review service. Try again shortly.");
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    logger.error("Anthropic API returned an error", res.status, bodyText);
    throw new HttpsError("internal", `The AI review service returned an error (${res.status}).`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new HttpsError("internal", "The AI review service returned an empty response.");
  }

  return { review: text, model: MODEL };
});

function buildPrompt(deal, metrics) {
  const trimmedDeal = { ...deal };
  delete trimmedDeal.id; // internal only, not useful context

  return [
    "You are reviewing a UK residential property BRR/flip deal appraisal for an experienced property trader based in the UK.",
    "Write a concise, plain-English review in two short parts, in prose (not bullet lists):",
    "",
    "1. Data quality check — flag anything about the comparables, refurb estimate, funding, or risk assumptions that looks thin, inconsistent, or worth double-checking before relying on it. If nothing stands out, say so briefly rather than inventing a concern.",
    "2. A short investment-memo-style summary (2-4 sentences) of the deal, suitable to send to a JV partner or lender — reference the actual numbers.",
    "",
    "Be direct and specific. Do not repeat the raw data back as a list. Do not add disclaimers about not being a financial advisor.",
    "",
    "DEAL DATA (JSON):",
    JSON.stringify({ deal: trimmedDeal, computedMetrics: metrics }),
  ].join("\n");
}

/* =================================================================================
   AI RESEARCH PASS — searches the live web for real property leads matching a
   brief, and returns them as structured leads for the Sourcing pipeline. Costs
   more than reviewDeal (web search is billed per-search on top of tokens), so
   the search budget is capped and the model is asked to only report leads it
   found real evidence for, never to invent plausible-sounding ones.
   ================================================================================= */

const RESEARCH_MODEL = "claude-sonnet-4-6";
const MAX_SEARCHES_PER_RUN = 8; // raised to cover multiple towns being searched individually

// Schema-constrained output tool. Claude MUST call this with arguments matching
// this exact shape — the API validates the structure, so we're not relying on
// the model to hand-write clean JSON prose (which is what broke on broad briefs:
// the model would add explanatory text around the JSON, or run out of tokens
// mid-array before finishing it cleanly).
const REPORT_LEADS_TOOL = {
  name: "report_leads",
  description: "Report the property leads found via web search that match the brief. Call this exactly once, after you've finished searching — with every matching lead found, or an empty leads array if none matched well enough to report. This is the only way to report results back.",
  input_schema: {
    type: "object",
    properties: {
      leads: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            address: { type: "string", description: "Full street address including house number/name and street name (e.g. '14 Oak Street, Rochdale' or 'Flat 3, 27 High Street, Manchester'). NEVER return just a town, area, or postcode. Visit the actual listing page — auction house lot detail or portal listing — to find the specific address; search snippets often omit it. If only a partial address is visible on the page, include what was found and note the gap in riskNotes." },
            postcode: { type: "string", description: "Full postcode if shown on the listing page (e.g. OL11 2AB), partial outcode if that's all that's available, else empty string" },
            propertyType: { type: "string", enum: ["Terrace", "Semi", "Detached", "Flat"] },
            bedrooms: { type: "number", description: "Number of bedrooms as stated on the listing. 0 if not stated." },
            availabilityConfirmed: { type: "boolean", description: "Set true ONLY if you navigated to the actual listing page (auction house lot detail page or portal listing page — not a search snippet or cached result) and the page itself showed the property as currently available for sale or auction. Set false if you did not visit the page, the page was inaccessible, or the page showed 'Sold', 'Sold STC', 'Under Offer', 'Sale Agreed', 'Withdrawn', 'No longer available', or any similar off-market language." },
            source: { type: "string", description: "Site or auction house name" },
            sourceUrl: { type: "string", description: "The real URL of the listing page you visited" },
            guidePrice: { type: "number", description: "0 if unknown" },
            auctionDate: { type: "string", description: "YYYY-MM-DD, empty string if not applicable" },
            estRefurb: { type: "number", description: "Rough estimate, 0 if unknown" },
            estResaleLow: { type: "number", description: "0 if unknown" },
            estResaleHigh: { type: "number", description: "0 if unknown" },
            riskNotes: { type: "string", description: "Brief, specific, mention any uncertainty here — include if address is partial, if availability could not be confirmed from the listing page, or if the listing appeared recently reduced or re-listed" },
            comparables: {
              type: "array",
              maxItems: 10,
              items: {
                type: "object",
                properties: { label: { type: "string" }, value: { type: "string" } },
                required: ["label", "value"],
              },
            },
            sellerType: { type: "string", enum: ["unknown", "receiver", "probate", "ha_council", "landlord_exit", "trader", "forced_speed"], description: "Best inference from listing wording — 'unknown' if genuinely unclear" },
            signals: {
              type: "array",
              items: { type: "string", enum: ["late_entry", "no_viewings", "late_pack", "reduced", "prior_withdrawn", "prior_unsold"] },
              description: "Any of these evident from the listing — empty array if none",
            },
            triage: {
              type: "object",
              description: "Your own assessment against the strategy profile given in the prompt — leave a field as null (omit it or set null) if you can't judge it, rather than guessing.",
              properties: {
                areaKnown: { type: ["boolean", "null"], description: "Does this postcode fall within the strategy profile's areas? Deterministically re-checked server-side regardless of your answer." },
                assetTypeFits: { type: ["boolean", "null"], description: "Does the property type fit the profile's asset types? Deterministically re-checked server-side regardless of your answer." },
                conditionAddsValue: { type: ["boolean", "null"], description: "Based on what's described, would refurb genuinely add value here?" },
                sellerMotivated: { type: ["boolean", "null"] },
                guideSensible: { type: ["boolean", "null"], description: "Is the guide price within the profile's max? Deterministically re-checked server-side regardless of your answer." },
                valueAddClear: { type: ["boolean", "null"] },
              },
            },
          },
          required: ["address", "postcode", "propertyType", "bedrooms", "availabilityConfirmed", "source", "sourceUrl", "guidePrice", "riskNotes", "comparables"],
        },
      },
    },
    required: ["leads"],
  },
};

exports.researchLeads = onCall({ secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 180, memory: "512MiB" }, async (request) => {
  const email = (request.auth && request.auth.token && request.auth.token.email) || "";
  if (!request.auth || email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    throw new HttpsError("permission-denied", "Not authorized to use this feature.");
  }

  const criteria = request.data && request.data.criteria;
  const brief = request.data && request.data.brief;
  const strategyProfile = request.data && request.data.strategyProfile;
  const writeRejected = request.data && request.data.writeRejected !== undefined ? !!request.data.writeRejected : true; // default true — audit gate behaviour for the first fortnight, then flip
  if ((!criteria || typeof criteria !== "string" || !criteria.trim()) && !isValidBrief(brief)) {
    throw new HttpsError("invalid-argument", "Missing search criteria.");
  }

  const prompt = isValidBrief(brief) ? buildResearchPromptFromBrief(brief, strategyProfile) : buildResearchPrompt(criteria.trim());

  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY.value(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: RESEARCH_MODEL,
        max_tokens: 4000,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES_PER_RUN },
          REPORT_LEADS_TOOL,
        ],
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    logger.error("Network error calling Anthropic (research)", e);
    throw new HttpsError("unavailable", "Couldn't reach the AI research service. Try again shortly.");
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    logger.error("Anthropic API returned an error (research)", res.status, bodyText);
    throw new HttpsError("internal", `The AI research service returned an error (${res.status}).`);
  }

  const data = await res.json();
  const content = data.content || [];
  const searchesUsed = content.filter((block) => block.type === "server_tool_use" && block.name === "web_search").length;

  let leads = extractLeadsFromToolUse(content);
  if (leads === null) {
    // Fallback: the model didn't call report_leads (rare, but models don't
    // always perfectly follow tool-use instructions) — try to salvage a JSON
    // array from whatever text it did write, permissively rather than requiring
    // the whole response to be clean JSON with nothing else around it.
    const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    leads = extractLeadsFromLooseText(text);
  }

  if (leads === null) {
    logger.error("Could not extract leads from model output — no report_leads call and no parseable JSON in text", JSON.stringify(content).slice(0, 800));
    throw new HttpsError("internal", "The AI research service didn't return usable results — try narrowing your criteria (a smaller area or fewer constraints) and running it again.");
  }

  return { leads: applyGateAndFinalize(cleanStaleAuctionDates(sanitizeLeads(leads)), strategyProfile, writeRejected), searchesUsed };
});

/* =================================================================================
   SERVER-SIDE DETERMINISTIC GATE — mirrors applyDeterministicGate() in src/App.jsx
   exactly (postcode area/district, asset type, guide price — the three objective,
   checkable-from-data facts). Runs after the model, before anything is written,
   and overrides whatever the model itself asserted for those three fields: "Gate
   overrides model output; model cannot pass a lead the rule fails."
   INTENTIONAL DUPLICATION — if you change gate rules here, update src/App.jsx too.
   TODO: extract gate DEFINITIONS to a shared JSON constant loaded by both sides.
   ================================================================================= */
function applyDeterministicGate(lead, profile) {
  if (!profile) return { areaKnown: null, assetTypeFits: null, guideSensible: null, reasons: [] };
  const reasons = [];

  let areaKnown = null;
  const hasAreaConstraint = (profile.postcodeAreas || []).length > 0 || (profile.postcodeDistricts || []).length > 0;
  if (hasAreaConstraint && lead.postcode) {
    const outward = lead.postcode.trim().toUpperCase().split(/\s+/)[0];
    const areaLetters = (outward.match(/^[A-Z]+/) || [""])[0];
    const districts = (profile.postcodeDistricts || []).map((d) => d.toUpperCase());
    const areas = (profile.postcodeAreas || []).map((a) => a.toUpperCase());
    const matches = districts.includes(outward) || areas.includes(areaLetters);
    areaKnown = matches;
    if (!matches) reasons.push(`Postcode ${outward || lead.postcode} is outside your configured strategy areas`);
  }

  let assetTypeFits = null;
  if ((profile.assetTypes || []).length > 0 && lead.propertyType) {
    assetTypeFits = profile.assetTypes.includes(lead.propertyType);
    if (!assetTypeFits) reasons.push(`${lead.propertyType} isn't in your configured asset types`);
  }

  let guideSensible = null;
  if (profile.maxGuide && Number(lead.guidePrice) > 0) {
    guideSensible = Number(lead.guidePrice) <= Number(profile.maxGuide);
    if (!guideSensible) reasons.push(`Guide price ${lead.guidePrice} exceeds your max of ${profile.maxGuide}`);
  }

  return { areaKnown, assetTypeFits, guideSensible, reasons };
}

function applyGateAndFinalize(leads, profile, writeRejected) {
  const finalized = leads.map((lead) => {
    const gate = applyDeterministicGate(lead, profile);
    const modelTriage = lead.triage || {};
    const triage = {
      areaKnown: gate.areaKnown !== null ? gate.areaKnown : (modelTriage.areaKnown ?? null),
      assetTypeFits: gate.assetTypeFits !== null ? gate.assetTypeFits : (modelTriage.assetTypeFits ?? null),
      conditionAddsValue: modelTriage.conditionAddsValue ?? null,
      sellerMotivated: modelTriage.sellerMotivated ?? null,
      guideSensible: gate.guideSensible !== null ? gate.guideSensible : (modelTriage.guideSensible ?? null),
      valueAddClear: modelTriage.valueAddClear ?? null,
      liquid12m: null,
      areaStrong: null,
    };
    const gateFailsQ1to3 = triage.areaKnown === false || triage.assetTypeFits === false || triage.conditionAddsValue === false;
    const result = gateFailsQ1to3 ? "fail" : Object.values(triage).some((v) => v === null) ? "incomplete" : "pass";
    const failReason = gateFailsQ1to3 ? (gate.reasons[0] || "Failed strategy triage") : null;

    const availabilityWarning = lead.availabilityConfirmed !== true
      ? "⚠ Availability not confirmed from listing page — verify this property is still on the market before acting on it."
      : "";
    const mergedRiskNotes = [availabilityWarning, lead.riskNotes].filter(Boolean).join(" ");

    return {
      ...lead,
      sellerType: lead.sellerType || "unknown",
      signals: Array.isArray(lead.signals) ? lead.signals : [],
      triage: { ...triage, result, failReason, scoredAt: Date.now(), scoredBy: gateFailsQ1to3 ? "gate" : "ai" },
      status: gateFailsQ1to3 ? "rejected" : "new",
      riskNotes: mergedRiskNotes,
    };
  });

  if (writeRejected) return finalized;
  return finalized.filter((l) => l.status !== "rejected");
}

function extractLeadsFromToolUse(content) {
  const toolUse = content.find((block) => block.type === "tool_use" && block.name === "report_leads");
  if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.leads)) return null;
  return toolUse.input.leads;
}

function extractLeadsFromLooseText(text) {
  if (!text) return null;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function isValidBrief(brief) {
  return !!brief
    && Array.isArray(brief.towns) && brief.towns.length > 0
    && Array.isArray(brief.propertyTypes) && brief.propertyTypes.length > 0
    && Array.isArray(brief.acquisitionTypes) && brief.acquisitionTypes.length > 0;
}

// Builds an unambiguous, enumerated prompt from structured form fields rather
// than relying on a natural-language sentence — every constraint is explicit,
// so the model has far less room to misjudge or wander off-brief on a broad search.
function buildResearchPromptFromBrief(brief, strategyProfile) {
  const towns = brief.towns.slice(0, 12).map(String);
  const propertyTypes = brief.propertyTypes.filter((t) => ["Terrace", "Semi", "Detached", "Flat"].includes(t));
  const acquisitionTypes = brief.acquisitionTypes.filter((t) => ["Sale", "Auction"].includes(t));
  const priceMin = Number(brief.priceMin) || 0;
  const priceMax = Number(brief.priceMax) || 0;
  const bedsMin = Number(brief.bedsMin) || 0;
  const bedsMax = Number(brief.bedsMax) || 0;
  const todayIso = new Date().toISOString().slice(0, 10);

  const profileLines = strategyProfile ? [
    "",
    "You also have a standing strategy profile — use it to score each lead's triage fields (see the tool schema), but note that areaKnown, assetTypeFits, and guideSensible are independently re-checked by a deterministic rule after you report, so don't worry about being exact on those three — your best judgement is enough, the rule is the final word. Your judgement matters most on conditionAddsValue, sellerMotivated, and valueAddClear, which nothing else checks.",
    strategyProfile.postcodeAreas && strategyProfile.postcodeAreas.length ? `- Strategy postcode areas: ${strategyProfile.postcodeAreas.join(", ")}` : null,
    strategyProfile.assetTypes && strategyProfile.assetTypes.length ? `- Strategy asset types: ${strategyProfile.assetTypes.join(", ")}` : null,
    strategyProfile.maxGuide ? `- Strategy max guide price: £${Number(strategyProfile.maxGuide).toLocaleString("en-GB")}` : null,
    strategyProfile.conditionPref ? `- Strategy condition preference: ${strategyProfile.conditionPref}` : null,
    "- Also infer sellerType and any applicable signals (see the tool schema's enum values) from the listing wording where you can — leave sellerType as 'unknown' and signals empty if genuinely unclear.",
  ].filter(Boolean) : [];

  const lines = [
    `Today's date is ${todayIso}. You are a property sourcing researcher for a UK residential BRR/flip trader. Use web search to find REAL, CURRENTLY LIVE property leads matching ALL of these constraints:`,
    "",
    `- Locations: search specifically within each of these towns — ${towns.join(", ")} (${brief.region || "UK"}). Search each town individually if useful rather than one combined query, and try to find at least one lead per town if genuine matches exist.`,
    `- Property types: ${propertyTypes.join(" or ")}`,
    `- Acquisition type: ${acquisitionTypes.join(" or ")} listings only`,
    bedsMin || bedsMax ? `- Bedrooms: ${bedsMin || "any"}–${bedsMax || "any"}` : null,
    (priceMin || priceMax) ? `- Price: ${priceMin ? `£${priceMin.toLocaleString("en-GB")}` : "no min"} to ${priceMax ? `£${priceMax.toLocaleString("en-GB")}` : "no max"}` : null,
    brief.notes ? `- Additional preference: ${String(brief.notes)}` : null,
    ...profileLines,
    "",
    "Rules:",
    "- Only report properties you found genuine evidence for via search. Never invent a plausible-sounding address, price, or listing — if a town or constraint genuinely has no real matches, simply don't include a lead for it.",
    "- VISIT THE LISTING PAGE for every lead before reporting it. For each candidate found in search results, navigate to the actual listing page (the auction house lot detail page, Rightmove/Zoopla/OnTheMarket property page, etc.) — not just the search snippet — to confirm: (a) the full street address including house number/name and street name, and (b) that the property is still actively listed. Search snippets are frequently cached and can misrepresent current status. Set availabilityConfirmed to true only after doing this and seeing an active, on-market listing.",
    `- CRITICAL — AUCTION DATES: if reporting an auction lead, the auction date MUST be on or after ${todayIso}. Web search often surfaces pages for auctions that have already happened — check the date on the actual listing page before including it. If an auction you found has already passed, either leave it out entirely, or if there's clear evidence the property is still on the market (e.g. it didn't sell and is now listed for private sale), report it with no auction date instead.`,
    "- CRITICAL — AVAILABILITY: set availabilityConfirmed to true for a lead ONLY after visiting the listing page and confirming the property is currently on the market. If the page shows 'Sold', 'Sold STC', 'Sale Agreed', 'Under Offer', 'Withdrawn', 'No longer available', 'This listing has been removed', or the page returns 404/redirect — do NOT report that lead. Properties sold or under offer are useless to this investor. This is the most common source of bad results, so treat it as a hard requirement.",
    "- FULL ADDRESS REQUIRED: the address field must include at minimum the house number/name and street name. Do not return just a postcode, town, area description, or property type (e.g. '3-bed terrace, Rochdale' is not acceptable — '14 Oak Street, Rochdale' is). If you can only find a partial address, include what you found and note the gap in riskNotes.",
    "- Prefer auction lots, probate sales, and below-market listings over standard estate agent listings where the acquisition type allows, since those suit a flip/BRR strategy better.",
    "- For each lead, include the real source URL of the listing page you visited.",
    "- Leave a numeric field as 0 and explain in riskNotes if you couldn't determine it confidently — do not estimate a plausible-sounding number to fill the field.",
    "- Find at most 6 leads total across all towns, picking the strongest matches if there are more. Quality over quantity — 2 confirmed leads with full addresses beat 6 unverified ones.",
    "- Once you've finished searching, call report_leads exactly once with your findings. That is the only way to report results — do not describe your findings in plain text instead of calling it.",
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * @deprecated Use buildResearchPromptFromBrief() — the structured path with full buy-box context.
 * This free-text fallback exists only for backward compatibility with legacy criteria strings.
 */
function buildResearchPrompt(criteria) {
  return [
    "You are a property sourcing researcher for a UK residential BRR/flip trader. Use web search to find REAL, CURRENTLY LISTED property leads matching this brief:",
    "",
    `"${criteria}"`,
    "",
    "Rules:",
    "- Only report properties you found genuine evidence for via search. Never invent a plausible-sounding address, price, or listing — if you can't find real current leads matching the brief, call report_leads with an empty leads array rather than guessing.",
    "- Prefer auction lots, probate sales, and below-market listings over standard estate agent listings, since those suit a flip/BRR strategy better.",
    "- For each lead, include the real source URL you found it at.",
    "- Leave a numeric field as 0 and explain in riskNotes if you couldn't determine it confidently — do not estimate a plausible-sounding number to fill the field.",
    "- Find at most 6 leads. A broad brief (wide area, loose criteria) may genuinely have more real candidates than a narrow one — that's fine, still cap at 6, picking the strongest matches.",
    "- Once you've finished searching, call report_leads exactly once with your findings. That is the only way to report results — do not describe your findings in plain text instead of calling it.",
  ].join("\n");
}

// Server-side safety net: even with explicit date instructions, the model won't
// always get this right. Never trust it alone — check every auction date against
// the actual server clock and correct anything already in the past, rather than
// presenting a completed auction as a live opportunity.
function cleanStaleAuctionDates(leads) {
  const today = new Date(new Date().toISOString().slice(0, 10)); // midnight today, UTC
  return leads.map((l) => {
    if (!l.auctionDate) return l;
    const parsed = new Date(l.auctionDate);
    if (isNaN(parsed.getTime())) return l; // not a parseable date — leave it, don't guess
    if (parsed < today) {
      const note = `Auction listing found was dated ${l.auctionDate}, which has already passed — treat as a historical reference only and verify current availability before relying on it.`;
      return { ...l, auctionDate: "", riskNotes: l.riskNotes ? `${note} ${l.riskNotes}` : note };
    }
    return l;
  });
}

const VALID_SELLER_TYPES = ["unknown", "receiver", "probate", "ha_council", "landlord_exit", "trader", "forced_speed"];
const VALID_SIGNALS = ["late_entry", "no_viewings", "late_pack", "reduced", "prior_withdrawn", "prior_unsold"];

function sanitizeLeads(leads) {
  return leads.slice(0, 6).map((l) => ({
    address: String((l && l.address) || ""),
    postcode: String((l && l.postcode) || ""),
    propertyType: ["Terrace", "Semi", "Detached", "Flat"].includes(l && l.propertyType) ? l.propertyType : "Terrace",
    bedrooms: Number(l && l.bedrooms) || 0,
    availabilityConfirmed: (l && l.availabilityConfirmed === true),
    source: String((l && l.source) || "AI research pass"),
    sourceUrl: String((l && l.sourceUrl) || ""),
    guidePrice: Number(l && l.guidePrice) || 0,
    auctionDate: String((l && l.auctionDate) || ""),
    estRefurb: Number(l && l.estRefurb) || 0,
    estLegalFinance: 0,
    estResaleLow: Number(l && l.estResaleLow) || 0,
    estResaleHigh: Number(l && l.estResaleHigh) || 0,
    riskNotes: String((l && l.riskNotes) || ""),
    comparables: Array.isArray(l && l.comparables)
      ? l.comparables.slice(0, 10).map((c) => ({ label: String((c && c.label) || ""), value: String((c && c.value) || "") }))
      : [],
    sellerType: VALID_SELLER_TYPES.includes(l && l.sellerType) ? l.sellerType : "unknown",
    signals: Array.isArray(l && l.signals) ? l.signals.filter((s) => VALID_SIGNALS.includes(s)) : [],
    triage: (l && l.triage && typeof l.triage === "object") ? l.triage : {},
  }));
}

/* =================================================================================
   LEGAL PACK REVIEW — a triage aid, never a verdict. Flags things worth raising
   with a solicitor before bidding/exchanging; never tells the user a pack is
   "clean" or "safe." Handles PDFs over Claude's hard 100-page/32MB-per-request
   limit by splitting into sequential chunks and merging the flagged results —
   a real requirement, not a hypothetical: a leasehold or multi-unit auction
   pack routinely exceeds 100 pages once the lease, title, and searches are
   combined.
   ================================================================================= */

const { initializeApp: initAdminApp, getApps } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");
const { PDFDocument } = require("pdf-lib");

if (!getApps().length) initAdminApp();

const LEGAL_PACK_MODEL = "claude-sonnet-4-6";
const MAX_PAGES_PER_CHUNK = 90; // safety margin under Claude's hard 100-page API limit
const MAX_INPUT_MB = 40; // reject absurdly large uploads before doing any work

const CHECKLIST_ITEMS = ["Asbestos report", "EICR", "Gas safety certificate", "EPC", "Searches", "Management pack", "Lease plan"];
const VAT_RATE = 0.20;

const FLAG_PACK_TOOL = {
  name: "report_legal_pack_flags",
  description: "Report everything found in this legal pack chunk worth a solicitor's attention. Call this exactly once per chunk, even if nothing of concern was found (return an empty flags array in that case) — this is the only way to report results.",
  input_schema: {
    type: "object",
    properties: {
      tenure: { type: "string", description: "Freehold, leasehold, or unclear from this chunk. If leasehold, note years remaining, ground rent, service charge, and any fire safety / cladding / EWS1 concerns mentioned." },
      flags: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: ["Tenure & lease terms", "Restrictive covenants", "Special conditions of sale", "Missing searches", "Tenancy information", "Known defects & notices", "Other"] },
            urgency: { type: "string", enum: ["Raise with solicitor before bidding", "Worth asking about", "Informational"] },
            summary: { type: "string", description: "Plain English, 1-3 sentences. Quote the relevant wording briefly if it's short; otherwise describe it." },
            pageHint: { type: "string", description: "Page number or section heading this was found under, if identifiable from this chunk. Empty string if not." },
          },
          required: ["category", "urgency", "summary", "pageHint"],
        },
      },
      unreadableSections: {
        type: "array",
        items: { type: "string" },
        description: "Any handwritten annotations, illegible scans, or sections you could not confidently read — report these explicitly rather than guessing at their content.",
      },
      additionalFees: {
        type: "object",
        description: "Structured £ figures for buyer-side costs found in this chunk (typically in the special conditions of sale). Leave amount at 0 if not found in this chunk — do not guess a plausible-sounding figure.",
        properties: {
          buyerPremium: { type: "number", description: "0 if not found" },
          buyerPremiumVatApplied: { type: "boolean", description: "True if the pack states VAT applies on top of this figure" },
          sellerLegalReimbursement: { type: "number", description: "Seller's legal costs the buyer must reimburse. 0 if not found" },
          sellerLegalReimbursementVatApplied: { type: "boolean" },
          rentalReimbursement: { type: "number", description: "Any rental/income reimbursement to the seller required. 0 if not found" },
          rentalReimbursementVatApplied: { type: "boolean" },
          otherFees: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, amount: { type: "number" }, vatApplied: { type: "boolean" } },
              required: ["label", "amount", "vatApplied"],
            },
          },
        },
        required: ["buyerPremium", "buyerPremiumVatApplied", "sellerLegalReimbursement", "sellerLegalReimbursementVatApplied", "rentalReimbursement", "rentalReimbursementVatApplied", "otherFees"],
      },
      completion: {
        type: "object",
        description: "Completion terms if found in this chunk.",
        properties: {
          completionDays: { type: "number", description: "Days from exchange to completion. 0 if not found." },
          deadlineDate: { type: "string", description: "An actual calendar deadline date if stated (YYYY-MM-DD), empty string otherwise." },
          conditionsNote: { type: "string", description: "Any completion conditions worth flagging — e.g. whether searches are already ordered/returned, or the pack is silent on this. Empty string if nothing relevant found." },
        },
        required: ["completionDays", "deadlineDate", "conditionsNote"],
      },
      itemsFound: {
        type: "array",
        items: { type: "string", enum: CHECKLIST_ITEMS },
        description: "Which of these standard items you found clear evidence of (present, referenced, or explicitly confirmed) somewhere in THIS chunk. Do not include an item just because it's the kind of pack that would usually have one — only if you actually saw evidence of it. Items never found across any chunk will be reported as missing.",
      },
    },
    required: ["tenure", "flags", "unreadableSections", "additionalFees", "completion", "itemsFound"],
  },
};

exports.reviewLegalPack = onCall({ secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  const email = (request.auth && request.auth.token && request.auth.token.email) || "";
  if (!request.auth || email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    throw new HttpsError("permission-denied", "Not authorized to use this feature.");
  }

  const storagePath = request.data && request.data.storagePath;
  if (!storagePath || typeof storagePath !== "string") {
    throw new HttpsError("invalid-argument", "Missing storagePath.");
  }
  // Every legal pack lives under users/{uid}/... — refuse anything outside the
  // caller's own folder even though Storage rules already enforce this, as a
  // second independent check (same defence-in-depth pattern as Firestore).
  if (!storagePath.startsWith(`users/${request.auth.uid}/`)) {
    throw new HttpsError("permission-denied", "Path does not belong to this user.");
  }

  let fileBuffer;
  try {
    const bucket = getStorage().bucket("dealsdash.firebasestorage.app");
    [fileBuffer] = await bucket.file(storagePath).download();
  } catch (e) {
    logger.error("Could not download legal pack from Storage", e);
    throw new HttpsError("not-found", "Could not find or read that file in storage.");
  }

  if (fileBuffer.length > MAX_INPUT_MB * 1024 * 1024) {
    throw new HttpsError("invalid-argument", `File is larger than ${MAX_INPUT_MB}MB — split it before uploading, or upload sections separately.`);
  }

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  } catch (e) {
    throw new HttpsError("invalid-argument", "Could not read this as a PDF — it may be corrupted or password-protected.");
  }
  const totalPages = pdfDoc.getPageCount();

  // Split into <=MAX_PAGES_PER_CHUNK-page chunks so no single Claude request
  // ever exceeds the API's hard 100-page ceiling.
  const chunkRanges = [];
  for (let start = 0; start < totalPages; start += MAX_PAGES_PER_CHUNK) {
    chunkRanges.push([start, Math.min(start + MAX_PAGES_PER_CHUNK, totalPages)]);
  }

  const chunkBuffers = [];
  for (const [start, end] of chunkRanges) {
    const chunkDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await chunkDoc.copyPages(pdfDoc, indices);
    pages.forEach((pg) => chunkDoc.addPage(pg));
    const bytes = await chunkDoc.save();
    chunkBuffers.push(Buffer.from(bytes));
  }

  const allFlags = [];
  const allUnreadable = [];
  const tenureNotes = [];
  const feeChunks = [];
  const itemsFoundUnion = new Set();
  let completion = null;
  let chunkIndex = 0;
  for (const buf of chunkBuffers) {
    chunkIndex++;
    const base64 = buf.toString("base64");
    let res;
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY.value(), "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: LEGAL_PACK_MODEL,
          max_tokens: 3000,
          tools: [FLAG_PACK_TOOL],
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: buildLegalPackPrompt(chunkIndex, chunkBuffers.length) },
            ],
          }],
        }),
      });
    } catch (e) {
      logger.error("Network error calling Anthropic (legal pack)", e);
      throw new HttpsError("unavailable", `Couldn't reach the review service on chunk ${chunkIndex} of ${chunkBuffers.length}. Try again shortly.`);
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      logger.error("Anthropic API returned an error (legal pack)", res.status, bodyText);
      throw new HttpsError("internal", `The review service returned an error on chunk ${chunkIndex} of ${chunkBuffers.length} (${res.status}).`);
    }
    const data = await res.json();
    const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === "report_legal_pack_flags");
    if (!toolUse || !toolUse.input) {
      logger.error("Legal pack chunk did not return structured flags", chunkIndex, JSON.stringify(data.content || []).slice(0, 500));
      continue; // one unreadable chunk shouldn't fail the whole pack — report what we do have
    }
    const input = toolUse.input;
    if (input.tenure) tenureNotes.push(input.tenure);
    const chunkFlags = Array.isArray(input.flags) ? input.flags.map((f) => sanitizeFlag(f)) : [];
    allFlags.push(...chunkFlags);
    if (Array.isArray(input.unreadableSections)) allUnreadable.push(...input.unreadableSections.map(String));
    if (input.additionalFees) feeChunks.push(sanitizeFeesFallback(input.additionalFees, chunkFlags));
    if (Array.isArray(input.itemsFound)) input.itemsFound.forEach((it) => { if (CHECKLIST_ITEMS.includes(it)) itemsFoundUnion.add(it); });
    if (input.completion && !completion && (Number(input.completion.completionDays) > 0 || input.completion.deadlineDate)) {
      completion = sanitizeCompletion(input.completion);
    }
  }

  const additionalFees = mergeFees(feeChunks);
  const missingItems = CHECKLIST_ITEMS.filter((item) => !itemsFoundUnion.has(item));

  return {
    totalPages,
    chunksProcessed: chunkBuffers.length,
    tenureSummary: [...new Set(tenureNotes.filter(Boolean))].join(" "),
    flags: allFlags.slice(0, 60),
    unreadableSections: allUnreadable.slice(0, 20),
    additionalFees,
    completion: completion || { completionDays: 0, deadlineDate: "", conditionsNote: "" },
    missingItems,
    reviewedAt: Date.now(),
    model: LEGAL_PACK_MODEL,
  };
});

// Structured fee extraction is the primary path. This is the defensive fallback:
// if the model reported zero everywhere despite the flags clearly discussing
// fees (a premium, reimbursement, or £ figure mentioned in the flag text itself),
// scan that flag text with a plain £-amount regex rather than silently reporting
// £0 when the pack evidently does mention a fee. Anything recovered this way is
// marked feesParsedByFallback so it's clearly flagged for manual double-checking.
function sanitizeFeesFallback(raw, chunkFlags) {
  const fees = {
    buyerPremium: Number(raw.buyerPremium) || 0,
    buyerPremiumVatApplied: !!raw.buyerPremiumVatApplied,
    sellerLegalReimbursement: Number(raw.sellerLegalReimbursement) || 0,
    sellerLegalReimbursementVatApplied: !!raw.sellerLegalReimbursementVatApplied,
    rentalReimbursement: Number(raw.rentalReimbursement) || 0,
    rentalReimbursementVatApplied: !!raw.rentalReimbursementVatApplied,
    otherFees: Array.isArray(raw.otherFees) ? raw.otherFees.slice(0, 10).map((f) => ({ label: String((f && f.label) || ""), amount: Number(f && f.amount) || 0, vatApplied: !!(f && f.vatApplied) })) : [],
    feesParsedByFallback: false,
  };

  const structuredTotal = fees.buyerPremium + fees.sellerLegalReimbursement + fees.rentalReimbursement + fees.otherFees.reduce((s, f) => s + f.amount, 0);
  const feeRelatedText = chunkFlags
    .filter((f) => f.category === "Special conditions of sale" || /premium|reimburs|buyer.?s fee/i.test(f.summary))
    .map((f) => f.summary).join(" ");

  if (structuredTotal === 0 && /£\s?[\d,]+/.test(feeRelatedText)) {
    const matches = feeRelatedText.match(/£\s?[\d,]+(?:\.\d+)?/g) || [];
    const fallbackFees = matches.map((m, i) => ({ label: `Fallback-parsed amount ${i + 1}`, amount: Number(m.replace(/[£,\s]/g, "")) || 0, vatApplied: false })).filter((f) => f.amount > 0);
    if (fallbackFees.length) {
      fees.otherFees = [...fees.otherFees, ...fallbackFees];
      fees.feesParsedByFallback = true;
    }
  }
  return fees;
}

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function mergeFees(feeChunks) {
  const merged = { buyerPremium: 0, buyerPremiumVatApplied: false, sellerLegalReimbursement: 0, sellerLegalReimbursementVatApplied: false, rentalReimbursement: 0, rentalReimbursementVatApplied: false, otherFees: [], feesParsedByFallback: false };
  for (const f of feeChunks) {
    if (f.buyerPremium) { merged.buyerPremium += f.buyerPremium; merged.buyerPremiumVatApplied = merged.buyerPremiumVatApplied || f.buyerPremiumVatApplied; }
    if (f.sellerLegalReimbursement) { merged.sellerLegalReimbursement += f.sellerLegalReimbursement; merged.sellerLegalReimbursementVatApplied = merged.sellerLegalReimbursementVatApplied || f.sellerLegalReimbursementVatApplied; }
    if (f.rentalReimbursement) { merged.rentalReimbursement += f.rentalReimbursement; merged.rentalReimbursementVatApplied = merged.rentalReimbursementVatApplied || f.rentalReimbursementVatApplied; }
    merged.otherFees.push(...f.otherFees);
    merged.feesParsedByFallback = merged.feesParsedByFallback || f.feesParsedByFallback;
  }
  const withVat = (amount, vat) => amount * (vat ? 1 + VAT_RATE : 1);
  merged.total = round2(
    withVat(merged.buyerPremium, merged.buyerPremiumVatApplied) +
    withVat(merged.sellerLegalReimbursement, merged.sellerLegalReimbursementVatApplied) +
    withVat(merged.rentalReimbursement, merged.rentalReimbursementVatApplied) +
    merged.otherFees.reduce((s, f) => s + withVat(f.amount, f.vatApplied), 0)
  );
  return merged;
}

function sanitizeCompletion(raw) {
  return {
    completionDays: Number(raw.completionDays) || 0,
    deadlineDate: String(raw.deadlineDate || ""),
    conditionsNote: String(raw.conditionsNote || ""),
  };
}

function buildLegalPackPrompt(chunkIndex, totalChunks) {
  const chunkNote = totalChunks > 1
    ? `This is chunk ${chunkIndex} of ${totalChunks} from a longer legal pack that was split to fit within the 100-page document limit — only report on what's visible in this chunk, another pass covers the rest.`
    : "This is the complete legal pack.";
  return [
    "You are triaging a UK property auction/sale legal pack for an experienced property investor's solicitor to review before exchange. You are NOT giving legal advice and must never say a pack looks \"safe,\" \"clean,\" or \"fine to proceed\" — your only job is to flag things worth a solicitor's specific attention, so nothing gets missed under time pressure.",
    chunkNote,
    "",
    "Look specifically for:",
    "- Tenure and lease terms (if leasehold: years remaining, ground rent, service charge history, and any fire safety / cladding remediation / EWS1 certificate concerns — these matter a lot for mortgageability and value on a flat)",
    "- Restrictive covenants, especially anything that could block conversion to an HMO or multi-unit use",
    "- Special conditions of sale that shift costs onto the buyer, unusually short completion windows, or buyer's premium terms",
    "- Whether local authority, drainage, or environmental searches are present or conspicuously absent",
    "- Tenancy information — sitting tenants, deposit protection status, and notices served. Assess this against current law: the Renters' Rights Act abolished Section 21 and made assured shorthold tenancies periodic by default — do not describe a tenancy using fixed-term / Section 21 framing that predates this, and flag if the pack itself still refers to outdated terms.",
    "- Known defects or notices — Japanese knotweed, boundary disputes, planning enforcement",
    "",
    "Also extract, separately from the flags:",
    "- additionalFees: any buyer's premium, seller's legal cost reimbursement, or rental/income reimbursement stated in the special conditions, as exact £ figures — not estimates. Note explicitly whether VAT is stated as applying on top of each figure.",
    "- completion: the number of days from exchange to completion, and any specific completion deadline date, if stated.",
    "- itemsFound: which of the standard checklist items (asbestos report, EICR, gas safety certificate, EPC, searches, management pack, lease plan) you actually saw evidence of in this chunk — only what you can confirm, not what a pack would typically include.",
    "",
    "For each flag, write plain English a non-lawyer can act on, and note the page or section heading it came from if you can identify one. If you encounter handwritten annotations or sections too degraded to read confidently, list them in unreadableSections rather than guessing at their content.",
    "Call report_legal_pack_flags exactly once with your findings, even if the flags array is empty — that is the only way to report results.",
  ].join("\n");
}

function sanitizeFlag(f) {
  const categories = ["Tenure & lease terms", "Restrictive covenants", "Special conditions of sale", "Missing searches", "Tenancy information", "Known defects & notices", "Other"];
  const urgencies = ["Raise with solicitor before bidding", "Worth asking about", "Informational"];
  return {
    category: categories.includes(f && f.category) ? f.category : "Other",
    urgency: urgencies.includes(f && f.urgency) ? f.urgency : "Worth asking about",
    summary: String((f && f.summary) || ""),
    pageHint: String((f && f.pageHint) || ""),
  };
}

/* =================================================================================
   RE-CHECK LEAD STATUS — best-effort, not a guarantee. Tries a direct fetch of
   the lead's source URL first (works for plain server-rendered sites like many
   auction houses; confirmed by testing against a real one before building this),
   falls back to a fresh AI web search when the direct fetch is blocked (major
   portals like Zoopla run bot-detection challenges that a plain fetch can't get
   past — confirmed directly, not assumed). Always returns "checked, here's what
   we found" rather than silently changing a lead's status.
   ================================================================================= */

const STATUS_CHECK_MODEL = "claude-haiku-4-5-20251001"; // simple classification task, doesn't need Sonnet
const FETCH_TIMEOUT_MS = 10000;
const MIN_USEFUL_HTML_LENGTH = 2000; // shorter than this is almost always a bot-challenge or error shell, not a real page
const BLOCK_PAGE_MARKERS = /cloudflare|just a moment|captcha|access denied|are you a robot|enable javascript and cookies/i;

const STATUS_CHECK_TOOL = {
  name: "report_listing_status",
  description: "Report whether this property listing appears to still be live/available, based on the content or search results provided. Call this exactly once.",
  input_schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["still_live", "likely_gone", "could_not_determine"] },
      detail: { type: "string", description: "Brief explanation. Quote the relevant status text if you found one (e.g. a 'SOLD STC' badge or 'this listing is no longer available' message)." },
    },
    required: ["status", "detail"],
  },
};

function stripHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000); // keep the token cost of this small — it's a status check, not a research pass
}

exports.recheckLeadStatus = onCall({ secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 60 }, async (request) => {
  const email = (request.auth && request.auth.token && request.auth.token.email) || "";
  if (!request.auth || email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    throw new HttpsError("permission-denied", "Not authorized to use this feature.");
  }

  const sourceUrl = request.data && request.data.sourceUrl;
  const address = request.data && request.data.address;
  if (!sourceUrl && !address) {
    throw new HttpsError("invalid-argument", "Need at least a source URL or an address to check.");
  }

  // ---- Attempt 1: direct fetch of the source page ----
  if (sourceUrl) {
    try {
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 404 || res.status === 410) {
        return { status: "likely_gone", detail: `The source page returned ${res.status} — it may have been taken down.`, method: "direct_fetch", checkedAt: Date.now() };
      }
      if (res.ok) {
        const html = await res.text();
        const blocked = html.length < MIN_USEFUL_HTML_LENGTH || BLOCK_PAGE_MARKERS.test(html);
        if (!blocked) {
          const text = stripHtmlToText(html);
          const result = await classifyStatus(text, "direct_fetch");
          if (result) return result;
        }
      }
    } catch (e) {
      logger.error("Direct fetch failed for lead status re-check, falling back to search", e.message);
      // fall through to search
    }
  }

  // ---- Attempt 2: fresh AI web search (fallback when direct fetch is blocked or unavailable) ----
  const searchSubject = address || sourceUrl;
  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY.value(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: STATUS_CHECK_MODEL,
        max_tokens: 600,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }, STATUS_CHECK_TOOL],
        messages: [{
          role: "user",
          content: `Search for the current status of this property listing: "${searchSubject}"${sourceUrl ? ` (originally found at ${sourceUrl}, which could not be read directly)` : ""}. Determine whether it still appears to be live/available, or shows signs of being sold, under offer, withdrawn, or otherwise no longer available. Be honest if you can't find clear enough recent information to tell either way — that's a valid answer (could_not_determine), better than guessing. Call report_listing_status exactly once with your finding.`,
        }],
      }),
    });
  } catch (e) {
    throw new HttpsError("unavailable", "Couldn't reach the status-check service. Try again shortly.");
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    logger.error("Anthropic API returned an error (status re-check, search fallback)", res.status, bodyText);
    throw new HttpsError("internal", `The status-check service returned an error (${res.status}).`);
  }
  const data = await res.json();
  const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === "report_listing_status");
  if (!toolUse || !toolUse.input) {
    return { status: "could_not_determine", detail: "Couldn't determine a clear status from a fresh search either — worth checking the listing manually.", method: "web_search_fallback", checkedAt: Date.now() };
  }
  return {
    status: ["still_live", "likely_gone", "could_not_determine"].includes(toolUse.input.status) ? toolUse.input.status : "could_not_determine",
    detail: String(toolUse.input.detail || ""),
    method: "web_search_fallback",
    checkedAt: Date.now(),
  };
});

async function classifyStatus(pageText, method) {
  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY.value(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: STATUS_CHECK_MODEL,
        max_tokens: 400,
        tools: [STATUS_CHECK_TOOL],
        messages: [{ role: "user", content: `Here is the text content of a property listing page. Determine whether it appears still live/available, or shows it's sold, under offer, sale agreed, withdrawn, or otherwise no longer available. Call report_listing_status exactly once.\n\nPAGE TEXT:\n${pageText}` }],
      }),
    });
  } catch (e) {
    return null; // let the caller fall back to search
  }
  if (!res.ok) return null;
  const data = await res.json();
  const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === "report_listing_status");
  if (!toolUse || !toolUse.input) return null;
  return {
    status: ["still_live", "likely_gone", "could_not_determine"].includes(toolUse.input.status) ? toolUse.input.status : "could_not_determine",
    detail: String(toolUse.input.detail || ""),
    method,
    checkedAt: Date.now(),
  };
}

/* =================================================================================
   EPC REGISTER CHECK — real domestic Energy Performance Certificate data for a
   postcode, via MHCLG's "Get energy performance of buildings data" service.
   Unlike the crime/flood checks (fully open, no key), this genuinely requires a
   registered Bearer token, so it has to be proxied server-side — the token can
   never reach the browser. Endpoint, auth format, and response shape were all
   confirmed directly against the live API (including a real query for a
   Rochdale postcode) before writing this, not assumed from documentation for
   a different, now-retired version of the service.
   ================================================================================= */

const EPC_API_URL = process.env.EPC_API_URL_OVERRIDE || "https://api.get-energy-performance-data.communities.gov.uk/api/domestic/search";

exports.checkEpcRegister = onCall({ secrets: [EPC_API_KEY], cors: true, timeoutSeconds: 30 }, async (request) => {
  const email = (request.auth && request.auth.token && request.auth.token.email) || "";
  if (!request.auth || email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    throw new HttpsError("permission-denied", "Not authorized to use this feature.");
  }

  const postcode = request.data && request.data.postcode;
  if (!postcode || typeof postcode !== "string" || !postcode.trim()) {
    throw new HttpsError("invalid-argument", "Missing postcode.");
  }

  let res;
  try {
    res = await fetch(`${EPC_API_URL}?postcode=${encodeURIComponent(postcode.trim().replace(/\s+/g, ""))}`, {
      headers: { Authorization: `Bearer ${EPC_API_KEY.value()}`, Accept: "application/json" },
    });
  } catch (e) {
    logger.error("Network error calling EPC register", e);
    throw new HttpsError("unavailable", "Couldn't reach the EPC register. Try again shortly.");
  }

  if (res.status === 401 || res.status === 403) {
    logger.error("EPC register rejected the credentials", res.status);
    throw new HttpsError("failed-precondition", "The EPC register rejected the stored credentials — the API key may need refreshing at get-energy-performance-data.communities.gov.uk.");
  }
  if (!res.ok && res.status !== 404) {
    const bodyText = await res.text().catch(() => "");
    logger.error("EPC register returned an error", res.status, bodyText.slice(0, 300));
    throw new HttpsError("internal", `The EPC register returned an error (${res.status}).`);
  }

  const json = await res.json().catch(() => null);
  const rawResults = json && Array.isArray(json.data) ? json.data : [];
  // "No certificates found" comes back as {data: {error: "..."}} rather than a
  // 404 or an empty array — treated as a normal, valid zero-result answer, not
  // a failure — confirmed directly against the live API on a residential
  // postcode with no registered EPCs.

  // A property can have several certificates over time as it's re-assessed —
  // keep only the most recent one per UPRN so this reads as "current status",
  // not a jumbled history.
  const byUprn = new Map();
  for (const cert of rawResults) {
    const key = cert.uprn || cert.addressLine1;
    const existing = byUprn.get(key);
    if (!existing || String(cert.registrationDate) > String(existing.registrationDate)) {
      byUprn.set(key, cert);
    }
  }
  const properties = Array.from(byUprn.values())
    .sort((a, b) => String(b.registrationDate).localeCompare(String(a.registrationDate)))
    .slice(0, 20)
    .map((c) => ({
      address: [c.addressLine1, c.addressLine2, c.addressLine3, c.addressLine4].filter(Boolean).join(", "),
      band: c.currentEnergyEfficiencyBand || "Unknown",
      registrationDate: c.registrationDate || "",
      certificateNumber: c.certificateNumber || "",
    }));

  return {
    postcode: postcode.trim(),
    totalCertificatesFound: rawResults.length,
    properties,
    checkedAt: Date.now(),
  };
});

/* =================================================================================
   MARKET STATS — Land Registry Price Paid SPARQL query per postcode district.
   Stores median sold price, YoY change, transaction count, and 10-year sparkline
   by property type in the shared marketStats/{district} Firestore collection.
   marketStats is a ROOT collection (not per-user) — intentional single-user exception
   to the subcollection pattern. Do not move under users/{uid}/ without a data migration.
   Written by Cloud Function only; client reads via onSnapshot (rule: allow read
   for authenticated ALLOWED_EMAIL, allow write: false).
   Land Registry covers England and Wales only — see refreshMarketStats for Scotland/NI handling.
   ================================================================================= */

const LAND_REGISTRY_SPARQL = "https://landregistry.data.gov.uk/landregistry/query";
// Default districts to refresh on schedule — user's primary sourcing areas
const SCHEDULED_DISTRICTS = ["OL11", "OL12", "OL16", "OL1", "OL2", "OL4", "OL6", "SK15"];
const MARKET_STATS_ATTRIBUTION = "Contains HM Land Registry data © Crown copyright and database right. Licensed under the Open Government Licence v3.0.";

function computeMedian(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function mapLrPropertyType(uri) {
  if (!uri) return null;
  const u = String(uri).toLowerCase();
  if (u.includes("terraced")) return "Terrace";
  if (u.includes("semi-detached") || u.includes("semidetached")) return "Semi";
  if (u.includes("detached")) return "Detached";
  if (u.includes("flat") || u.includes("maisonette")) return "Flat";
  return null;
}

async function fetchDistrictTransactions(district) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 11); // 11 years: 10 annual sparkline + YoY coverage
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const query = `
    PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
    PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT ?amount ?date ?propType WHERE {
      ?trans lrppi:pricePaid ?amount ;
             lrppi:transactionDate ?date ;
             lrppi:propertyType ?propType ;
             lrppi:propertyAddress/lrcommon:postcode ?postcode .
      FILTER(STRSTARTS(STR(?postcode), "${district} "))
      FILTER(?date >= "${cutoffStr}"^^xsd:date)
    } LIMIT 10000`;

  const url = `${LAND_REGISTRY_SPARQL}?output=json&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Land Registry SPARQL returned ${res.status} for district ${district}`);
  const json = await res.json();
  const rows = (json.results && json.results.bindings) || [];
  return rows
    .map((r) => ({
      amount: Number((r.amount && r.amount.value) || 0),
      date: String((r.date && r.date.value) || ""),
      type: mapLrPropertyType(r.propType && r.propType.value),
    }))
    .filter((r) => r.amount > 10000 && r.date.length === 10 && r.type);
}

function buildMarketStatsByType(transactions) {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const cut12m = new Date(now); cut12m.setFullYear(cut12m.getFullYear() - 1);
  const cut24m = new Date(now); cut24m.setFullYear(cut24m.getFullYear() - 2);
  const startYear = now.getFullYear() - 10;

  const byType = {};
  for (const type of ["Terrace", "Semi", "Detached", "Flat"]) {
    const all = transactions.filter((t) => t.type === type);
    const last12m = all.filter((t) => t.date >= iso(cut12m));
    const prev12m = all.filter((t) => t.date >= iso(cut24m) && t.date < iso(cut12m));

    const medianLast12m = computeMedian(last12m.map((t) => t.amount));
    const medianPrev12m = computeMedian(prev12m.map((t) => t.amount));
    const yoyChangePct = (medianLast12m && medianPrev12m)
      ? (medianLast12m - medianPrev12m) / medianPrev12m
      : null;

    const byYear = {};
    for (const t of all) {
      const yr = parseInt(t.date.slice(0, 4), 10);
      if (yr >= startYear) {
        if (!byYear[yr]) byYear[yr] = [];
        byYear[yr].push(t.amount);
      }
    }
    const sparkline = Object.entries(byYear)
      .map(([yr, prices]) => ({ year: parseInt(yr, 10), median: Math.round(computeMedian(prices)), count: prices.length }))
      .filter((s) => s.median > 0)
      .sort((a, b) => a.year - b.year);

    byType[type] = { medianLast12m, medianPrev12m, yoyChangePct, transactionsLast12m: last12m.length, sparkline };
  }
  return byType;
}

exports.refreshMarketStats = onCall({ cors: true, timeoutSeconds: 120 }, async (request) => {
  const email = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
  if (!request.auth || email !== ALLOWED_EMAIL.toLowerCase()) {
    throw new HttpsError("permission-denied", "Not authorized.");
  }
  const district = ((request.data && request.data.district) || "").trim().toUpperCase();
  if (!district || !/^[A-Z]{1,2}\d{1,2}$/.test(district)) {
    throw new HttpsError("invalid-argument", "Provide a valid postcode district (e.g. OL11).");
  }
  // Land Registry Price Paid covers England and Wales only.
  const districtArea = district.replace(/\d.*/, "");
  const SCOTLAND_AREAS = new Set(["AB","DD","DG","EH","FK","G","HS","IV","KA","KW","KY","ML","PA","PH","TD","ZE"]);
  if (districtArea === "BT") {
    return { notAvailable: true, district, reason: "Land Registry Price Paid data covers England and Wales only. Northern Ireland price data is available from Land & Property Services (lpsni.gov.uk)." };
  }
  if (SCOTLAND_AREAS.has(districtArea)) {
    return { notAvailable: true, district, reason: "Land Registry Price Paid data covers England and Wales only. Scottish price data is available from Registers of Scotland (ros.gov.uk)." };
  }
  try {
    const transactions = await fetchDistrictTransactions(district);
    if (!transactions.length) {
      throw new HttpsError("not-found", `No Price Paid records found for district ${district} in the last 11 years.`);
    }
    const byType = buildMarketStatsByType(transactions);
    const record = {
      district,
      updatedAt: Date.now(),
      transactionsFetched: transactions.length,
      source: "Land Registry Price Paid Data",
      attribution: MARKET_STATS_ATTRIBUTION,
      byType,
    };
    const db = getFirestore();
    await db.collection("marketStats").doc(district).set(record);
    return { district, transactionsFetched: transactions.length, updatedAt: record.updatedAt };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("refreshMarketStats failed", district, e);
    throw new HttpsError("internal", `Could not refresh market stats for ${district}: ${e.message}`);
  }
});

/* =================================================================================
   ESTATELY WEBHOOK — Phase 1 integration.
   Receives Playbook push (lot.matched) from Estately, verifies HMAC-SHA256
   signature, maps the lot to a DealsDash lead, and writes to
   users/{uid}/leads/{id} with source="estately", pipelineStage="Watching".

   Setup (one-time):
   1. firebase functions:secrets:set ESTATELY_API_KEY
      firebase functions:secrets:set ESTATELY_WEBHOOK_SECRET
   2. firebase deploy --only functions:estatelyWebhook
   3. Copy the deployed HTTPS URL from Firebase Console.
   4. In Estately account dashboard → Playbooks → create one Playbook:
        postcode_prefix: OL, SK  ·  property_category: Terrace, Semi
        guide_max: 150000  ·  estately_score_min: 52
      Set webhook URL to the Cloud Function HTTPS URL.
   5. Under Playbook settings, copy the webhook signing secret and run:
      firebase functions:secrets:set ESTATELY_WEBHOOK_SECRET
   ================================================================================= */

// UID cached across warm invocations — avoids an Auth lookup on every webhook call.
let _estatelyOwnerUid = null;
async function _getEstatelyOwnerUid() {
  if (!_estatelyOwnerUid) {
    const user = await getAdminAuth().getUserByEmail(ALLOWED_EMAIL);
    _estatelyOwnerUid = user.uid;
  }
  return _estatelyOwnerUid;
}

function _mapPropertyCategory(category) {
  if (!category) return "Terrace";
  const c = String(category).toLowerCase();
  if (c.includes("terraced") || c.includes("terrace")) return "Terrace";
  if (c.includes("semi")) return "Semi";
  if (c.includes("detached")) return "Detached";
  if (c.includes("flat") || c.includes("apartment") || c.includes("maisonette")) return "Flat";
  return "Terrace";
}

function _mapLotToLead(lot) {
  const auctionDate = lot.end_time ? String(lot.end_time).slice(0, 10) : "";
  return {
    id: `estately_${lot.lot_id}`,
    address: String(lot.address || ""),
    postcode: String(lot.postcode || ""),
    propertyType: _mapPropertyCategory(lot.property_category),
    bedrooms: Number(lot.bedrooms) || 0,
    guidePrice: Number(lot.guide_price_gbp) || 0,
    auctionDate,
    auctionHouse: String(lot.auction_house || ""),
    source: "estately",
    sourceUrl: String(lot.lot_url || lot.display?.share_url || ""),
    estatelyShareUrl: String(lot.display?.share_url || ""),
    estatelyLotId: String(lot.lot_id),
    estatelyScore: lot.estately_score ?? null,
    pipelineStage: "Watching",
    status: "new",
    dateAdded: Date.now(),
    // Area intelligence pre-populated — reduces need for separate postcodes.io / IMD calls
    areaIntelligence: {
      imd: lot.imd_decile != null ? { decile: lot.imd_decile } : null,
      marketStats: {
        areaMedianPriceGbp: lot.area_median_price_gbp ?? null,
        areaPriceYoyPct: lot.area_price_yoy_pct ?? null,
        areaPriceMomentumDecile: lot.area_price_momentum_decile ?? null,
      },
    },
    // ARV from Estately pre-populates resale range — user confirms before appraisal
    estResaleLow: lot.arv_gbp ? Math.round(Number(lot.arv_gbp) * 0.95) : 0,
    estResaleHigh: Number(lot.arv_gbp) || 0,
    estRefurb: 0,
    estLegalFinance: 0,
    comparables: [],
    riskNotes: "",
    signals: [],
    sellerType: "unknown",
    triage: {
      areaKnown: null, assetTypeFits: null, conditionAddsValue: null,
      sellerMotivated: null, guideSensible: null, valueAddClear: null,
      liquid12m: null, areaStrong: null,
    },
  };
}

exports.estatelyWebhook = onRequest(
  { secrets: [ESTATELY_WEBHOOK_SECRET, ESTATELY_API_KEY], cors: false, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // Verify HMAC-SHA256 signature
    const signature = req.headers["x-estately-signature"];
    if (!signature) {
      logger.warn("estatelyWebhook: missing X-Estately-Signature header");
      return res.status(401).json({ error: "Missing signature" });
    }
    const rawBody = req.rawBody;
    if (!rawBody) return res.status(400).json({ error: "Empty body" });

    let computed;
    try {
      computed = crypto.createHmac("sha256", ESTATELY_WEBHOOK_SECRET.value()).update(rawBody).digest("hex");
    } catch (e) {
      logger.error("estatelyWebhook: HMAC computation failed — webhook secret may not be set", e.message);
      return res.status(500).json({ error: "Signature check failed" });
    }

    const sigBuf = Buffer.from(signature.length === computed.length ? signature : "0".repeat(computed.length));
    const compBuf = Buffer.from(computed);
    if (!crypto.timingSafeEqual(sigBuf, compBuf)) {
      logger.warn("estatelyWebhook: signature mismatch — possible replay or wrong secret");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const eventType = req.headers["x-estately-event"];
    // Only process lot.matched in Phase 1; acknowledge other events without action
    if (eventType !== "lot.matched") {
      logger.info(`estatelyWebhook: acknowledged ${eventType} (not processed in Phase 1)`);
      return res.status(200).json({ received: true, processed: false, reason: "event_not_handled" });
    }

    let body;
    try {
      body = typeof req.body === "object" ? req.body : JSON.parse(rawBody.toString("utf8"));
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const lot = body.lot;
    if (!lot || !lot.lot_id) {
      logger.error("estatelyWebhook: missing lot or lot_id in payload", JSON.stringify(body).slice(0, 300));
      return res.status(400).json({ error: "Missing lot data" });
    }

    let uid;
    try {
      uid = await _getEstatelyOwnerUid();
    } catch (e) {
      logger.error("estatelyWebhook: could not resolve owner UID", e.message);
      return res.status(500).json({ error: "Owner UID resolution failed" });
    }

    const lead = _mapLotToLead(lot);
    const db = getFirestore();

    // Idempotent write — same lot_id always maps to the same lead id, so a
    // webhook retry or duplicate delivery overwrites rather than duplicates.
    await db.collection("users").doc(uid).collection("leads").doc(lead.id).set(lead);

    logger.info(`estatelyWebhook: lead written — ${lead.id} (${lead.address}) guide £${lead.guidePrice} score ${lead.estatelyScore} delivery=${body.delivery_id}`);
    return res.status(200).json({ received: true, processed: true, leadId: lead.id });
  }
);

/* =================================================================================
   NOTIFICATIONS — daily digest (07:00 London) + instant alerts (every 15 min).
   Reads leads/deals, checks configured triggers, deduplicates against existing
   notifications, writes to users/{uid}/notifications and queues email via
   mail/{id} for the Firebase "Trigger Email from Firestore" extension.

   Setup (one-time, after deploying):
   1. Install Firebase "Trigger Email from Firestore" extension from the Console.
      Collection path: mail  ·  SMTP URI: smtps://resend:<API_KEY>@smtp.resend.com:465
      (Resend free tier: 3 000 emails/month; sender domain alerts@vixiv.co.uk)
   2. Add SPF/DKIM DNS records for vixiv.co.uk per Resend dashboard instructions.
   3. Set ALLOWED_EMAIL in Resend sender config.
   ================================================================================= */

async function _getOwnerUid() {
  const user = await getAdminAuth().getUserByEmail(ALLOWED_EMAIL);
  return user.uid;
}

async function _notifExists(db, uid, dedupeKey) {
  const snap = await db.collection("users").doc(uid).collection("notifications")
    .where("dedupeKey", "==", dedupeKey).limit(1).get();
  return !snap.empty;
}

function _notifId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function _todayLondon() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function _addDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function _escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function _queueEmail(db, toEmail, subject, html) {
  const id = "email_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  await db.collection("mail").doc(id).set({
    to: [toEmail],
    message: { subject, html, text: subject },
    createdAt: Date.now(),
  });
}

function _buildDigestHtml({ date, actionItems, dealCards, placeholderCount }) {
  const actionHtml = actionItems.length
    ? `<div style="margin-bottom:20px"><div style="font-weight:600;color:#111827;font-size:14px;margin-bottom:8px">Needs attention</div>${
        actionItems.slice(0, 3).map(a =>
          `<div style="background:#fef3c7;border-left:3px solid #d97706;padding:10px 14px;margin-bottom:8px;border-radius:4px;font-size:14px;color:#92400e">${_escHtml(a)}</div>`
        ).join("")
      }</div>`
    : "";
  const cardsHtml = dealCards.length
    ? `<div style="margin-bottom:20px"><div style="font-weight:600;color:#111827;font-size:14px;margin-bottom:8px">Deal updates</div>${
        dealCards.map(c =>
          `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:10px"><div style="font-weight:600;font-size:14px;color:#111827">${_escHtml(c.title)}</div><div style="font-size:13px;color:#6b7280;margin-top:4px">${_escHtml(c.body)}</div></div>`
        ).join("")
      }</div>`
    : "";
  const footerNote = placeholderCount > 0
    ? `<div style="margin-bottom:6px">${placeholderCount} deal${placeholderCount !== 1 ? "s" : ""} still have illustrative assumptions &mdash; open each deal to confirm real figures.</div>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:600px;margin:0 auto">
<div style="background:#1a1a2e;color:#fff;padding:24px 28px"><div style="font-size:20px;font-weight:600">DealsDash</div><div style="font-size:13px;opacity:0.65;margin-top:4px">Daily Digest &mdash; ${_escHtml(date)}</div></div>
<div style="background:#fff;padding:24px 28px">${actionHtml}${cardsHtml}${!actionItems.length && !dealCards.length ? '<div style="color:#6b7280;font-size:14px">No updates today &mdash; pipeline looks clear.</div>' : ""}</div>
<div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;font-size:12px;color:#9ca3af">${footerNote}<div>VIXIV LTD &middot; Automated report from your private deal tracker.</div></div>
</div></body></html>`;
}

function _buildAlertHtml({ title, body }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:600px;margin:0 auto">
<div style="background:#1a1a2e;color:#fff;padding:20px 28px"><div style="font-size:18px;font-weight:600">DealsDash</div></div>
<div style="background:#fff;padding:24px 28px"><div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:8px">${_escHtml(title)}</div><div style="font-size:14px;color:#6b7280">${_escHtml(body)}</div></div>
<div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 28px;font-size:12px;color:#9ca3af">VIXIV LTD &middot; Automated alert from your private deal tracker.</div>
</div></body></html>`;
}

exports.scheduledDailyDigest = onSchedule(
  { schedule: "0 7 * * *", timeZone: "Europe/London", timeoutSeconds: 120 },
  async () => {
    const db = getFirestore();
    let uid;
    try { uid = await _getOwnerUid(); } catch (e) {
      logger.error("scheduledDailyDigest: could not resolve owner UID", e.message); return;
    }

    const settingsSnap = await db.collection("users").doc(uid).collection("settings").doc("app").get();
    const notifCfg = (settingsSnap.exists ? settingsSnap.data().notifications : null) || {};
    if (notifCfg.enabled === false) return;
    const triggers = notifCfg.triggers || {};
    const today = _todayLondon();
    const in7d = _addDays(today, 7);
    const emailTo = notifCfg.emailAddress || ALLOWED_EMAIL;
    const maxCards = Number(notifCfg.maxCards) || 5;

    const [leadsSnap, dealsSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("leads").get(),
      db.collection("users").doc(uid).collection("deals").get(),
    ]);
    const leads = leadsSnap.docs.map(d => d.data());
    const deals = dealsSnap.docs.map(d => d.data());

    const actionItems = [];
    const notifs = [];

    // auctionApproaching_7d
    if (triggers.auctionApproaching !== false) {
      for (const lead of leads) {
        if (!lead.auctionDate || lead.status === "rejected" || lead.status === "promoted") continue;
        if (lead.auctionDate <= today || lead.auctionDate > in7d) continue;
        const dk = `auctionApproaching_7d:${lead.id}:${today}`;
        if (await _notifExists(db, uid, dk)) continue;
        const daysLeft = Math.ceil((new Date(lead.auctionDate + "T12:00:00Z") - new Date(today + "T12:00:00Z")) / 86400000);
        const title = `Auction in ${daysLeft}d — ${lead.address || lead.id}`;
        const body = `Guide: £${Number(lead.guidePrice || 0).toLocaleString("en-GB")} · ${lead.auctionDate}`;
        notifs.push({ id: _notifId(), type: "auctionApproaching_7d", entityType: "lead", entityId: lead.id, title, body, dedupeKey: dk, createdAt: Date.now(), readAt: null, channels: { email: null, push: null } });
        actionItems.push(title);
      }
    }

    // closingToday
    if (triggers.closingToday !== false) {
      for (const lead of leads) {
        if (lead.auctionDate !== today || lead.status === "rejected" || lead.status === "promoted") continue;
        const dk = `closingToday:${lead.id}:${today}`;
        if (await _notifExists(db, uid, dk)) continue;
        const title = `Closing today — ${lead.address || lead.id}`;
        const body = `Guide: £${Number(lead.guidePrice || 0).toLocaleString("en-GB")}`;
        notifs.push({ id: _notifId(), type: "closingToday", entityType: "lead", entityId: lead.id, title, body, dedupeKey: dk, createdAt: Date.now(), readAt: null, channels: { email: null, push: null } });
        actionItems.push(title);
      }
    }

    // outcomeDue — auction passed, not promoted or rejected
    if (triggers.outcomeDue !== false) {
      for (const lead of leads) {
        if (!lead.auctionDate || lead.auctionDate >= today) continue;
        if (lead.status === "promoted" || lead.status === "rejected") continue;
        const dk = `outcomeDue:${lead.id}:${today}`;
        if (await _notifExists(db, uid, dk)) continue;
        const title = `Outcome needed — ${lead.address || lead.id}`;
        const body = `Auction was ${lead.auctionDate} — mark promoted or rejected`;
        notifs.push({ id: _notifId(), type: "outcomeDue", entityType: "lead", entityId: lead.id, title, body, dedupeKey: dk, createdAt: Date.now(), readAt: null, channels: { email: null, push: null } });
      }
    }

    // staleDeal — deal.updatedAt older than 14 days (only fires if field is present)
    if (triggers.staleDeal !== false) {
      const staleCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      for (const deal of deals) {
        if (!deal.updatedAt || deal.updatedAt > staleCutoff) continue;
        if (deal.status === "Completed" || deal.status === "Withdrawn") continue;
        const dk = `staleDeal:${deal.id}:${today}`;
        if (await _notifExists(db, uid, dk)) continue;
        const title = `Stale deal — ${deal.name || deal.address || deal.id}`;
        notifs.push({ id: _notifId(), type: "staleDeal", entityType: "deal", entityId: deal.id, title, body: "No update in 14+ days", dedupeKey: dk, createdAt: Date.now(), readAt: null, channels: { email: null, push: null } });
      }
    }

    // placeholderAssumptions — fees.other still at default £200
    if (triggers.placeholderAssumptions !== false) {
      for (const deal of deals) {
        if (!deal.fees || deal.fees.other !== 200 || deal.status === "Completed") continue;
        const dk = `placeholderAssumptions:${deal.id}:${today}`;
        if (await _notifExists(db, uid, dk)) continue;
        const title = `Placeholder fees — ${deal.name || deal.address || deal.id}`;
        notifs.push({ id: _notifId(), type: "placeholderAssumptions", entityType: "deal", entityId: deal.id, title, body: "“Other” fee is still at the default £200 — update if a buyer premium applies", dedupeKey: dk, createdAt: Date.now(), readAt: null, channels: { email: null, push: null } });
      }
    }

    if (!notifs.length) { logger.info("scheduledDailyDigest: no new notifications today"); return; }

    const batch = db.batch();
    for (const n of notifs) batch.set(db.collection("users").doc(uid).collection("notifications").doc(n.id), n);
    await batch.commit();

    const cards = notifs.slice(0, maxCards).map(n => ({ title: n.title, body: n.body }));
    const html = _buildDigestHtml({
      date: new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }),
      actionItems,
      dealCards: cards,
      placeholderCount: notifs.filter(n => n.type === "placeholderAssumptions").length,
    });
    await _queueEmail(db, emailTo, `DealsDash Daily Digest — ${today}`, html);
    logger.info(`scheduledDailyDigest: ${notifs.length} notifications queued, email to ${emailTo}`);
  }
);

exports.scheduledInstantAlerts = onSchedule(
  { schedule: "*/15 * * * *", timeZone: "Europe/London", timeoutSeconds: 60 },
  async () => {
    const db = getFirestore();
    let uid;
    try { uid = await _getOwnerUid(); } catch (e) {
      logger.error("scheduledInstantAlerts: could not resolve owner UID", e.message); return;
    }

    const settingsSnap = await db.collection("users").doc(uid).collection("settings").doc("app").get();
    const notifCfg = (settingsSnap.exists ? settingsSnap.data().notifications : null) || {};
    if (notifCfg.enabled === false) return;
    const triggers = notifCfg.triggers || {};
    const today = _todayLondon();
    const tomorrow = _addDays(today, 1);
    const emailTo = notifCfg.emailAddress || ALLOWED_EMAIL;
    const windowMs = 20 * 60 * 1000;

    const [leadsSnap, dealsSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("leads").get(),
      db.collection("users").doc(uid).collection("deals").get(),
    ]);
    const leads = leadsSnap.docs.map(d => d.data());
    const deals = dealsSnap.docs.map(d => d.data());
    const notifs = [];

    // auctionApproaching_1d — auction tomorrow
    if (triggers.auctionApproaching !== false) {
      for (const lead of leads) {
        if (lead.auctionDate !== tomorrow || lead.status === "rejected" || lead.status === "promoted") continue;
        const dk = `auctionApproaching_1d:${lead.id}:${today}`;
        if (await _notifExists(db, uid, dk)) continue;
        const title = `Auction tomorrow — ${lead.address || lead.id}`;
        const body = `Guide: £${Number(lead.guidePrice || 0).toLocaleString("en-GB")} · Last chance to review`;
        notifs.push({ id: _notifId(), type: "auctionApproaching_1d", entityType: "lead", entityId: lead.id, title, body, dedupeKey: dk, createdAt: Date.now(), readAt: null, channels: { email: null, push: null } });
      }
    }

    // gatesIncomplete — leads added in last window with incomplete triage
    if (triggers.gatesIncomplete !== false) {
      const cutoff = Date.now() - windowMs;
      for (const lead of leads) {
        if (!lead.dateAdded || lead.dateAdded < cutoff) continue;
        if (!lead.triage || lead.triage.result !== "incomplete" || lead.status === "rejected") continue;
        const dk = `gatesIncomplete:${lead.id}:${today}`;
        if (await _notifExists(db, uid, dk)) continue;
        const openCount = Object.values(lead.triage).filter(v => v === null).length;
        const title = `Triage incomplete — ${lead.address || lead.id}`;
        notifs.push({ id: _notifId(), type: "gatesIncomplete", entityType: "lead", entityId: lead.id, title, body: `${openCount} triage gate${openCount !== 1 ? "s" : ""} still open`, dedupeKey: dk, createdAt: Date.now(), readAt: null, channels: { email: null, push: null } });
      }
    }

    // legalPackReady — deal with legal pack review completed in last window
    if (triggers.legalPackReady !== false) {
      const cutoff = Date.now() - windowMs;
      for (const deal of deals) {
        if (!deal.legalPackReview || !deal.legalPackReview.reviewedAt || deal.legalPackReview.reviewedAt < cutoff) continue;
        const dk = `legalPackReady:${deal.id}:${today}`;
        if (await _notifExists(db, uid, dk)) continue;
        const critical = (deal.legalPackReview.flags || []).filter(f => f.urgency === "Raise with solicitor before bidding").length;
        const title = `Legal pack reviewed — ${deal.name || deal.address || deal.id}`;
        const body = critical > 0 ? `${critical} critical flag${critical !== 1 ? "s" : ""} — raise with solicitor before bidding` : `${(deal.legalPackReview.flags || []).length} flags found`;
        notifs.push({ id: _notifId(), type: "legalPackReady", entityType: "deal", entityId: deal.id, title, body, dedupeKey: dk, createdAt: Date.now(), readAt: null, channels: { email: null, push: null } });
      }
    }

    if (!notifs.length) return;

    const batch = db.batch();
    for (const n of notifs) batch.set(db.collection("users").doc(uid).collection("notifications").doc(n.id), n);
    await batch.commit();

    for (const n of notifs) {
      await _queueEmail(db, emailTo, `DealsDash: ${n.title}`, _buildAlertHtml({ title: n.title, body: n.body }));
    }
    logger.info(`scheduledInstantAlerts: ${notifs.length} alerts queued, emails to ${emailTo}`);
  }
);

exports.scheduledMarketStatsRefresh = onSchedule(
  { schedule: "0 2 1 * *", timeZone: "Europe/London", timeoutSeconds: 540 },
  async () => {
    const db = getFirestore();
    for (const district of SCHEDULED_DISTRICTS) {
      try {
        const transactions = await fetchDistrictTransactions(district);
        if (!transactions.length) {
          logger.warn(`scheduledMarketStatsRefresh: no transactions for ${district}`);
          continue;
        }
        const byType = buildMarketStatsByType(transactions);
        await db.collection("marketStats").doc(district).set({
          district,
          updatedAt: Date.now(),
          transactionsFetched: transactions.length,
          source: "Land Registry Price Paid Data",
          attribution: MARKET_STATS_ATTRIBUTION,
          byType,
        });
        logger.info(`scheduledMarketStatsRefresh: ${district} done (${transactions.length} transactions)`);
      } catch (e) {
        logger.error(`scheduledMarketStatsRefresh: ${district} failed`, e.message);
      }
    }
  }
);

