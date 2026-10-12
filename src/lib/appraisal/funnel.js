/* Sourcing funnel maths — pure JS, no React/Firebase/DOM dependencies.
   Inputs: lead[] where each lead has viewings[].
   Viewing shape: { id, date (YYYY-MM-DD), type, agentId, offerMade, offerAmount,
                    outcome ("none"|"accepted"|"rejected"|"standing"|"withdrawn"),
                    followUpDate (YYYY-MM-DD), notes } */

import { round2 } from "../utils.js";

// Aggregate viewings/offers/accepted for a specific YYYY-MM month string.
// Pass yearMonth = null to aggregate all time.
export function calcFunnelMonth(leads, yearMonth) {
  let viewings = 0, offers = 0, accepted = 0;
  for (const lead of leads) {
    for (const v of (lead.viewings || [])) {
      if (yearMonth && v.date?.slice(0, 7) !== yearMonth) continue;
      viewings++;
      if (v.offerMade) offers++;
      if (v.outcome === "accepted") accepted++;
    }
  }
  return {
    viewings,
    offers,
    accepted,
    offerRate:  viewings > 0 ? round2(offers   / viewings) : 0, // offers ÷ viewings
    acceptRate: offers   > 0 ? round2(accepted / offers)   : 0, // accepted ÷ offers
  };
}

// Aggregate viewings/offers/accepted over a rolling window of N complete + current months.
export function calcFunnelRolling(leads, months = 3) {
  const now = new Date();
  // First day of the earliest month in the window
  const from = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const fromStr = from.toISOString().slice(0, 7); // YYYY-MM
  let viewings = 0, offers = 0, accepted = 0;
  for (const lead of leads) {
    for (const v of (lead.viewings || [])) {
      if (!v.date || v.date.slice(0, 7) < fromStr) continue;
      viewings++;
      if (v.offerMade) offers++;
      if (v.outcome === "accepted") accepted++;
    }
  }
  return {
    months,
    viewings,
    offers,
    accepted,
    offerRate:  viewings > 0 ? round2(offers   / viewings) : 0,
    acceptRate: offers   > 0 ? round2(accepted / offers)   : 0,
  };
}

// Standing offers — viewings with outcome === "standing", sorted by followUpDate ascending.
// Returns [{ lead, viewing }] — earliest follow-up date first; no-date entries last.
export function sortStandingOffers(leads) {
  const out = [];
  for (const lead of leads) {
    for (const v of (lead.viewings || [])) {
      if (v.outcome === "standing") out.push({ lead, viewing: v });
    }
  }
  return out.sort((a, b) => {
    const da = a.viewing.followUpDate || "9999-12-31";
    const db = b.viewing.followUpDate || "9999-12-31";
    return da.localeCompare(db);
  });
}

// Pace — "At this rate, ~N deals/year". Based on accepted outcomes in rolling period.
// Labelled illustrative — training data not a reliable predictor.
export function calcPaceIndicator(leads, months = 3) {
  if (months <= 0) return null;
  const { accepted } = calcFunnelRolling(leads, months);
  const perYear = round2((accepted / months) * 12);
  return { perYear, basedOnMonths: months };
}

// Follow-up flag — true when the follow-up date is today or in the past.
export function isFollowUpDue(viewing) {
  if (!viewing.followUpDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return viewing.followUpDate <= today;
}
