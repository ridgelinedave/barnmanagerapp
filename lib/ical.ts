/**
 * iCalendar (RFC 5545) rendering.
 *
 * Deliberately not `server-only` and dependency-free, for the same reason as
 * lib/pdf.ts: it is a pure function over strings, so it can be tested directly
 * instead of only through a live feed URL.
 *
 * THE THREE THINGS CALENDAR CLIENTS ARE STRICT ABOUT, and that a naive
 * implementation gets wrong:
 *
 *   1. CRLF line endings. Not "\n". Some clients accept LF; Outlook does not.
 *   2. Lines folded at 75 OCTETS, continued with CRLF + a single space.
 *   3. Escaping: backslash, semicolon, comma and newline inside text values.
 *      An unescaped comma silently truncates a location or splits a value.
 *
 * All times are emitted as UTC (`...Z`). The alternative — local times with a
 * TZID — needs a VTIMEZONE block to be strictly valid, and getting that wrong
 * is worse than doing the conversion ourselves.
 */

/**
 * A local date + wall-clock time in a named zone, as a real UTC instant.
 *
 * Lessons are stored as a date plus a local time with no zone, which is correct
 * for a barn — 9am is 9am either side of a DST change — but useless to a
 * calendar client, which needs an absolute instant.
 *
 * The correction runs TWICE on purpose. Guessing that the local time is UTC and
 * subtracting that guess's offset is right on 363 days a year; on the two DST
 * boundary days the offset changes across the guess, and a single pass lands an
 * hour out. The second pass re-measures at the corrected instant.
 *
 * Lives here rather than in lib/dates.ts because this module imports nothing,
 * which is what makes it directly testable outside the bundler.
 */
export function localToUtc(isoDate: string, time: string, timeZone: string): Date {
  const [hour = "0", minute = "0"] = time.split(":");
  const naive = Date.parse(
    `${isoDate}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00Z`,
  );

  let instant = naive;
  for (let pass = 0; pass < 2; pass++) {
    instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  }
  return new Date(instant);
}

/** How far ahead of UTC the zone is at a given instant, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  // en-CA formats as YYYY-MM-DD, so the result parses back cleanly.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // Some runtimes render midnight as hour "24".
  const hour = get("hour") === "24" ? "00" : get("hour");

  const asUtc = Date.parse(
    `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}Z`,
  );

  return asUtc - at.getTime();
}

/**
 * Who the feed is being built for.
 *
 * `isBarn` is admin or staff — they see the whole calendar. Everyone else is a
 * family, scoped to their own riders and to public events.
 */
export type FeedViewer = { isBarn: boolean; familyId: string | null };

/**
 * WHICH BARN EVENTS THIS VIEWER MAY SEE.
 *
 * Extracted from the route handler on purpose. The feed runs with the service
 * role and no session, so RLS is not protecting it — this filter IS the
 * boundary, and a boundary that can only be exercised by fetching a live
 * subscription URL is a boundary nobody tests. As a plain function over arrays
 * it is asserted directly in tests/ical.test.mjs.
 *
 * The route ALSO filters at the query level. That is deliberate belt and
 * braces, not redundancy: two independent chances to keep a staff-only vet
 * visit off forty families' phones.
 */
export function scopeEvents<T extends { visibility: string }>(
  viewer: FeedViewer,
  events: T[],
): T[] {
  if (viewer.isBarn) return events;
  return events.filter((event) => event.visibility === "all");
}

/**
 * WHICH LESSONS THIS VIEWER MAY SEE.
 *
 * A family sees an instance only when one of THEIR riders holds a live seat in
 * it — the same rule the lesson_riders policy applies, restated because the
 * policy cannot run here.
 *
 * A family with no riders, or no family at all, gets nothing rather than
 * everything: the empty-input case is the one a naive filter gets backwards.
 */
export function scopeLessons<T extends { id: string }>(
  viewer: FeedViewer,
  instances: T[],
  seats: { instance_id: string; rider_id: string }[],
  familyRiderIds: string[],
): T[] {
  if (viewer.isBarn) return instances;
  if (!viewer.familyId || familyRiderIds.length === 0) return [];

  const mine = new Set(familyRiderIds);
  const booked = new Set(
    seats.filter((seat) => mine.has(seat.rider_id)).map((seat) => seat.instance_id),
  );

  return instances.filter((instance) => booked.has(instance.id));
}

export type CalendarEvent = {
  /** Stable across regenerations: the same lesson must not duplicate on refresh. */
  uid: string;
  start: Date;
  end: Date | null;
  summary: string;
  description?: string;
  location?: string;
};

/** 20260729T140000Z */
export function icalDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line at 75 octets.
 *
 * Measured in BYTES, not characters: a line split in the middle of a
 * multi-byte character produces mojibake in the client, and the limit is
 * defined in octets by the spec.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let start = 0;
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Do not split a multi-byte sequence: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }

  return chunks.join("\r\n ");
}

export function renderCalendar(name: string, events: CalendarEvent[], now: Date): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Crouse Barn App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
  ];

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${icalDate(now)}`);
    lines.push(`DTSTART:${icalDate(event.start)}`);
    // A missing end is legal but renders as a zero-length blip in most clients,
    // so an hour is assumed rather than omitted.
    lines.push(
      `DTEND:${icalDate(event.end ?? new Date(event.start.getTime() + 60 * 60 * 1000))}`,
    );
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(fold).join("\r\n")}\r\n`;
}
