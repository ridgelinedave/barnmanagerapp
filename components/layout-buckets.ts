/**
 * Layout buckets — how wide a screen is allowed to be, and how many columns it
 * gets, on the desktop shell (DESIGN-MASTER §14b).
 *
 * A screen DECLARES its bucket with one prop on `TabPage` (`layout="wide"`).
 * It never writes its own max-width, so the header above it, the loading
 * skeleton and the page body cannot drift apart.
 *
 * BELOW THE `lg` BREAKPOINT EVERY BUCKET IS THE CAPPED READING COLUMN. The
 * buckets only differ from `lg` up, so promoting a screen never moves it on a
 * phone.
 *
 *   reading  the 640px column, centred. For a form, a profile, a feed — prose
 *            and single decisions. The default.
 *   split    master-detail. Two columns from `lg`: the list, then the record
 *            (`TabPage`'s `detail` slot). Below `lg` they stack, list first.
 *   wide     A DATA SCREEN. Fluid to the content area, capped at 80rem
 *            (1280px), 32px gutters. At a 1280px window that is ~960px of
 *            table beside the sidebar, at 1440 ~1120px, and on a big monitor
 *            it stops before a row becomes too long to read across. 640px is a
 *            phone column; a timesheet or a roster in it is a table squeezed
 *            into a card stack, which is the thing this bucket exists to end.
 *
 * Plain strings in a .ts file so Tailwind's source scan sees every class.
 */
export type LayoutBucket = "reading" | "split" | "wide";

export const DEFAULT_LAYOUT: LayoutBucket = "reading";

/** The cap and side padding, shared by the header row and the page body. */
export const BUCKET_FRAME: Record<LayoutBucket, string> = {
  reading: "max-w-screen-sm px-4",
  split: "max-w-screen-sm px-4 lg:max-w-6xl lg:px-8",
  wide: "max-w-screen-sm px-4 lg:max-w-[80rem] lg:px-8",
};

/**
 * The two column shapes of `split` from `lg` up.
 *
 *   master  the list, then the record — 2fr : 3fr. The default.
 *   player  the record is the wide one and the list is a side rail: a lesson
 *           player (video and its details) beside the course outline, 20rem,
 *           24rem from `xl`. At a 1280px window that leaves the video ~600px;
 *           the master shape would give it ~370px and the outline the rest.
 */
export type SplitShape = "master" | "player";

export const SPLIT_COLUMNS: Record<SplitShape, string> = {
  master: "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]",
  player: "lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]",
};

/**
 * Density — the vertical rhythm between blocks. Identical padding everywhere
 * is what makes a screen feel machine-made, so a screen says which it is.
 *
 * THE SCALE (2026-10-19), on a 4px base, used in these steps only:
 *   4 · 8 · 12 · 16 · 24 · 32 · 40
 *
 *   within a row      title → meta 2px; row padding 10px; a row is 56px on a
 *                     phone, 44px on a desk; rows butt, divided by the rule
 *   within a section  heading → content 12px (`gap-3`)
 *   between sections  tight 16px · normal 24px · airy 32px (40px on a desk)
 *   page              16px under the header (24px on a desk); 96px above the
 *                     48px tab bar and the home indicator
 *
 *   tight   a list of things to scan — every tab landing, rosters, supplies,
 *           horses, tasks, timesheets, the Academy
 *   normal  forms and mixed screens
 *   airy    a record about one thing (a horse's profile, a show, a lesson)
 */
export type Density = "tight" | "normal" | "airy";

export const DENSITY_GAP: Record<Density, string> = {
  tight: "gap-4",
  normal: "gap-6",
  airy: "gap-8 lg:gap-10",
};

/**
 * The page body. `pb-24` clears the 48px tab bar plus the home indicator; on
 * the desktop shell there is no tab bar, so the bottom padding drops back.
 */
export function bucketMainClass(layout: LayoutBucket): string {
  return `mx-auto w-full ${BUCKET_FRAME[layout]} flex-1 pb-24 pt-4 lg:pb-12 lg:pt-6`;
}
