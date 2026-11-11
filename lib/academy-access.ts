/**
 * Academy access dates (migration 0032) — pure, no imports, so the server,
 * the browser and tests share one implementation.
 *
 * Access ends at the END of a chosen day in the BARN's timezone. The database
 * stores that instant (timestamptz) and compares it with now(); the timezone
 * comes from config/barn.ts and is applied here, never written into SQL.
 */

/** The offset of `tz` from UTC at `instant`, in ms (positive east of UTC). */
function offsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second) - instant.getTime();
}

/** Midnight at the START of `isoDate` in `tz`, as an instant. DST-safe. */
export function startOfZonedDay(isoDate: string, tz: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d);
  let t = wall;
  for (let i = 0; i < 3; i++) t = wall - offsetMs(new Date(t), tz);
  return new Date(t);
}

/** The instant `isoDate` ENDS in `tz` (= the next day's midnight there). */
export function endOfZonedDay(isoDate: string, tz: string): Date {
  const next = new Date(`${isoDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return startOfZonedDay(next.toISOString().slice(0, 10), tz);
}

/** The last calendar day (in `tz`) an end-instant covers — what a screen shows. */
export function lastZonedDay(endInstant: string | Date, tz: string): string {
  const t = new Date(new Date(endInstant).getTime() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}

/** Today plus the notice period, as YYYY-MM-DD — the default "Lessons end". */
export function noticeDate(todayIso: string, noticeDays: number): string {
  const d = new Date(`${todayIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + noticeDays);
  return d.toISOString().slice(0, 10);
}
