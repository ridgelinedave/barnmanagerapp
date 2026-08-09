import type { SVGProps } from "react";

/**
 * The icon set.
 *
 * One family, one stroke width, one size token — mixing stroke weights or
 * pulling icons from three libraries is the fastest way to make an interface
 * look assembled rather than designed.
 *
 * THERE ARE NO EMOJI IN THIS APP. Not as icons, not as decoration, not beside
 * a greeting. An emoji renders differently on every phone, cannot be themed,
 * cannot take a stroke weight, and is the fastest way to make a tool look like
 * a toy. `EmptyState` and `Board` no longer accept an emoji prop at all, so it
 * cannot creep back in one screen at a time.
 */
export type IconName =
  | "chevron"
  | "arrow"
  | "back"
  | "plus"
  | "calendar"
  | "check"
  | "alert"
  | "clock"
  | "document"
  | "horse"
  | "bell"
  | "home"
  | "grid"
  | "list"
  | "pin"
  | "bucket"
  | "eye"
  | "eyeOff";

const PATHS: Record<IconName, string> = {
  chevron: "m9 6 6 6-6 6",
  /** The trailing mark on a primary button. */
  arrow: "M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5",
  back: "M19 12H5m0 0 6-6m-6 6 6 6",
  plus: "M12 5v14M5 12h14",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.4 5.3A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.2 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 3.6-.7",
  calendar:
    "M7 3v3m10-3v3M3.5 9.5h17M5 6h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 6Z",
  check: "m5 12.5 4.5 4.5L19 7",
  alert: "M12 8v5m0 3.5v.5M10.3 3.9 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3.25 2",
  document: "M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z",
  // A stylised horse head — the app's own mark, not a generic animal glyph.
  horse:
    "M7 21c0-4 1-6.5 3.5-8.5M5 4.5 8 7c1.6-1 3.4-1.5 5.5-1.5 3.6 0 6.5 2.6 6.5 6.2 0 2.3-1 4-2.7 5.3-1.4 1-2.3 2.3-2.6 4M5 4.5 4 8l3 1M16 10h.01",
  bell: "M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5ZM10.3 19a2 2 0 0 0 3.4 0",
  home: "M3 10.5 12 3l9 7.5M5.25 9.75V20a1 1 0 0 0 1 1h3.5v-5.5h4.5V21h3.5a1 1 0 0 0 1-1V9.75",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  list: "M4 7h2.5M4 12h2.5M4 17h2.5M10 7h10M10 12h10M10 17h10",
  pin: "M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  bucket: "M4 7h16l-1.6 12.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8L4 7Zm4-3h8l1 3H7l1-3Z",
};

export function Icon({
  name,
  className = "size-5",
  strokeWidth = 1.75,
  ...rest
}: { name: IconName; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
