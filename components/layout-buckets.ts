/**
 * Layout buckets — how wide a screen is allowed to be, and how many columns it
 * gets, on the desktop shell (DESIGN-MASTER §14b).
 *
 * A screen DECLARES its bucket with one prop on `TabPage` (`layout="wide"`).
 * It never writes its own max-width, so the header above it, the loading
 * skeleton and the page body cannot drift apart.
 *
 * BELOW THE `lg` BREAKPOINT EVERY BUCKET IS TODAY'S CAPPED READING COLUMN,
 * byte for byte. The buckets only differ from `lg` up. That is what lets a
 * screen be promoted later without anyone re-measuring it on a phone, and why
 * the default — `reading` — changes nothing for a screen nobody has revisited.
 *
 *   reading  the 640px column, centred. The default; every screen today.
 *   split    master-detail. Two columns from `lg`: the list, then the record
 *            (`TabPage`'s `detail` slot). Below `lg` they stack, list first.
 *   wide     fluid to the content area, for a data table. Tables are right on
 *            desktop and still wrong on the mobile shell.
 *
 * Plain strings in a .ts file so Tailwind's source scan sees every class.
 */
export type LayoutBucket = "reading" | "split" | "wide";

export const DEFAULT_LAYOUT: LayoutBucket = "reading";

/** The cap and side padding, shared by the header row and the page body. */
export const BUCKET_FRAME: Record<LayoutBucket, string> = {
  reading: "max-w-screen-sm px-4",
  split: "max-w-screen-sm px-4 lg:max-w-6xl lg:px-8",
  wide: "max-w-screen-sm px-4 lg:max-w-none lg:px-8",
};

/**
 * The page body. `pb-28` clears the 56px tab bar plus the home indicator; on
 * the desktop shell there is no tab bar, so the bottom padding drops back.
 */
export function bucketMainClass(layout: LayoutBucket): string {
  return `mx-auto w-full ${BUCKET_FRAME[layout]} flex-1 pb-28 pt-5 lg:pb-12`;
}
