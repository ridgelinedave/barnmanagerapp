/**
 * Age and age-band arithmetic — PURE, and deliberately importing nothing.
 *
 * Same reason `localToUtc` lives in lib/ical.ts: a module with a `@/` value
 * import cannot be loaded outside the bundler, so it cannot be unit tested.
 * These are the two calculations most worth testing in the whole app — a band
 * that is off by one is wrong for a real child on a real screen — so they live
 * where a test can reach them.
 *
 * lib/dates.ts wraps both with the barn's clock and the barn's bands.
 */

export type AgeBand = { label: string; minAge: number; maxAge: number };

/**
 * Whole years between two barn-local dates.
 *
 * Compared as YYYY-MM-DD strings rather than by subtracting milliseconds: a
 * date of birth is a calendar fact, not an instant, and millisecond arithmetic
 * gets it wrong by a day around DST and around leap years. Someone born on
 * Feb 29 has their birthday land on Mar 1 in common years, which is what
 * string comparison against `MM-DD` gives for free.
 */
export function ageOn(dob: string, on: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !/^\d{4}-\d{2}-\d{2}$/.test(on)) return null;

  const years = Number(on.slice(0, 4)) - Number(dob.slice(0, 4));
  const hadBirthday = on.slice(5) >= dob.slice(5);
  const age = hadBirthday ? years : years - 1;

  // A future date of birth is a typo, not a negative age.
  return age >= 0 ? age : null;
}

/**
 * Which band an age falls in, CLAMPING at both ends.
 *
 * The bands are bounded top and bottom, so an age can fall outside them
 * entirely. Clamping rather than returning null is a deliberate product call:
 * a five-year-old on a lead line is a real rider, and a blank age group on a
 * real rider reads as a bug rather than as "outside the range". The barn would
 * rather see the nearest true thing.
 *
 * Assumes the bands are in ascending order — the clamp reads the first and
 * last entries, which is also the order they are written in the config.
 */
export function bandFor(age: number, bands: readonly AgeBand[]): string | null {
  if (bands.length === 0) return null;

  const first = bands[0];
  const last = bands[bands.length - 1];
  if (age < first.minAge) return first.label;
  if (age > last.maxAge) return last.label;

  return bands.find((band) => age >= band.minAge && age <= band.maxAge)?.label ?? null;
}
