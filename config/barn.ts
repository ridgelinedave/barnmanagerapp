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
  | "invites"
  | "shows"
  | "invoices"
  | "shop";

/**
 * THE PRODUCT. Monarch is what this software is; a barn is a skin on it.
 *
 * Kept in its own object, deliberately separate from `barn` below, because the
 * split IS the white-label model: everything here ships identically to every
 * barn, and everything in `barn.brand.accent` swaps per tenant. When this
 * becomes multi-tenant (§16e) `barn` moves into a database row and this object
 * does not move at all.
 */
export const monarch = {
  name: "Monarch",
  descriptor: "Barn Management Software",

  /**
   * Electric Cobalt — the default accent any barn gets before someone picks
   * their own. Measured: 5.17:1 carrying white, 5.17:1 as text on white.
   */
  accent: {
    fill: "#2563EB",
    /** Text and icons ON the fill. */
    on: "#FFFFFF",
    /** Pale ground for chips and hover. */
    tint: "#E6EDFD",
    /**
     * The accent used AS TEXT. Deeper than the fill on purpose: #2563EB is
     * 4.40:1 on its own tint, which fails AA by a hair. #1D4FC4 is 7.08:1 on
     * white and 6.03:1 on the tint.
     */
    text: "#1D4FC4",
  },

  /**
   * Cinzel, for the Monarch wordmark ONLY — the marketing surfaces, the
   * "powered by" mark, the product name where it appears. App UI headings stay
   * Barlow Condensed. A Roman inscription face is right for a logotype and
   * wrong for a screen title someone reads forty times a day.
   */
  wordmarkFont: "Cinzel",
} as const;

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

  /**
   * BLACK · WHITE · GOLD. There is no cream in this app.
   *
   * Light content, dark chrome — paper-white screens so a phone stays readable
   * in daylight, near-black header and tab bar, gold as the only accent. Every
   * value below is measured against the surface it actually sits on, and the
   * ratio is recorded beside it.
   *
   * TWO PLACES THIS DELIBERATELY DIVERGES FROM design/mockups, both because
   * accessibility outranks the design system when they disagree:
   *
   *   the mockup's `--muted:#8A857C` measures 3.67:1 on white and fails AA for
   *   body text, so secondary text here is one step darker;
   *
   *   the mockup's `--gold-deep:#C9AA3F` measures 2.26:1 on white. It is kept
   *   EXACTLY as the mockup uses it — a pressed/hover SURFACE under the gold
   *   button — and a separate, darker gold carries text.
   *
   * Do not "simplify" either back to a single value.
   */
  brand: {
    /**
     * ===================================================================
     * THE ACCENT — the whole white-label mechanism, in four values.
     * ===================================================================
     *
     * This is the ONLY colour block that differs per barn. Swap these four and
     * the app is that barn's; everything else — white ground, dark text, type,
     * components, motion — is Monarch and is shared. Omit them and a barn gets
     * `monarch.accent` (Electric Cobalt).
     *
     * WHY FOUR AND NOT ONE. A single accent value cannot survive contrast.
     * Crouse gold proves it: #DABC51 carries ink at 9.26:1 but white at only
     * 1.86:1, and as text on white it is 1.86:1 — unusable. So the accent is
     * split by JOB, not by shade:
     *
     *   fill  the surface        gold #DABC51        cobalt #2563EB
     *   on    text ON that fill  ink  #1C1B18 9.26   white  #FFFFFF 5.17
     *   tint  pale ground        #F8F2DC             #E6EDFD
     *   text  accent AS text     #776628 5.65/5.04   #1D4FC4 7.08/6.03
     *
     * `on` is what makes gold and cobalt interchangeable: the gold skin puts
     * dark ink on its buttons, the cobalt skin puts white on its buttons, and
     * no component has to know which barn it is rendering.
     *
     * A future Barn Settings screen (§16d) picks `fill` and DERIVES the other
     * three under these same rules, so no barn can choose an unreadable combo.
     */
    accent: {
      fill: "#DABC51",
      /** Gold is light: it carries ink, never white. */
      on: "#1C1B18",
      tint: "#F8F2DC",
      /** 5.65:1 on white, 5.04:1 on the gold tint. */
      text: "#776628",
    },

    /**
     * CONFIRMED — sampled from Belle's actual logo, not guessed.
     *
     * The mark is a metallic bevel, so its gold is a gradient: hue is locked
     * around 47° and saturation around 0.63, but value runs 0.26 → 0.90 across
     * 35 palette entries. `gold` is the single most-used gold pixel in the
     * image, i.e. the tone the eye reads as "the Crouse gold".
     *
     * A SURFACE colour: buttons, the chrome keyline, the active tab. Carries
     * ink at 9.26:1. Never used as text on white (1.86:1).
     */
    gold: "#DABC51",

    /**
     * The pressed state of that button, straight from the mockup. A SURFACE,
     * never text: 2.26:1 on white.
     */
    goldPress: "#C9AA3F",

    /**
     * TEXT gold — links, chip labels, the active nav label on white.
     * 5.65:1 on white, 5.46:1 on soft. Clears the AA floor with room.
     */
    goldDeep: "#776628",

    /** The page. Paper white, not a tinted near-white. */
    paper: "#FFFFFF",

    /** Sunk tiles and read-only rows. 16.49:1 carrying ink. */
    soft: "#FAFAF9",

    /**
     * Body text. MONARCH SHARED, not a barn value — every skin gets this ink.
     * A hair cooler than the old #1C1B18 so it sits with a blue accent as
     * comfortably as with gold. 17.38:1 on white.
     */
    ink: "#16192B",

    /**
     * The dark plane, now used ONLY by the sign-in screen and the splash.
     * The app's own chrome is white (see §16 / the Monarch mockup): a heavy
     * black bar at the top and bottom of every screen is a lot to look at all
     * day, and it was fighting the accent for attention.
     */
    charcoal: "#1C1B18",

    /** The splash/login field. A shade below the chrome so the logo sits in it. */
    black: "#0F0E0C",

    /**
     * SECONDARY — the pasture green. Clears AA as text on white (9.77:1) and as
     * a surface carrying white. Confirmations and "done" states.
     */
    forest: "#2F4A34",

    /** Cancellations, overdue care, destructive actions. 7.57:1 on white. */
    danger: "#9B2C1F",

    /**
     * Secondary text, and the INACTIVE tab label. 6.34:1 on white.
     *
     * The Monarch mockup uses #8A857C for secondary text (3.67:1) and #B7B4AC
     * for inactive nav (2.07:1). Both fail AA outright — #B7B4AC badly — and a
     * nav label you cannot read is a nav you have to learn by position. Same
     * grey family, dark enough to be read.
     */
    muted: "#5D5F6B",

    /** The hairline that does all the separating now that cards are retired. */
    line: "#E7E6E2",

    /** Tinted grounds for chips and callouts. All carry their own deep tone. */
    goldSoft: "#F8F2DC",
    forestSoft: "#E9EFE9",
    dangerSoft: "#F7E7E4",

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
    /**
     * Phase 2, provisioning slice — shipped. Migration 0017 audited and
     * applied 2026-07-31, advisor clean, policy suite green including the
     * invites section, and both live checks passed: a claim carrying a
     * tampered `role=admin` produced the INVITED role, and a claim on an
     * email that already has an account was refused rather than linked.
     *
     * This flag gates both the Team panel's invite UI and the public
     * `/invite/<token>` claim route — the one route in this app that creates
     * an auth user from an unauthenticated request. Turning it off kills every
     * outstanding invite link, which is the switch to reach for if a token is
     * ever leaked before revoking it individually is enough.
     */
    invites: true,
    shows: false,
    invoices: false,
    shop: false,
  } satisfies Record<BarnFeatureFlag, boolean>,

  /** PWA install-prompt and launch-screen copy. Kept here so a clone can reword it. */
  pwa: {
    installTitle: "Add to your home screen",
    installBody: "Install the app for one-tap access from your phone.",
    /**
     * BLACK, not grey. The old #2B2B2B put the logo on a grey card, which is
     * the thing that read as unfinished. This is the same field the sign-in
     * screen uses, so launch → sign-in is one continuous surface rather than
     * two shades of almost-black.
     *
     * Baked into the generated splash PNGs — changing it means re-running
     * `npm run brand:assets`, which this change did.
     */
    launchBackground: "#0F0E0C",
  },
} as const;

export type Barn = typeof barn;

/** Convenience guard so callers read flags in one obvious way. */
export function featureEnabled(flag: BarnFeatureFlag): boolean {
  return barn.features[flag];
}
