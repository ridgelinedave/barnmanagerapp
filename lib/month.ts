/**
 * Month-grid arithmetic — PURE, importing nothing, so it can be unit tested.
 *
 * Same reason lib/age.ts and lib/ical.ts import nothing: a module with a `@/`
 * value import cannot load outside the bundler. Calendar grid maths is exactly
 * the kind of code that is quietly wrong at the edges — a month that starts on
 * a Sunday, a 28-day February, the row count changing between months — and
 * those edges are only checkable if a test can reach them.
 *
 * Everything here works on barn-local `YYYY-MM-DD` strings and never on a
 * Date's local timezone. `new Date("2026-03-01")` is UTC midnight, which in
 * America/New_York is the evening of Feb 28 — the classic off-by-one that
 * makes a calendar show the wrong month to half the country.
 */

/** Days per month, 1-indexed by month. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isLeapYear(year: number): boolean {
  return daysInMonth(year, 2) === 29;
}

/** "2026-08-14" → { year: 2026, month: 8, day: 14 } */
export function parseIso(iso: string): { year: number; month: number; day: number } {
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  };
}

export function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** First day of the month containing `iso`. */
export function startOfMonth(iso: string): string {
  const { year, month } = parseIso(iso);
  return toIso(year, month, 1);
}

/** Last day of the month containing `iso`. */
export function endOfMonth(iso: string): string {
  const { year, month } = parseIso(iso);
  return toIso(year, month, daysInMonth(year, month));
}

/** Shift by whole months, clamping the day so Jan 31 + 1 month is Feb 28/29. */
export function addMonths(iso: string, delta: number): string {
  const { year, month, day } = parseIso(iso);
  const zero = year * 12 + (month - 1) + delta;
  const y = Math.floor(zero / 12);
  const m = (zero % 12) + 1;
  return toIso(y, m, Math.min(day, daysInMonth(y, m)));
}

/**
 * Day of week for a barn-local date. 0 = Sunday … 6 = Saturday.
 *
 * Parsed at UTC noon so no timezone can shunt it either side of midnight.
 */
export function dayOfWeek(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** Sunday-first, because this is a US barn and that is the calendar people picture. */
export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export type MonthCell = { iso: string; inMonth: boolean };

/**
 * The grid for a month: whole weeks, Sunday-first, leading and trailing days
 * from the neighbouring months so every row has seven cells.
 *
 * Always returns a whole number of weeks. The row COUNT varies (a 28-day
 * February starting on a Sunday needs 4 rows; a 31-day month starting on a
 * Saturday needs 6) and that is deliberate — padding every month to six rows
 * leaves a blank strip most of the year.
 */
export function monthGrid(iso: string): MonthCell[] {
  const { year, month } = parseIso(iso);
  const first = toIso(year, month, 1);
  const lead = dayOfWeek(first);
  const total = daysInMonth(year, month);

  const cells: MonthCell[] = [];

  // Trailing days of the previous month.
  const prev = addMonths(first, -1);
  const prevParsed = parseIso(prev);
  const prevTotal = daysInMonth(prevParsed.year, prevParsed.month);
  for (let i = lead; i > 0; i--) {
    cells.push({ iso: toIso(prevParsed.year, prevParsed.month, prevTotal - i + 1), inMonth: false });
  }

  for (let day = 1; day <= total; day++) {
    cells.push({ iso: toIso(year, month, day), inMonth: true });
  }

  // Leading days of the next month, to complete the final week.
  const next = addMonths(first, 1);
  const nextParsed = parseIso(next);
  let day = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ iso: toIso(nextParsed.year, nextParsed.month, day++), inMonth: false });
  }

  return cells;
}

/** "August 2026" — for the grid header. */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function monthLabel(iso: string): string {
  const { year, month } = parseIso(iso);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
