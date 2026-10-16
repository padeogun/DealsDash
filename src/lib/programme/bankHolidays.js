// Bank holidays helper.
// Source: GOV.UK https://www.gov.uk/bank-holidays.json (england-and-wales)
// Cached in localStorage for 24 h. Falls back to bundled 2026–2028 data.
// Shows "fallback in use" tag in UI when live data unavailable.
//
// Trade-shutdown days (Paul's custom non-working days) are NOT included here;
// they live in settings/app.customNonWorkdays and are merged by the caller.

const CACHE_KEY = 'dealsdash_bh_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h
const GOV_URL   = 'https://www.gov.uk/bank-holidays.json';

// England & Wales bank holidays 2026–2028.
// Verify at https://www.gov.uk/bank-holidays — tagged in UI when used as fallback.
const FALLBACK = [
  // 2026
  '2026-01-01', '2026-04-03', '2026-04-06',
  '2026-05-04', '2026-05-25', '2026-08-31',
  '2026-12-25', '2026-12-28',
  // 2027
  '2027-01-01', '2027-03-26', '2027-03-29',
  '2027-05-03', '2027-05-31', '2027-08-30',
  '2027-12-27', '2027-12-28',
  // 2028
  '2028-01-03', '2028-04-14', '2028-04-17',
  '2028-05-01', '2028-05-29', '2028-08-28',
  '2028-12-25', '2028-12-26',
];

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { holidays, fetchedAt } = JSON.parse(raw);
    if (Date.now() - fetchedAt > CACHE_TTL) return null;
    return holidays;
  } catch {
    return null;
  }
}

function writeCache(holidays) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ holidays, fetchedAt: Date.now() })); } catch { /* storage full */ }
}

function parseGovUK(json) {
  const ew = json['england-and-wales'];
  if (!ew?.events) return null;
  return ew.events.map(e => e.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
}

/**
 * Returns bank holidays as an ISO date array plus a source tag.
 * source: 'live' | 'cache' | 'fallback'
 * Shows 'fallback' tag in UI if fallback data is in use (illustrative label).
 */
export async function getBankHolidays() {
  const cached = readCache();
  if (cached) return { holidays: cached, source: 'cache' };

  try {
    const res = await fetch(GOV_URL, { signal: AbortSignal.timeout?.(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const holidays = parseGovUK(json);
    if (!holidays || holidays.length < 10) throw new Error('unexpected schema');
    writeCache(holidays);
    return { holidays, source: 'live' };
  } catch {
    return { holidays: FALLBACK, source: 'fallback' };
  }
}

export { FALLBACK as FALLBACK_HOLIDAYS };
