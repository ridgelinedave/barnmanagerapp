"use client";

import { useState } from "react";
import { LaunchScreen } from "@/components/LaunchScreen";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { hasBooted } from "@/lib/boot";

/**
 * What fills the screen while a page is still coming.
 *
 * TWO DIFFERENT WAITS, TWO DIFFERENT ANSWERS. This component is the fallback
 * for the whole (app) segment, so it stood in for both of them and showed the
 * black launch screen for each — which meant every tap on the bottom nav
 * blacked the app out and brought the crest back, as if it had relaunched.
 *
 *   COLD LOAD — no shell yet, no header, no tab bar. The branded field is
 *     right: it is continuous with the iOS splash and the sign-in screen, and
 *     it is the only thing there is to look at.
 *   IN-APP NAVIGATION — the tab bar is already under the user's thumb and the
 *     header is a known shape. Replacing all of that with a black screen throws
 *     away the context they were relying on. Skeletons keep the page's shape so
 *     the arriving content lands where it was already forming.
 *
 * `hasBooted()` is what tells them apart (see lib/boot.ts). It is read ONCE, in
 * a `useState` initialiser, so a mid-wait boot cannot swap the launch screen
 * for skeletons underneath someone.
 *
 * Nothing here is time-based: no minimum display, no delay before the skeleton
 * appears. Both states last exactly as long as the data does.
 */
export function AppLoading() {
  const [cold] = useState(() => !hasBooted());

  if (cold) return <LaunchScreen />;

  return (
    <>
      {/* The masthead's own height, in its own colour, so the oxblood bar does
          not blink out and back in between screens. */}
      <div aria-hidden="true" className="safe-top sticky top-0 z-30 border-b-2 border-gold bg-deep">
        <div className="mx-auto flex h-[3.75rem] max-w-screen-sm items-center px-4" />
      </div>

      <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 pb-28 pt-5">
        <span className="sr-only" role="status">
          Loading
        </span>
        <div aria-hidden="true" className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </main>
    </>
  );
}
