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
   * OXBLOOD — Belle's scheme, and the default any barn gets before it picks
   * its own. Replaces Electric Cobalt (§16a).
   *
   * WHY THE FILL IS NOT THE HERO VALUE. Belle's oxblood is `#4A002A`, and it
   * is the right brand colour — but at L* 13.4 it is very dark. Measured two
   * ways, because contrast ratio alone answers the wrong question here:
   *
   *   luminance   #4A002A vs the body ink is 1.10:1 — nearly identical
   *               LIGHTNESS, which is what made it look like "basically black"
   *   perceptual  ΔE 32 from the ink and ΔE 38 from pure black — which is
   *               "obviously a different colour" to a human eye
   *
   * So it is genuinely wine and not black; the ratio was just measuring the
   * wrong property. It is kept verbatim as the TEXT and the hero field.
   *
   * The FILL is lifted to `#6E1A3D` anyway, for a different reason: a button
   * is a slab of colour rather than a stroke of it, and at L* 13.4 that slab
   * reads as near-black at a glance even though the pixels are wine. `#6E1A3D`
   * is L* 24.9, unmistakably wine as an area, and still carries white at
   * 11.18:1.
   */
  accent: {
    /** Lifted interactive wine. Buttons, active pills, avatars. */
    fill: "#6E1A3D",
    /** Text and icons ON the fill. 11.18:1. */
    on: "#FFFFFF",
    /** Blush — Belle's soft tint. Chips and hover grounds. */
    tint: "#F1E9E9",
    /**
     * Belle's hero oxblood, used AS TEXT. 15.85:1 on white and 13.27:1 on the
     * blush tint — and ΔE 32 from the body ink, so an accent link does not
     * read as ordinary body copy.
     */
    text: "#4A002A",
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
   * OXBLOOD · WHITE · GOLD (§16a). There is no cream and no cobalt in this app.
   *
   * White content, light chrome, one accent. Belle's scheme: oxblood carries
   * every interactive surface and every accent word, gold is decorative only,
   * blush is the soft tint. Every value below is measured against the surface
   * it actually sits on and the ratio is recorded beside it.
   *
   * THE ONE PLACE THIS DIVERGES FROM design/mockups, because accessibility
   * outranks the design system when they disagree: the Monarch mockup's
   * `--muted:#8A857C` is 3.67:1 on white and fails AA for body text, so
   * secondary text here is a step darker. Belle's charcoal #4B4B4B (8.72:1) is
   * available if that neutral is ever wanted instead.
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
     * `monarch.accent` (oxblood).
     *
     * WHY FOUR AND NOT ONE. A single accent value cannot survive contrast, and
     * the two skins built so far prove it from opposite ends: Crouse gold
     * (#DABC51) carries ink at 9.26:1 but white at 1.86:1, while Belle's
     * oxblood carries white at 15.85:1 and ink not at all. So the accent is
     * split by JOB, not by shade:
     *
     *   fill  the surface        oxblood #6E1A3D     gold #DABC51
     *   on    text ON that fill  white  11.18:1      ink  9.26:1
     *   tint  pale ground        blush  #F1E9E9      #F8F2DC
     *   text  accent AS text     #4A002A 15.85/13.27 #776628 5.65/5.04
     *
     * `on` is what makes them interchangeable: an oxblood skin puts white on
     * its buttons, a gold skin puts dark ink on its buttons, and no component
     * has to know which barn it is rendering.
     *
     * A future Barn Settings screen (§16d) picks `fill` and DERIVES the other
     * three under these same rules, so no barn can choose an unreadable combo.
     */
    accent: {
      // Belle authored both the product palette and this skin, so Crouse runs
      // the same oxblood as the Monarch default for now. A future barn
      // overrides these four and gets its own app; nothing else moves.
      fill: "#6E1A3D",
      on: "#FFFFFF",
      tint: "#F1E9E9",
      text: "#4A002A",
    },

    /**
     * Belle's gold — the SECONDARY, decorative value from her brand board.
     * It is the crest and small ornament. See goldPress below for why it can
     * never be text or a light-labelled fill.
     */
    gold: "#C2AE6D",

    /**
     * DECORATIVE ONLY, and the measurements say why.
     *
     * Belle's gold #C2AE6D is 2.19:1 as text on white and 2.19:1 carrying
     * white — it fails AA in both directions. The ONLY legible thing it can do
     * is carry dark ink (7.92:1). So it is the crest and small ornament, never
     * a text colour and never a button fill under a light label.
     *
     * It is deliberately NOT wired into the accent tokens. If it were, a
     * component saying `bg-accent text-accent-on` would render an unreadable
     * button the moment a barn chose gold.
     *
     * `goldPress` is Belle's gold one step down, for the pressed state of the
     * sign-in button — the one place gold IS a fill, because it sits on the
     * oxblood field carrying ink at 7.92:1 (5.83:1 pressed). Gold on oxblood
     * measures 7.22:1, which is why the crest reads on that screen.
     */
    goldPress: "#A8945A",

    /**
     * TEXT gold — links, chip labels, the active nav label on white.
     * 6.67:1 on white and 5.45:1 on the gold-tinted chip. Darkened from
     * #776628, which cleared white but only managed 4.62:1 on that chip.
     */
    goldDeep: "#6E5A20",

    /** White. CARDS are this; the page behind them is `page` below. */
    paper: "#FFFFFF",

    /**
     * The page ground — Belle’s blush. White cards float on it; on a white
     * page a white card could only be found by its hairline.
     * 13.8:1 carrying oxblood, 5.51:1 carrying muted.
     */
    page: "#F6EDEF",

    /** The staff-only chip ground. 5.45:1 carrying goldDeep. */
    goldTint: "#F0E7DA",

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

    /**
     * THE DEEP FIELD — the sign-in screen and the splash.
     *
     * Belle's hero oxblood. Was #0F0E0C near-black; this is the one screen in
     * the app that is deliberately a deep colour, and making it the brand's
     * own is the whole point — the gold crest on oxblood is Belle's brand
     * board, and gold on this field measures 6.79:1.
     *
     * Named `deep`, not `black`, because it is no longer black and a token
     * whose name lies is a token someone will misuse.
     */
    deep: "#4A002A",

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

    /** The hairline. Warmed to sit on the blush rather than fight it. */
    line: "#ECE2E4",

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
   * CONFIRMED BY BELLE — rider age groups.
   *
   * A rider's age group is DERIVED from `dob`, never stored: an age column
   * would be wrong within a year of being typed, and there is exactly one true
   * source for how old someone is. Only the bracket boundaries are a barn fact,
   * so only they live here.
   *
   * Both bounds are INCLUSIVE and the bands do not overlap or leave gaps —
   * every whole age from 6 to 80 falls in exactly one. A rider outside that
   * range CLAMPS to the nearest band rather than falling through: a five-year-
   * old on a lead line shows as 6–9 and an eighty-five-year-old shows as
   * 51–80, because "no age group" on a real rider reads as a bug, and the
   * barn would rather see the nearest true thing.
   *
   * Order matters — ageGroupFor() takes the first band the age fits, and the
   * clamp reads the first and last entries.
   */
  riderAgeGroups: [
    { label: "6–9", minAge: 6, maxAge: 9 },
    { label: "10–12", minAge: 10, maxAge: 12 },
    { label: "13–17", minAge: 13, maxAge: 17 },
    { label: "18–29", minAge: 18, maxAge: 29 },
    { label: "30–50", minAge: 30, maxAge: 50 },
    { label: "51–80", minAge: 51, maxAge: 80 },
  ] as readonly { label: string; minAge: number; maxAge: number }[],

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
     * OXBLOOD. Belle's #4A002A, the same field the sign-in screen uses, so
     * launch → splash → sign-in is one continuous surface. It was near-black
     * (#0F0E0C), and before that a grey card that read as unfinished.
     *
     * Baked into the generated splash PNGs — changing it means re-running
     * `npm run brand:assets`, which this change did.
     */
    launchBackground: "#4A002A",
  },
} as const;

export type Barn = typeof barn;

/** Convenience guard so callers read flags in one obvious way. */
export function featureEnabled(flag: BarnFeatureFlag): boolean {
  return barn.features[flag];
}
