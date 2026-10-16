// Working-day calendar helpers — no external date library.
// All dates are ISO YYYY-MM-DD strings treated as UTC midnight to avoid DST shifts.
// Holiday arrays are flat arrays of ISO date strings.

/** True when date is Mon–Fri and not in the holidays array. */
export function isWorkday(date, holidays = []) {
  const d = new Date(date + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0 = Sun, 6 = Sat
  if (dow === 0 || dow === 6) return false;
  return !holidays.includes(date);
}

/**
 * Add n working days to date.
 * n may be negative — mirrors Excel WORKDAY().
 * Does NOT count the start date itself; moves n steps of one WD each.
 */
export function addWorkdays(date, n, holidays = []) {
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  const d = new Date(date + 'T00:00:00Z');
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (isWorkday(d.toISOString().slice(0, 10), holidays)) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Count working days from startDate to endDate, inclusive of both ends.
 * Returns 0 when endDate < startDate.
 * Mirrors Excel NETWORKDAYS().
 */
export function networkdays(startDate, endDate, holidays = []) {
  if (startDate > endDate) return 0;
  let count = 0;
  const d = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (d <= end) {
    if (isWorkday(d.toISOString().slice(0, 10), holidays)) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/**
 * Add n calendar days to date.
 * Used for auction completion: secured + 28 calendar days.
 */
export function addCalendarDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Return date if already a workday, otherwise the next workday.
 * Used to snap auction completion to the first workday on or after the calendar deadline.
 */
export function ceilWorkday(date, holidays = []) {
  if (isWorkday(date, holidays)) return date;
  return addWorkdays(date, 1, holidays);
}

/**
 * Return the month number (1–12) of an ISO date string.
 * Used for winter drying and slow-month listing checks.
 */
export function monthOf(date) {
  return parseInt(date.slice(5, 7), 10);
}
