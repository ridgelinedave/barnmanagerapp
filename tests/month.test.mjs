#!/usr/bin/env node
/**
 * Month-grid arithmetic — the edges a calendar is quietly wrong at.
 *
 * A grid that is off by one day looks fine for eleven months and then puts an
 * appointment on the wrong Tuesday. These are the cases worth pinning: months
 * that start on a Sunday, months that start on a Saturday, February in a leap
 * year and out of it, and the clamping when you page from the 31st.
 *
 * No database, no network. Imports lib/month.ts directly, which is why that
 * module imports nothing at all.
 *
 * Run:  npm run test:month
 */
import {
  addMonths,
  dayOfWeek,
  daysInMonth,
  endOfMonth,
  isLeapYear,
  monthGrid,
  monthLabel,
  startOfMonth,
} from "../lib/month.ts";

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

console.log("\nmonth lengths and leap years\n");

check("January has 31", daysInMonth(2026, 1) === 31);
check("April has 30", daysInMonth(2026, 4) === 30);
check("February 2026 has 28", daysInMonth(2026, 2) === 28);
check("February 2028 has 29", daysInMonth(2028, 2) === 29);
check("2000 was a leap year (divisible by 400)", isLeapYear(2000));
check("1900 was NOT (divisible by 100, not 400)", !isLeapYear(1900));
check("December has 31", daysInMonth(2026, 12) === 31);

console.log("\nmonth boundaries\n");

check("startOfMonth", startOfMonth("2026-08-14") === "2026-08-01");
check("endOfMonth, 31-day", endOfMonth("2026-08-14") === "2026-08-31");
check("endOfMonth, 30-day", endOfMonth("2026-04-02") === "2026-04-30");
check("endOfMonth, February", endOfMonth("2026-02-10") === "2026-02-28");
check("endOfMonth, leap February", endOfMonth("2028-02-10") === "2028-02-29");

console.log("\npaging by month, with day clamping\n");

check("forward one", addMonths("2026-08-14", 1) === "2026-09-14");
check("back one", addMonths("2026-08-14", -1) === "2026-07-14");
check("across the new year forward", addMonths("2026-12-15", 1) === "2027-01-15");
check("across the new year back", addMonths("2026-01-15", -1) === "2025-12-15");
check("Jan 31 + 1 clamps to Feb 28", addMonths("2026-01-31", 1) === "2026-02-28");
check("Jan 31 + 1 clamps to Feb 29 in a leap year", addMonths("2028-01-31", 1) === "2028-02-29");
check("Mar 31 - 1 clamps to Feb 28", addMonths("2026-03-31", -1) === "2026-02-28");
check("twelve months forward is the same day next year", addMonths("2026-08-14", 12) === "2027-08-14");

console.log("\nday of week — parsed at UTC noon so no zone can shift it\n");

// 2026-08-14 is a Friday.
check("a known Friday is 5", dayOfWeek("2026-08-14") === 5);
check("the next day is Saturday, 6", dayOfWeek("2026-08-15") === 6);
check("the day after is Sunday, 0", dayOfWeek("2026-08-16") === 0);
check(
  "the first of a month is not shunted by the timezone",
  dayOfWeek("2026-03-01") === 0,
  `got ${dayOfWeek("2026-03-01")} — 2026-03-01 is a Sunday`,
);

console.log("\nthe grid: whole weeks, correct padding\n");

for (const iso of ["2026-01-15", "2026-02-15", "2026-08-15", "2028-02-15", "2026-11-15"]) {
  const grid = monthGrid(iso);
  check(`${iso.slice(0, 7)} is a whole number of weeks`, grid.length % 7 === 0, `${grid.length} cells`);
  check(
    `${iso.slice(0, 7)} starts on a Sunday`,
    dayOfWeek(grid[0].iso) === 0,
    `first cell ${grid[0].iso} is day ${dayOfWeek(grid[0].iso)}`,
  );
  check(
    `${iso.slice(0, 7)} ends on a Saturday`,
    dayOfWeek(grid[grid.length - 1].iso) === 6,
  );
  const inMonth = grid.filter((c) => c.inMonth);
  const { length } = inMonth;
  check(
    `${iso.slice(0, 7)} contains every one of its ${daysInMonth(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)))} days exactly once`,
    length === daysInMonth(Number(iso.slice(0, 4)), Number(iso.slice(5, 7))) &&
      new Set(inMonth.map((c) => c.iso)).size === length,
  );
}

console.log("\nthe grid: no gaps, strictly consecutive\n");
{
  const grid = monthGrid("2026-08-15");
  let consecutive = true;
  for (let i = 1; i < grid.length; i++) {
    const prev = new Date(`${grid[i - 1].iso}T12:00:00Z`).getTime();
    const cur = new Date(`${grid[i].iso}T12:00:00Z`).getTime();
    if (cur - prev !== 86_400_000) consecutive = false;
  }
  check("every cell is exactly one day after the last", consecutive);
}

console.log("\na month that starts on a Sunday needs no leading padding\n");
{
  // 2026-03-01 is a Sunday.
  const grid = monthGrid("2026-03-10");
  check("first cell IS the first of the month", grid[0].iso === "2026-03-01" && grid[0].inMonth);
}

console.log("\nlabels\n");
check("monthLabel", monthLabel("2026-08-14") === "August 2026");
check("monthLabel, January", monthLabel("2026-01-01") === "January 2026");

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("Month grid, paging, clamping and weekday alignment are sound.");
