import "server-only";

import { streamPlayback } from "@/lib/stream";

/**
 * THE ONE PLAYBACK RESOLVER (DESIGN-MASTER §8, the provider seam).
 *
 * A lesson stores a provider and an external video id; this turns that into
 * something the one player component can render. A second provider is a new
 * case here and a new value in the database CHECK — nothing else changes.
 *
 * THE ARGUMENT MUST BE A ROW THE VIEWER'S OWN SESSION READ. That is the whole
 * privacy model: the lesson came back from `learning_lessons` under RLS, whose
 * read policy is the module audience check, so a viewer who may not see the
 * module never has a row to pass in. There is no route, server action or API
 * that takes a bare video id from a client and returns playback.
 */
export type LessonVideo = { video_provider: string; video_id: string | null };

export type Playback =
  | { kind: "iframe"; src: string; ready: boolean }
  | { kind: "none"; reason: "no-video" | "unavailable" };

export async function resolveLessonPlayback(lesson: LessonVideo): Promise<Playback> {
  if (!lesson.video_id) return { kind: "none", reason: "no-video" };

  switch (lesson.video_provider) {
    case "cloudflare_stream": {
      const playback = await streamPlayback(lesson.video_id);
      return { kind: "iframe", src: playback.iframe, ready: playback.ready };
    }
    default:
      // A provider the database allows but this build does not know — say so
      // rather than guess. The CHECK makes this unreachable today.
      return { kind: "none", reason: "unavailable" };
  }
}
