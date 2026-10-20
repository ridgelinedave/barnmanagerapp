"use client";

import { useState, type ReactNode } from "react";

/**
 * A face photo that falls back when it cannot load.
 *
 * A stored photo URL can die — a renamed file, an expired signed URL, a seed
 * fixture pointing at an image that was never shipped — and a dead <img>
 * renders the browser's broken-image glyph where the horse's face should be.
 * On error this swaps in the fallback (the initials on a tint), so a missing
 * photo reads as "no photo", never as "broken".
 */
export function FaceImage({
  src,
  className,
  fallback,
}: {
  src: string;
  className: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;

  return (
    /* Signed per request and per viewer, so next/image cannot cache it. */
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt="" className={className} onError={() => setFailed(true)} />
  );
}
