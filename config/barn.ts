/**
 * THE BARN CONFIG — the single source of truth for every barn-specific value.
 *
 * HARD RULE: no barn-specific fact (name, colors, logo, timezone, coordinates,
 * lesson durations, feature availability) may be hard-coded anywhere else in
 * this codebase. App code imports from here. Cloning this app for a second barn
 * = new Supabase project + new values in this file + new logo asset.
 * See README.md → "Cloning for a new barn".
 *
 * Anything marked PROVISIONAL or PLACEHOLDER must be confirmed with the barn
 * owner before it ships. Never invent client facts.
 */

export type BarnFeatureFlag =
  | "announcements"
  | "clockIn"
  | "tasks"
  | "horses"
  | "shows"
  | "invoices"
  | "shop";

export const barn = {
  id: "crouse",
  name: "Crouse Equestrian",
  shortName: "Crouse",
  /** Owner / admin. Displayed in the app shell and used in copy. */
  owner: "Belle Crouse",
  /** Free-text service area. Not used for geocoding. */
  area: "Asheville / Candler, NC",
  /** IANA timezone. All timestamptz values render in this zone. */
  timezone: "America/New_York",

  brand: {
    // PROVISIONAL — confirm exact hex with Belle / official brand assets before Phase 1.
    // Read from the Squarespace site by eye; these are approximations, not brand values.
    gold: "#C7A24A",
    cream: "#F6F1E7",
    ink: "#2B2B2B",
    // PLACEHOLDER logo — replace with Belle's real wordmark (transparent SVG/PNG).
    logoSrc: "/brand/crouse-logo.svg",
  },

  /** Lesson durations offered by the template wizard (Phase 1). */
  lessons: { privateMin: 45, groupMin: 60 },

  /** Minutes before lesson start after which a cancellation no longer prompts backfill. */
  backfillCutoffMinutes: 120,

  /**
   * PLACEHOLDER — staff clock-in geofence (Phase 1). Get the farm's real
   * coordinates and an acceptable radius from Belle. Null = geofence disabled.
   */
  geofence: { lat: null, lng: null, radiusM: null } as {
    lat: number | null;
    lng: number | null;
    radiusM: number | null;
  },

  /**
   * Feature flags. Phase 0 ships the shell only — every feature surface is off.
   * Later phases flip their own flag on as the feature lands.
   */
  features: {
    announcements: false,
    clockIn: false,
    tasks: false,
    horses: false,
    shows: false,
    invoices: false,
    shop: false,
  } satisfies Record<BarnFeatureFlag, boolean>,

  /** PWA install-prompt copy. Kept here so a clone can reword it. */
  pwa: {
    installTitle: "Add to your home screen",
    installBody: "Install the app for one-tap access from your phone.",
  },
} as const;

export type Barn = typeof barn;

/** Convenience guard so callers read flags in one obvious way. */
export function featureEnabled(flag: BarnFeatureFlag): boolean {
  return barn.features[flag];
}
