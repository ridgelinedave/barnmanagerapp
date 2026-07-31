import { barn } from "@/config/barn";
import { localToUtc } from "@/lib/ical";

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

/**
 * A date where the YEAR is the point — a birthday, not a shift.
 *
 * formatBarnDayLabel() is built for "this week" and drops the year entirely,
 * which turns a 2011 date of birth into "Wed, Apr 1". Anywhere the year
 * carries the meaning has to use this instead.
 */
export function formatBarnDateFull(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: barn.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

/**
 * Whole years since `dob`, on the barn's clock.
 *
 * Compared as YYYY-MM-DD strings rather than by subtracting milliseconds: a
 * date of birth is a calendar fact, not an instant, and millisecond arithmetic
 * gets it wrong by a day around DST and around leap years. Someone born on
 * Feb 29 has their birthday land on Mar 1 in common years, which is what
 * string comparison against `MM-DD` gives for free.
 */
export function ageFromDob(dob: string, on: string = barnToday()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !/^\d{4}-\d{2}-\d{2}$/.test(on)) return null;

  const years = Number(on.slice(0, 4)) - Number(dob.slice(0, 4));
  // Birthday not yet reached this year.
  const hadBirthday = on.slice(5) >= dob.slice(5);
  const age = hadBirthday ? years : years - 1;

  // A future date of birth is a typo, not a negative age.
  return age >= 0 ? age : null;
}

/**
 * The rider's age group, from `config/barn.ts`.
 *
 * Returns null when there is no date of birth — the caller shows nothing
 * rather than guessing a bracket, because "Adult" on a nine-year-old is worse
 * than a blank.
 */
export function ageGroupFor(dob: string | null, on: string = barnToday()): string | null {
  if (!dob) return null;
  const age = ageFromDob(dob, on);
  if (age === null) return null;

  const group = barn.riderAgeGroups.find((g) => g.maxAge === null || age <= g.maxAge);
  return group?.label ?? null;
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

/**
 * A barn-local date + wall-clock time as a real UTC instant.
 *
 * The conversion itself lives in `lib/ical.ts` — deliberately, because that
 * module imports nothing, which is what lets `tests/ical.test.mjs` exercise it
 * directly. This wrapper just supplies the barn's zone.
 */
export function barnLocalToUtc(isoDate: string, time: string): Date {
  return localToUtc(isoDate, time, barn.timezone);
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
