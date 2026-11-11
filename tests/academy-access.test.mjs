/**
 * Academy access dates (lib/academy-access.ts): the end of a chosen day in
 * the barn's timezone, DST-safe, and the default notice date.
 *
 * Run:  npm run test:access
 */
import { endOfZonedDay, lastZonedDay, noticeDate, startOfZonedDay } from "../lib/academy-access.ts";

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

const NY = "America/New_York";
console.log("\nthe end of a day in the barn's timezone\n");
check("Dec 11 ends at midnight Eastern = 05:00 UTC Dec 12 (EST)", endOfZonedDay("2026-12-11", NY).toISOString() === "2026-12-12T05:00:00.000Z", endOfZonedDay("2026-12-11", NY).toISOString());
check("Jul 4 ends at 04:00 UTC Jul 5 (EDT)", endOfZonedDay("2026-07-04", NY).toISOString() === "2026-07-05T04:00:00.000Z", endOfZonedDay("2026-07-04", NY).toISOString());
check("the day clocks spring forward (Mar 8 2026) still ends at the next midnight", endOfZonedDay("2026-03-08", NY).toISOString() === "2026-03-09T04:00:00.000Z", endOfZonedDay("2026-03-08", NY).toISOString());
check("the day before they fall back (Oct 31 2026) ends at 04:00 UTC", endOfZonedDay("2026-10-31", NY).toISOString() === "2026-11-01T04:00:00.000Z", endOfZonedDay("2026-10-31", NY).toISOString());
check("the fall-back day itself (Nov 1 2026) is 25 hours and ends at 05:00 UTC", endOfZonedDay("2026-11-01", NY).toISOString() === "2026-11-02T05:00:00.000Z", endOfZonedDay("2026-11-01", NY).toISOString());
check("a day starts where the previous one ends", startOfZonedDay("2026-12-12", NY).getTime() === endOfZonedDay("2026-12-11", NY).getTime());
check("a different barn's timezone is honoured (Denver)", endOfZonedDay("2026-12-11", "America/Denver").toISOString() === "2026-12-12T07:00:00.000Z");

console.log("\nwhat the screen shows, and the default\n");
check("the end instant reads back as the chosen day", lastZonedDay(endOfZonedDay("2026-12-11", NY), NY) === "2026-12-11", lastZonedDay(endOfZonedDay("2026-12-11", NY), NY));
check("…across a DST change too", lastZonedDay(endOfZonedDay("2026-11-01", NY), NY) === "2026-11-01");
check("…from a stored ISO string", lastZonedDay("2026-12-12T05:00:00+00:00", NY) === "2026-12-11");
check("notice: today + 30", noticeDate("2026-11-11", 30) === "2026-12-11");
check("notice: across a month and a year end", noticeDate("2026-12-15", 30) === "2027-01-14");

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
