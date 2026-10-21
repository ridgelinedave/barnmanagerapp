"use client";

import { useEffect, useRef, useState } from "react";
import type { Playback } from "@/lib/video";
import { crossedCompletion } from "@/lib/academy-format";

/**
 * THE ONE PLAYER (DESIGN-MASTER §8). Every learning video renders through
 * this component, from a `Playback` the one resolver (lib/video.ts) produced.
 * Swapping provider changes what the resolver returns, not this.
 *
 * Today that is Cloudflare Stream's own player in an iframe: it does adaptive
 * bitrate, so a lesson keeps playing on barn wifi by dropping quality instead
 * of stalling, and its address carries a short-lived signed token minted on
 * the server for this viewer only.
 *
 * A fixed 16:9 frame, so nothing jumps when the player loads. A 1px hairline,
 * no shadow, the small radius — the player is the content, not a card.
 *
 * IT ASKS TO AUTOPLAY. Tapping a lesson is the request to watch it, so the
 * lesson screen should not need a third tap. The browser has the last word:
 * where its autoplay policy refuses (iOS Safari, for sound), the player shows
 * its play button instead. The player is above the fold, so it is not
 * lazy-loaded.
 *
 * PROGRESS. With `onPlay` / `onComplete`, the player listens through
 * Cloudflare's Player API (the SDK script talks to the iframe by
 * postMessage; it never sees the token or the account): the first play calls
 * `onPlay` (enrol), and crossing 90% — or the end — calls `onComplete` once.
 *
 * THE ADDRESS IS HELD FOR THE LIFE OF THE PLAYER. Each server render mints a
 * fresh token, so a refresh (which ticking a lesson off causes) would hand
 * the iframe a new address and restart the video mid-lesson. The first
 * address is kept; it is valid for two hours.
 */
type StreamApi = {
  addEventListener(event: string, handler: () => void): void;
  removeEventListener(event: string, handler: () => void): void;
  currentTime: number;
  duration: number;
};

declare global {
  interface Window {
    Stream?: (iframe: HTMLIFrameElement) => StreamApi;
  }
}

const SDK_SRC = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
let sdkLoading: Promise<void> | null = null;

function loadStreamSdk(): Promise<void> {
  if (window.Stream) return Promise.resolve();
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkLoading = null;
      reject(new Error("The player API did not load."));
    };
    document.head.appendChild(script);
  });
  return sdkLoading;
}

export function VideoPlayer({
  playback,
  title,
  onPlay,
  onComplete,
}: {
  playback: Playback;
  title: string;
  /** Called once, on the first play. */
  onPlay?: () => void;
  /** Called once per crossing of 90%, or at the end. */
  onComplete?: () => void;
}) {
  const [src] = useState(() =>
    playback.kind === "iframe" ? `${playback.src}${playback.src.includes("?") ? "&" : "?"}autoplay=true` : null,
  );
  const frame = useRef<HTMLIFrameElement>(null);
  const handlers = useRef({ onPlay, onComplete });
  useEffect(() => {
    handlers.current = { onPlay, onComplete };
  }, [onPlay, onComplete]);

  const tracking = Boolean(onPlay || onComplete);
  useEffect(() => {
    const iframe = frame.current;
    if (!tracking || !iframe) return;
    let player: StreamApi | null = null;
    let cancelled = false;
    let played = false;
    let last = 0;
    let finished = false;

    const handlePlay = () => {
      if (played) return;
      played = true;
      handlers.current.onPlay?.();
    };
    const complete = () => {
      if (finished) return;
      finished = true;
      handlers.current.onComplete?.();
    };
    const handleTime = () => {
      if (!player) return;
      const now = player.currentTime;
      if (crossedCompletion(last, now, player.duration)) complete();
      // A seek back below the mark arms it again.
      if (now < last) finished = false;
      last = now;
    };
    const handleEnded = () => complete();

    loadStreamSdk()
      .then(() => {
        if (cancelled || !window.Stream) return;
        player = window.Stream(iframe);
        player.addEventListener("play", handlePlay);
        player.addEventListener("timeupdate", handleTime);
        player.addEventListener("ended", handleEnded);
      })
      .catch(() => {
        // Without the API the video still plays; the circle still ticks by hand.
      });

    return () => {
      cancelled = true;
      player?.removeEventListener("play", handlePlay);
      player?.removeEventListener("timeupdate", handleTime);
      player?.removeEventListener("ended", handleEnded);
    };
  }, [tracking]);

  if (playback.kind === "none" || !src) {
    return (
      <div className="flex aspect-video w-full items-center rounded-card border border-line bg-sunk px-4">
        <p className="text-label text-muted">
          {playback.kind === "none" && playback.reason === "no-video"
            ? "No video on this lesson yet."
            : "This video can't be played here right now."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-card border border-line bg-ink">
        <iframe
          ref={frame}
          src={src}
          title={title}
          className="absolute inset-0 size-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {!playback.ready && <p className="text-caption text-muted">Still processing. A new upload can take a few minutes.</p>}
    </div>
  );
}
