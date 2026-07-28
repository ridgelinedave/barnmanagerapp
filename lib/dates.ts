import { barn } from "@/config/barn";

/**
 * "Today" at the barn, as YYYY-MM-DD.
 *
 * Deliberately NOT Postgres `current_date`, which is UTC. For a barn on
 * America/New_York, anything between 20:00 and midnight local is already
 * tomorrow in UTC — so a nightly task generation run, or a staff member opening
 * their tab after evening feed, would silently be looking at the wrong day.
 * The barn's calendar day is the one that matters, so the app resolves it from
 * the configured timezone and passes it explicitly.
 */
export function barnToday(): string {
  return formatBarnDate(new Date());
}

/** Format any instant as a YYYY-MM-DD barn-local date. */
export function formatBarnDate(date: Date): string {
  // en-CA gives ISO-ordered output (YYYY-MM-DD) without manual padding.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: barn.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Human-readable barn-local day, e.g. "Tue, Jul 28". */
export function formatBarnDayLabel(isoDate: string): string {
  // Parse as UTC noon so the label can't slip a day either side of the date.
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: barn.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** ISO weekday for a barn-local date. 1 = Monday … 7 = Sunday. */
export function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
