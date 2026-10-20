"use client";

import { useEffect, useState } from "react";
import { formatBoardClock } from "@/lib/feed-board";

/**
 * The barn's date and time in the board header. Server-rendered with the
 * request's time so the first paint is right, then ticks every 30 seconds.
 * Blush (accent-tint) on oxblood: 13.27:1.
 */
export function BoardClock({ initial, timezone }: { initial: string; timezone: string }) {
  const [label, setLabel] = useState(initial);

  useEffect(() => {
    const id = window.setInterval(() => setLabel(formatBoardClock(new Date(), timezone)), 30_000);
    return () => window.clearInterval(id);
  }, [timezone]);

  return (
    <time className="hidden shrink-0 font-condensed text-[0.75rem] font-medium uppercase tracking-[0.24em] text-accent-tint md:block">
      {label}
    </time>
  );
}
