import Image from "next/image";
import { barn } from "@/config/barn";

/**
 * The launch screen, shown while the shell resolves who is looking.
 *
 * BLACK, not grey. The old field was #2B2B2B, which put the crest on a grey
 * card and read as an unfinished placeholder. It is now the same black as the
 * sign-in screen and the generated splash PNGs, so launch → splash → sign-in
 * is one continuous surface instead of three near-blacks.
 *
 * The mark fades and scales in rather than appearing: a sub-second wait that
 * arrives calmly feels intentional, where an instant pop feels like a glitch
 * and a spinner makes a fast thing feel slow. Motion is dropped entirely under
 * prefers-reduced-motion (see globals.css).
 */
export function LaunchScreen() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-5"
      style={{ backgroundColor: barn.pwa.launchBackground }}
    >
      {/*
       * The crest alone. It is a full lockup — it already reads CROUSE and
       * EQUESTRIAN — so the typeset name that used to sit under it was the
       * barn's name printed twice, once well and once badly.
       */}
      <div className="animate-brand-in">
        <Image
          src={barn.brand.logoSrc}
          alt=""
          width={340}
          height={340}
          priority
          className="size-44"
        />
      </div>
      <span className="sr-only">Loading {barn.name}</span>
    </div>
  );
}
