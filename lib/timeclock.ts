import { barn } from "@/config/barn";
import type { Punch } from "@/lib/types";

/**
 * Time-clock arithmetic and flagging.
 *
 * All of this lives in the app rather than in SQL because the geofence is a
 * per-barn config value. Putting coordinates in a migration would give a clone
 * a second place to change and a silent way to get it wrong.
 *
 * Pure functions, no database access — which also makes the pairing logic
 * cheap to reason about, since it is the part that decides what people are paid.
 */

/** Metres between two coordinates. Haversine; good to a few metres at barn scale. */
export function distanceMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type PunchFlag = "no_location" | "outside_geofence";

/**
 * Why a punch deserves the admin's attention.
 *
 * A missing location is always worth flagging. Being outside the fence can only
 * be judged when the barn has actually configured one — with `geofence` still
 * at its null placeholder, nothing is out of range, because there is no range.
 */
export function flagsForPunch(punch: Pick<Punch, "lat" | "lng">): PunchFlag[] {
  const flags: PunchFlag[] = [];

  if (punch.lat === null || punch.lng === null) {
    flags.push("no_location");
    return flags;
  }

  const { lat, lng, radiusM } = barn.geofence;
  if (lat === null || lng === null || radiusM === null) return flags;

  if (distanceMetres(punch.lat, punch.lng, lat, lng) > radiusM) {
    flags.push("outside_geofence");
  }
  return flags;
}

export const FLAG_LABEL: Record<PunchFlag, string> = {
  no_location: "No location",
  outside_geofence: "Away from the barn",
};

export type PunchPair = {
  in: Punch;
  out: Punch | null;
  minutes: number;
  /** True when an in-punch never got its matching out-punch. */
  unclosed: boolean;
};

/**
 * Pairs a person's punches into worked intervals.
 *
 * Real time clocks are messy: people forget to clock out, double-tap in, or get
 * corrected after the fact. The rules here are deliberately conservative —
 * an unmatched 'in' contributes ZERO minutes and is flagged, rather than being
 * quietly closed at midnight or at the next in-punch. Guessing would put made-up
 * hours on a payslip; showing the gap makes the barn resolve it.
 *
 * Expects punches in ascending time order.
 */
export function pairPunches(punches: Punch[]): PunchPair[] {
  const ordered = [...punches].sort((a, b) => a.punched_at.localeCompare(b.punched_at));
  const pairs: PunchPair[] = [];
  let open: Punch | null = null;

  for (const punch of ordered) {
    if (punch.direction === "in") {
      // Two 'in' punches in a row: the first is unclosed, not a shift boundary.
      if (open) pairs.push({ in: open, out: null, minutes: 0, unclosed: true });
      open = punch;
      continue;
    }

    if (!open) continue; // An 'out' with no 'in' pairs with nothing.

    const minutes = Math.max(
      0,
      Math.round(
        (Date.parse(punch.punched_at) - Date.parse(open.punched_at)) / 60_000,
      ),
    );
    pairs.push({ in: open, out: punch, minutes, unclosed: false });
    open = null;
  }

  if (open) pairs.push({ in: open, out: null, minutes: 0, unclosed: true });
  return pairs;
}

export function totalMinutes(pairs: PunchPair[]): number {
  return pairs.reduce((sum, pair) => sum + pair.minutes, 0);
}

/** 505 → "8h 25m". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Decimal hours, as QuickBooks import expects. 505 → "8.42". */
export function decimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

/** Is this in-punch still open, i.e. is the person on the clock right now? */
export function currentlyClockedIn(punches: Punch[]): Punch | null {
  const pairs = pairPunches(punches);
  const last = pairs.at(-1);
  return last && last.unclosed ? last.in : null;
}
