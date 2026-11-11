import type { ReactNode } from "react";
import Image from "next/image";
import { PoweredByMonarch } from "@/components/Wordmark";
import { barn } from "@/config/barn";

/**
 * The signed-out door — sign in, password reset. (David, 2026-11-10: the
 * full-bleed oxblood field read as aggressive; the door is now white and
 * traditional, with the barn's colours as accents.)
 *
 * A white page and ONE bordered card, centred: a band of the barn's deep
 * colour across its top edge with a gold hairline under it (gold as
 * decoration only, never text), the barn's crest, then the form. Monarch's
 * signature sits below the card — the maker's mark at the edge, the crest
 * stays the hero.
 *
 * The crest is "barn skin" (config: barn.brand.logoSrc); everything else here
 * is Monarch's and ships the same to every barn.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-surface px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-[25rem] flex-1 flex-col justify-center">
        <div className="overflow-hidden rounded-card border border-rule bg-surface">
          <div aria-hidden="true" className="h-1.5 bg-deep" />
          <div aria-hidden="true" className="h-px bg-gold" />
          <div className="flex flex-col px-6 pb-7 pt-8 sm:px-8">
            {/* The crest already reads CROUSE EQUESTRIAN; with no other name on
                the screen, its alt text is the name. */}
            <Image
              src={barn.brand.logoSrc}
              alt={barn.name}
              width={340}
              height={340}
              priority
              className="mx-auto mb-6 size-28"
            />
            {children}
          </div>
        </div>
        <PoweredByMonarch className="mt-8" />
      </div>
    </div>
  );
}
