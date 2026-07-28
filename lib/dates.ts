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

/** Add days to a barn-local ISO date, staying in ISO form. */
export function addBarnDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "09:00:00" → "9:00 AM". Times are barn-local wall clock; there is no zone to convert. */
export function formatTime(time: string): string {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Current barn-local wall clock as {date, minutes-since-midnight}. */
function barnNowParts(): { date: string; minutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: barn.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { date: formatBarnDate(now), minutes: hour * 60 + minute };
}

/**
 * Minutes from now until a barn-local date + time. Negative once it has passed.
 *
 * Compares barn wall clock to barn wall clock rather than converting either
 * side to UTC — both operands are already in the barn's zone, so no offset
 * arithmetic is needed and no DST conversion can go wrong in the ordinary case.
 * (A cancellation made during the one ambiguous hour of a DST fall-back can be
 * off by 60 minutes; that is noted rather than solved, because the cutoff is a
 * courtesy threshold, not a billing boundary.)
 */
export function minutesUntilBarnDateTime(isoDate: string, time: string): number {
  const now = barnNowParts();
  const [hourText, minuteText] = time.split(":");
  const lessonMinutes = Number(hourText) * 60 + Number(minuteText);

  const dayDelta = Math.round(
    (Date.parse(`${isoDate}T12:00:00Z`) - Date.parse(`${now.date}T12:00:00Z`)) / 86_400_000,
  );

  return dayDelta * 1440 + (lessonMinutes - now.minutes);
}

/**
 * Is a cancellation for this lesson inside the barn's backfill cutoff?
 *
 * Inside the cutoff the slot is too late to refill, so the cancellation still
 * goes through but the barn is simply told. Outside it, the slot is released
 * for backfill (slice 3b).
 */
export function isInsideBackfillCutoff(isoDate: string, time: string): boolean {
  return minutesUntilBarnDateTime(isoDate, time) < barn.backfillCutoffMinutes;
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
