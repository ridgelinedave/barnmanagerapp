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
  | "care"
  | "documents"
  | "forms"
  | "events"
  | "lessons"
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
    /**
     * CONFIRMED — sampled from Belle's actual logo, not guessed.
     *
     * The mark is a metallic bevel, so its gold is a gradient: hue is locked
     * around 47° and saturation around 0.63, but value runs 0.26 → 0.90 across
     * 35 palette entries. `gold` is the single most-used gold pixel in the
     * image, i.e. the tone the eye reads as "the Crouse gold".
     */
    gold: "#dabc51",

    /**
     * The shadow end of that same gradient — also straight from the logo, not
     * invented. It exists because `gold` is a light tone: it scores 1.86:1
     * against white and 1.65:1 on cream, so it is unusable for text. Gold is
     * therefore a SURFACE colour (button and badge backgrounds, carrying ink
     * text at 7.61:1) and `goldDeep` is the TEXT colour (5.02:1 on cream,
     * 5.65:1 on white — both clear of the 4.5:1 AA floor).
     *
     * Accessibility outranks the design system when they disagree, so do not
     * "simplify" this back to one gold.
     */
    goldDeep: "#776628",

    // Chosen neutrals for the app surface. The crest itself is gold on
    // charcoal/black; cream keeps long screens readable on a phone in daylight.
    cream: "#F6F1E7",
    ink: "#2B2B2B",

    /**
     * CHROME — the charcoal the app's header, tab bar and launch field are cut
     * from. Deliberately NOT the same value as `ink`: text ink and a chrome
     * surface doing the same job at the same value makes the header read as
     * "big text block" rather than a separate plane. This is a touch deeper and
     * a touch warmer, so the gold sits on it the way it sits on the sign.
     *
     * Measured: white 17.22:1 · gold 9.26:1 · cream 15.30:1.
     */
    charcoal: "#1C1B18",

    /**
     * SECONDARY — the pasture green. One value doing two jobs, which is why
     * this particular green: it clears AA as TEXT on cream (8.68:1) *and* as a
     * SURFACE carrying white (9.77:1) or gold (5.25:1). Used for confirmations,
     * "done" states, and the quiet labels on a board.
     */
    forest: "#2F4A34",

    /** Cancellations, overdue care, destructive actions. 6.73:1 on cream. */
    danger: "#9B2C1F",

    /**
     * Secondary text. A measured 6.48:1 on cream rather than a percentage of
     * ink — "muted grey at 60% opacity" is how body copy quietly fails AA.
     */
    muted: "#5B564C",

    /** Hairline. Not a text colour, so no ratio applies; it must simply be seen. */
    line: "#E4DCCB",

    /** Tinted grounds for chips, callouts and tiles. All carry ink or their own deep tone. */
    goldSoft: "#F6EDD4",
    forestSoft: "#E7EDE5",
    dangerSoft: "#F6E5E2",
    /** Inset tiles inside a card — the stat-tile ground. */
    sunk: "#F1ECE0",

    logoSrc: "/brand/crouse-logo.png",
  },

  /** Lesson durations offered by the template wizard (Phase 1). */
  lessons: { privateMin: 45, groupMin: 60 },

  /** Minutes before lesson start after which a cancellation no longer prompts backfill. */
  backfillCutoffMinutes: 120,

  /**
   * PLACEHOLDER — rider age groups.
   *
   * A rider's age group is DERIVED from `dob`, never stored: an age column
   * would be wrong within a year of being typed, and there is exactly one true
   * source for how old someone is. Only the bracket boundaries are a barn fact,
   * so only they live here.
   *
   * These four brackets are the common horse-show divisions and are a
   * STARTING POINT, not Belle's. Confirm the real ones with her — different
   * disciplines cut them differently, and this is the sort of detail a parent
   * notices immediately. `maxAge` is inclusive; the last entry must be null,
   * meaning "and up".
   */
  riderAgeGroups: [
    { label: "10 & under", maxAge: 10 },
    { label: "11–13", maxAge: 13 },
    { label: "14–17", maxAge: 17 },
    { label: "Adult", maxAge: null },
  ] as readonly { label: string; maxAge: number | null }[],

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
    // Phase 1 slice 1 — shipped. Migration 0005 applied, policy suite green
    // (106 passed / 0 failed / 0 skipped).
    announcements: true,
    /**
     * Phase 1 slice 4 — shipped. Migration 0009 applied (including the
     * punched_at hardening from the audit), policy suite green
     * (281 passed / 0 failed / 0 skipped).
     */
    clockIn: true,
    // Phase 1 slice 2 — shipped. Migration 0006 applied, policy suite green
    // (137 passed / 0 failed / 0 skipped).
    tasks: true,
    /**
     * Phase 2 slice 1 — shipped. Migration 0010 applied, Security Advisor
     * clean, policy suite green (347 passed / 0 failed / 0 skipped), including
     * the three-tier horse visibility checked from BOTH families' logins.
     */
    horses: true,
    /**
     * Phase 2 slice 2 — shipped. Migration 0011 applied (including the
     * overdue-in-the-digest amendment from the audit), Security Advisor clean,
     * policy suite green (389 passed / 0 failed / 0 skipped).
     */
    care: true,
    /**
     * Phase 2 slice 3 — shipped. Migration 0012 applied, `npm run db:advisor`
     * clean (including the Storage lints), policy suite green.
     */
    documents: true,
    /**
     * Phase 2 slice 4 — shipped. Migration 0013 applied, advisor clean, policy
     * suite green.
     *
     * NOTE: the SPEC §5 "soft gate" — blocking parents from the rest of the app
     * until required forms are signed — is deliberately NOT wired up. The seam
     * is `onboardingOutstanding()` in lib/forms.ts. Locking a paying family out
     * of their lesson schedule over an unsigned waiver is a support call, so
     * switching it on is David's call, not mine.
     */
    forms: true,
    /**
     * Phase 2 slice 5 — shipped. Migration 0014 applied, advisor clean, policy
     * suite green.
     *
     * NOTE: this flag also gates `/api/ical/[token].ics` — turning it off kills
     * every live subscription URL, which is the switch to reach for if a token
     * is ever leaked before per-user rotation is enough.
     */
    events: true,
    /**
     * Phase 1 slices 3a + 3b — shipped. Migrations 0007 and 0008 applied,
     * policy suite green (241 passed / 0 failed / 0 skipped), including the
     * two-simultaneous-accepts race. The schedule → cancel → backfill story is
     * complete: a released seat is offered, and the first parent to accept
     * takes it.
     */
    lessons: true,
    shows: false,
    invoices: false,
    shop: false,
  } satisfies Record<BarnFeatureFlag, boolean>,

  /** PWA install-prompt and launch-screen copy. Kept here so a clone can reword it. */
  pwa: {
    installTitle: "Add to your home screen",
    installBody: "Install the app for one-tap access from your phone.",
    /**
     * The launch screen sits on the crest's own dark field rather than the
     * app's cream, so the gold mark reads the way it does on the sign — and so
     * the splash does not flash white before the first paint.
     */
    launchBackground: "#2B2B2B",
  },
} as const;

export type Barn = typeof barn;

/** Convenience guard so callers read flags in one obvious way. */
export function featureEnabled(flag: BarnFeatureFlag): boolean {
  return barn.features[flag];
}
