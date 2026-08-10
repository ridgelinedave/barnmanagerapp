#!/usr/bin/env node
/**
 * Rider age bands — every boundary, both clamps, and the calendar edges.
 *
 * These are the two calculations in the app most worth pinning: a band that is
 * off by one is wrong for a real child on a real screen, and nobody notices
 * until a parent does. Belle's bands are bounded at both ends, which means the
 * edges are now something a test can actually check.
 *
 * No database, no network. Imports lib/age.ts directly, which is why that
 * module imports nothing at all.
 *
 * Run:  npm run test:age
 */
import { ageOn, bandFor } from "../lib/age.ts";

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

/** Belle's confirmed bands, exactly as config/barn.ts holds them. */
const BANDS = [
  { label: "6–9", minAge: 6, maxAge: 9 },
  { label: "10–12", minAge: 10, maxAge: 12 },
  { label: "13–17", minAge: 13, maxAge: 17 },
  { label: "18–29", minAge: 18, maxAge: 29 },
  { label: "30–50", minAge: 30, maxAge: 50 },
  { label: "51–80", minAge: 51, maxAge: 80 },
];

console.log("\nevery band edge, both sides\n");

// Both bounds are inclusive, so each band is checked at its floor AND ceiling.
// An off-by-one shows up here and nowhere else.
for (const [age, want] of [
  [6, "6–9"], [9, "6–9"],
  [10, "10–12"], [12, "10–12"],
  [13, "13–17"], [17, "13–17"],
  [18, "18–29"], [29, "18–29"],
  [30, "30–50"], [50, "30–50"],
  [51, "51–80"], [80, "51–80"],
]) {
  check(`age ${age} is ${want}`, bandFor(age, BANDS) === want, `got ${bandFor(age, BANDS)}`);
}

console.log("\nno gaps and no overlaps across the whole range\n");
{
  let gaps = 0;
  let outside = 0;
  for (let age = 6; age <= 80; age++) {
    const hits = BANDS.filter((b) => age >= b.minAge && age <= b.maxAge);
    if (hits.length !== 1) gaps++;
    if (bandFor(age, BANDS) !== hits[0]?.label) outside++;
  }
  check("every age 6–80 falls in exactly one band", gaps === 0, `${gaps} age(s) matched ≠1 band`);
  check("bandFor agrees with the bands for all of 6–80", outside === 0, `${outside} disagreed`);
}

console.log("\nclamping outside the range\n");

for (const [age, want] of [[0, "6–9"], [3, "6–9"], [5, "6–9"]]) {
  check(`age ${age} clamps up to ${want}`, bandFor(age, BANDS) === want, `got ${bandFor(age, BANDS)}`);
}
for (const [age, want] of [[81, "51–80"], [95, "51–80"], [120, "51–80"]]) {
  check(`age ${age} clamps down to ${want}`, bandFor(age, BANDS) === want, `got ${bandFor(age, BANDS)}`);
}
check("no bands at all yields null rather than throwing", bandFor(12, []) === null);

console.log("\nage arithmetic on the calendar, not the clock\n");

check("birthday already passed this year", ageOn("2010-01-15", "2026-07-31") === 16);
check("birthday still to come this year", ageOn("2010-12-15", "2026-07-31") === 15);
check("on the birthday itself, the year counts", ageOn("2010-07-31", "2026-07-31") === 16);
check("the day before the birthday, it does not", ageOn("2010-08-01", "2026-07-31") === 15);
check(
  "a Feb 29 birthday lands on Mar 1 in a common year",
  ageOn("2012-02-29", "2026-02-28") === 13 && ageOn("2012-02-29", "2026-03-01") === 14,
);
check("a future date of birth is a typo, not a negative age", ageOn("2030-01-01", "2026-07-31") === null);
check("born today is zero, not null", ageOn("2026-07-31", "2026-07-31") === 0);
check("a malformed date is null", ageOn("15/01/2010", "2026-07-31") === null);

console.log("\nthe two together — a rider's whole journey\n");

for (const [dob, want] of [
  ["2019-03-02", "6–9"],
  ["2015-03-02", "10–12"],
  ["2010-03-02", "13–17"],
  ["2004-03-02", "18–29"],
  ["1990-03-02", "30–50"],
  ["1960-03-02", "51–80"],
  ["1930-03-02", "51–80"], // 96 — clamped
]) {
  const age = ageOn(dob, "2026-07-31");
  check(`born ${dob} (age ${age}) is ${want}`, bandFor(age, BANDS) === want, `got ${bandFor(age, BANDS)}`);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("Age bands, clamping and calendar arithmetic are sound.");
