import Image from "next/image";
import { barn } from "@/config/barn";

/**
 * The branded launch screen, shown while the shell resolves who is looking.
 *
 * Used as the Suspense fallback for the app layout, so an installed PWA opens
 * on the crest rather than on a white flash followed by a jump. Everything is
 * config-driven: a clone changes /config/barn.ts and gets its own.
 *
 * The indicator is a slow pulse rather than a spinner — this is a sub-second
 * wait most of the time, and a spinner makes a fast thing feel slow. Motion is
 * dropped entirely under prefers-reduced-motion (see globals.css).
 */
export function LaunchScreen() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-6"
      style={{ backgroundColor: barn.pwa.launchBackground }}
    >
      <Image
        src={barn.brand.logoSrc}
        alt={barn.name}
        width={160}
        height={160}
        priority
        className="size-40"
      />
      <span
        aria-hidden="true"
        className="h-1 w-24 animate-pulse rounded-full"
        style={{ backgroundColor: barn.brand.gold, opacity: 0.7 }}
      />
      <span className="sr-only">Loading {barn.name}</span>
    </div>
  );
}
