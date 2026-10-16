// Flag helpers — derived from a completed schedule result.
// All flag logic is also inlined in schedule.js; this module re-exports
// for external consumers and adds bridge-term check.

import { monthOf } from './calendar.js';

/**
 * Compute all programme flags from a completed schedule result and deal metadata.
 * bridgeTerm — bridge loan term in months (from deal inputs).
 * programmeMonths — calendar months from completion → saleCompleted.
 */
export function computeFlags(scheduleResult, { bridgeTerm = null } = {}) {
  const { keyDates, activities } = scheduleResult;
  const byId = Object.fromEntries(activities.map(a => [a.id, a]));

  const e2m = monthOf(byId['E2'].start);
  const h2m = monthOf(byId['H2'].start);

  const financeLate      = byId['A11'].finish > byId['A12'].finish;
  const winterExternal   = e2m === 11 || e2m === 12 || e2m === 1 || e2m === 2;
  const slowMonthListing = h2m === 8 || h2m === 11 || h2m === 12;

  let bridgeTermExceeded = false;
  if (bridgeTerm != null && keyDates.completion && keyDates.saleCompleted) {
    const d0 = new Date(keyDates.completion    + 'T00:00:00Z');
    const d1 = new Date(keyDates.saleCompleted + 'T00:00:00Z');
    const calDays = Math.round((d1 - d0) / 86400000);
    const months = calDays / 30.4375; // average days per month
    bridgeTermExceeded = months > bridgeTerm;
  }

  return { financeLate, winterExternal, slowMonthListing, bridgeTermExceeded };
}
