// Pipeline helpers — crew clash and capital overlap across active deals.

/**
 * Detect crew clashes across a list of deals.
 * Each deal is { worksStart: ISO, pc: ISO }.
 * A clash exists when two deals have STRICTLY overlapping build windows:
 *   dealA.worksStart < dealB.pc  AND  dealA.pc > dealB.worksStart
 * Equality (one starts exactly when the other finishes) is NOT a clash.
 */
export function checkCrewClash(deals) {
  const clashes = [];
  for (let i = 0; i < deals.length; i++) {
    for (let j = i + 1; j < deals.length; j++) {
      const a = deals[i];
      const b = deals[j];
      if (a.worksStart < b.pc && a.pc > b.worksStart) {
        clashes.push({ i, j });
      }
    }
  }
  return { clash: clashes.length > 0, clashes };
}

/**
 * Count calendar days during which capital is tied up across all active deals.
 * deals = [{ worksStart, saleCompleted }]
 * Returns overlapping day ranges as an array of { start, end, count } segments.
 * Each day that has ≥2 deals active is an "overlap day".
 */
export function capitalOverlapDays(deals) {
  if (deals.length < 2) return { overlapDays: 0, segments: [] };
  const events = [];
  for (const d of deals) {
    events.push({ date: d.worksStart, delta: 1 });
    events.push({ date: d.saleCompleted, delta: -1 });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let active = 0;
  let overlapDays = 0;
  const segments = [];
  let segStart = null;

  for (let k = 0; k < events.length; k++) {
    const ev = events[k];
    const prev = active;
    active += ev.delta;
    if (prev < 2 && active >= 2) segStart = ev.date;
    if (prev >= 2 && active < 2 && segStart !== null) {
      const start = segStart;
      const end = ev.date;
      const d0 = new Date(start + 'T00:00:00Z');
      const d1 = new Date(end   + 'T00:00:00Z');
      const days = Math.round((d1 - d0) / 86400000);
      segments.push({ start, end, days });
      overlapDays += days;
      segStart = null;
    }
  }
  return { overlapDays, segments };
}
