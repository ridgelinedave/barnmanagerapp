import type { Playback } from "@/lib/video";

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
 */
export function VideoPlayer({ playback, title }: { playback: Playback; title: string }) {
  if (playback.kind === "none") {
    return (
      <div className="flex aspect-video w-full items-center rounded-card border border-line bg-sunk px-4">
        <p className="text-label text-muted">
          {playback.reason === "no-video"
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
          src={playback.src}
          title={title}
          className="absolute inset-0 size-full border-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {!playback.ready && (
        <p className="text-caption text-muted">
          Still being prepared — a freshly uploaded video can take a few minutes before it plays.
        </p>
      )}
    </div>
  );
}
