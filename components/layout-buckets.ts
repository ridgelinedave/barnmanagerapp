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
 * Density — the vertical rhythm between blocks. Identical padding everywhere
 * is what makes a screen feel machine-made, so a screen says which it is:
 *
 *   tight   a list of things to scan (tables, rosters, supply lists)
 *   normal  the default
 *   airy    a record about one thing (a horse's profile, a show)
 */
export type Density = "tight" | "normal" | "airy";

export const DENSITY_GAP: Record<Density, string> = {
  tight: "gap-3 lg:gap-4",
  normal: "gap-5",
  airy: "gap-7 lg:gap-9",
};

/**
 * The page body. `pb-28` clears the 56px tab bar plus the home indicator; on
 * the desktop shell there is no tab bar, so the bottom padding drops back.
 */
export function bucketMainClass(layout: LayoutBucket): string {
  return `mx-auto w-full ${BUCKET_FRAME[layout]} flex-1 pb-28 pt-5 lg:pb-12 lg:pt-6`;
}
