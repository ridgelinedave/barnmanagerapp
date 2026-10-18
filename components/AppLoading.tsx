"use client";

import { useState } from "react";
import { LaunchScreen } from "@/components/LaunchScreen";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { hasBooted } from "@/lib/boot";
import { BUCKET_FRAME, DEFAULT_LAYOUT, bucketMainClass } from "@/components/layout-buckets";

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

  // On the desktop shell the sidebar is already painted beside this fallback,
  // so a cold load would show the crest in a panel next to live navigation.
  // From `lg` the launch field covers the whole window instead, continuous
  // with sign-in exactly as it is on a phone. Below `lg` nothing changes.
  if (cold)
    return (
      <div className="lg:fixed lg:inset-0 lg:z-50">
        <LaunchScreen />
      </div>
    );

  // The skeleton is drawn in the DEFAULT bucket: this one fallback stands in
  // for every screen and cannot know which it is waiting for. A screen that is
  // promoted to `split` or `wide` should get its own loading.tsx in the same
  // bucket, or its content will jump sideways when it lands.
  return (
    <>
      {/* The masthead's own height, in its own colour, so the oxblood bar does
          not blink out and back in between screens. */}
      <div aria-hidden="true" className="safe-top sticky top-0 z-30 border-b-2 border-gold bg-deep">
        <div className={`mx-auto flex h-[3.75rem] ${BUCKET_FRAME[DEFAULT_LAYOUT]} items-center lg:h-18`} />
      </div>

      <main className={bucketMainClass(DEFAULT_LAYOUT)}>
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
