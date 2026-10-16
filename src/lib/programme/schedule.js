// Pure scheduler. No React, no Firebase.
// schedule(template, inputs, holidays, actuals) → { status, activities, keyDates, flags }
// actuals = { [activityId]: { finish } } — actual finish overrides the forecast finish.

import {
  addWorkdays,
  addCalendarDays,
  ceilWorkday,
  networkdays,
  monthOf,
} from './calendar.js';

export function schedule(template, inputs, holidays = [], actuals = {}) {
  // ── Validate ────────────────────────────────────────────────────────────────
  const missing = [];
  if (!inputs.dealSecured) missing.push('dealSecured');
  if (!inputs.route) missing.push('route');
  if (missing.length > 0) return { status: 'incomplete', missing };

  const contingencyPct        = inputs.contingencyPct        ?? 0.15;
  const winterDryingExtra     = inputs.winterDryingExtra     ?? 3;
  const auctionCompletionDays = inputs.auctionCompletionDays ?? 28;
  const agentExchangeToCompl  = inputs.agentExchangeToCompletion ?? 10;

  const byId = {};
  const activities = [];

  for (const def of template) {
    // ── Applicability ─────────────────────────────────────────────────────────
    const appliesToRoute = def.route === 'both' || def.route === inputs.route;
    const appliesToScope = !def.scopeSwitch || Boolean(inputs.scope?.[def.scopeSwitch]);
    const applies = appliesToRoute && appliesToScope;

    // ── Effective lag (lagParam overrides the template default) ───────────────
    let lag = def.lag ?? 0;
    if (def.lagParam != null && inputs[def.lagParam] != null) {
      lag = inputs[def.lagParam] + (def.lagOffset ?? 0);
    }

    // ── Start: latest predecessor constraint ──────────────────────────────────
    let start;
    if (def.preds.length === 0) {
      start = inputs.dealSecured;
    } else {
      start = null;
      for (const pred of def.preds) {
        const p = byId[pred.id];
        if (!p) continue;
        const candidate = pred.type === 'FS'
          ? addWorkdays(p.finish, 1 + lag, holidays)
          : addWorkdays(p.start,  lag,     holidays);
        if (start === null || candidate > start) start = candidate;
      }
      if (start === null) start = inputs.dealSecured;
    }

    // Actual start override
    if (actuals[def.id]?.start) start = actuals[def.id].start;

    // ── Finish and durationUsed ───────────────────────────────────────────────
    let finish, durationUsed;

    if (def.completionActivity) {
      // A12 — route-specific completion date
      if (inputs.route === 'auction') {
        const rawDate = addCalendarDays(inputs.dealSecured, auctionCompletionDays);
        finish = ceilWorkday(rawDate, holidays);
      } else {
        // agent: max(exchange + agentExchangeToCompletion WD, lender legals + 1 WD)
        const fromExchange = addWorkdays(byId['A10'].finish, agentExchangeToCompl, holidays);
        const fromLender   = addWorkdays(byId['A11'].finish, 1, holidays);
        finish = fromExchange > fromLender ? fromExchange : fromLender;
      }
      start = finish; // milestone
      durationUsed = 0;

    } else if (!applies) {
      // Pass-through: finish = addWorkdays(start, −1); successors driven by start
      finish = addWorkdays(start, -1, holidays);
      durationUsed = 0;

    } else {
      // Normal activity
      const baseDur = inputs.route === 'auction' ? def.durAuction : def.durAgent;
      let dur = (def.durParam != null && inputs[def.durParam] != null)
        ? inputs[def.durParam]
        : baseDur;
      if (def.contingency) dur = Math.ceil(dur * (1 + contingencyPct));
      // Winter drying: E2 gains winterDryingExtra WD when it starts in Nov–Feb
      if (def.winterDrying) {
        const m = monthOf(start);
        if (m === 11 || m === 12 || m === 1 || m === 2) dur += winterDryingExtra;
      }
      durationUsed = dur;
      finish = dur === 0 ? start : addWorkdays(start, dur - 1, holidays);
    }

    // Actual finish override drives successors from the real date
    if (actuals[def.id]?.finish) {
      finish = actuals[def.id].finish;
      durationUsed = start <= finish ? networkdays(start, finish, holidays) : 0;
    }

    const entry = { id: def.id, applies, start, finish, durationUsed };
    byId[def.id] = entry;
    activities.push(entry);
  }

  // ── Key dates ────────────────────────────────────────────────────────────────
  const keyDates = {
    completion:    byId['A12'].finish,
    worksStart:    byId['C1'].start,
    pc:            byId['G3'].start,
    listed:        byId['H2'].start,
    saleAgreed:    byId['H3'].finish,
    saleCompleted: byId['H7'].start,
    buildDuration: networkdays(byId['C1'].start, byId['G3'].start, holidays),
  };

  // ── Flags ────────────────────────────────────────────────────────────────────
  const e2m = monthOf(byId['E2'].start);
  const h2m = monthOf(byId['H2'].start);
  const flags = {
    // Lender legal work finishes after completion — bridge must fund the gap
    financeLate:       byId['A11'].finish > byId['A12'].finish,
    // E2 starts in Nov–Feb; slower drying, winter allowance applied
    winterExternal:    e2m === 11 || e2m === 12 || e2m === 1 || e2m === 2,
    // Property listed in a slow sale month
    slowMonthListing:  h2m === 8 || h2m === 11 || h2m === 12,
    // Set by holding.js when programme months exceed the bridge term
    bridgeTermExceeded: false,
  };

  return { status: 'complete', activities, keyDates, flags };
}
