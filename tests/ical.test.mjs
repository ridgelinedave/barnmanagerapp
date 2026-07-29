#!/usr/bin/env node
/**
 * iCalendar rendering + barn-local → UTC conversion.
 *
 * Both are pure functions and both have failure modes that are invisible until
 * a real calendar client rejects the feed (or, worse, accepts it and shows the
 * wrong hour). Tested directly rather than through a live subscription URL.
 *
 * Run:  npm run test:ical
 */
import { renderCalendar, icalDate, localToUtc as convert } from "../lib/ical.ts";

/** The barn's zone, stated here so the test does not depend on config/barn.ts. */
const TZ = "America/New_York";
const localToUtc = (date, time) => convert(date, time, TZ);

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("iCal feed\n");

const now = new Date("2026-07-29T12:00:00Z");
const ics = renderCalendar("Crouse — Test", [
  {
    uid: "lesson-1@crouse-barn-app",
    start: new Date("2026-07-30T13:00:00Z"),
    end: new Date("2026-07-30T14:00:00Z"),
    summary: "Riding lesson",
    location: "Crouse Equestrian",
  },
  {
    uid: "event-2@crouse-barn-app",
    start: new Date("2026-08-05T14:00:00Z"),
    end: null,
    summary: "Clinic; with a semicolon, a comma and a \\ backslash",
    description: "Line one\nline two",
    location: "Main arena, back field",
  },
], now);

check("uses CRLF line endings throughout", !/[^\r]\n/.test(ics), "found a bare LF");
check("opens and closes the calendar", ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.trimEnd().endsWith("END:VCALENDAR"));
check("declares VERSION:2.0", ics.includes("\r\nVERSION:2.0\r\n"));
check("every event is bounded", (ics.match(/BEGIN:VEVENT/g) ?? []).length === 2 && (ics.match(/END:VEVENT/g) ?? []).length === 2);

check("times are UTC with a Z suffix", ics.includes("DTSTART:20260730T130000Z"), "DTSTART not as expected");
check("DTSTAMP is present on events", (ics.match(/DTSTAMP:/g) ?? []).length === 2);
check(
  "an event with no end gets one rather than a zero-length blip",
  ics.includes("DTEND:20260805T150000Z"),
  "expected a one-hour default",
);

check("semicolons are escaped", ics.includes("Clinic\\;"));
check("commas are escaped", ics.includes("a comma") && ics.includes("\\,"));
check("backslashes are escaped", ics.includes("\\\\ backslash"));
check("newlines inside a value are escaped", ics.includes("DESCRIPTION:Line one\\nline two"));

// Folding: no content line may exceed 75 octets, and continuations start with
// exactly one space.
const longSummary = "x".repeat(200);
const folded = renderCalendar("Fold test", [
  { uid: "u@t", start: now, end: now, summary: longSummary },
], now);
const overLong = folded.split("\r\n").filter((line) => Buffer.byteLength(line, "utf8") > 75);
check("no line exceeds 75 octets", overLong.length === 0, `${overLong.length} long line(s)`);
check(
  "continuation lines begin with a single space",
  folded.split("\r\n").filter((l) => l.startsWith(" ")).every((l) => !l.startsWith("  ")),
);
check(
  "unfolding restores the original value",
  folded.replace(/\r\n /g, "").includes(`SUMMARY:${longSummary}`),
);

check("icalDate strips punctuation", icalDate(new Date("2026-01-02T03:04:05.678Z")) === "20260102T030405Z");

console.log("\nbarn-local → UTC (America/New_York)\n");

// Summer: EDT, UTC-4. 09:00 local is 13:00Z.
check(
  "a summer morning converts at EDT (-4)",
  localToUtc("2026-07-30", "09:00:00").toISOString() === "2026-07-30T13:00:00.000Z",
  localToUtc("2026-07-30", "09:00:00").toISOString(),
);

// Winter: EST, UTC-5. 09:00 local is 14:00Z. The same wall clock, a different
// instant — which is exactly why lessons cannot be stored as UTC.
check(
  "a winter morning converts at EST (-5)",
  localToUtc("2026-01-15", "09:00:00").toISOString() === "2026-01-15T14:00:00.000Z",
  localToUtc("2026-01-15", "09:00:00").toISOString(),
);

// The day the clocks go forward (2026-03-08 in the US). A single-pass
// conversion lands an hour out on days like this.
check(
  "the morning of a spring-forward day is still correct",
  localToUtc("2026-03-08", "09:00:00").toISOString() === "2026-03-08T13:00:00.000Z",
  localToUtc("2026-03-08", "09:00:00").toISOString(),
);

// And the day they go back (2026-11-01).
check(
  "the morning of a fall-back day is still correct",
  localToUtc("2026-11-01", "09:00:00").toISOString() === "2026-11-01T14:00:00.000Z",
  localToUtc("2026-11-01", "09:00:00").toISOString(),
);

check(
  "midnight does not roll to the wrong day",
  localToUtc("2026-07-30", "00:00:00").toISOString() === "2026-07-30T04:00:00.000Z",
  localToUtc("2026-07-30", "00:00:00").toISOString(),
);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exitCode = 1;
} else {
  console.log("Feed output and timezone conversion are sound.");
}
