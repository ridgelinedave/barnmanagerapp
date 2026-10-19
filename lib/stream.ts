import "server-only";

import {
  describeVideo,
  mintPlaybackToken,
  playbackUrls,
  streamCredentialsFrom,
  type StreamCredentials,
} from "@/lib/stream-core";

/**
 * Cloudflare Stream for the app. SERVER-ONLY: `import "server-only"` makes
 * importing this from a client component a build error, and it is the ONE
 * module in app/components/lib that reads CLOUDFLARE_ACCOUNT_ID or
 * CLOUDFLARE_STREAM_TOKEN (scripts/check-service-key-leak.mjs enforces both).
 *
 * Neither variable may ever carry a NEXT_PUBLIC_ prefix — that prefix inlines
 * a value into the browser bundle. The leak check refuses one.
 */

/** Short-lived: long enough to watch a lesson, short enough to be useless shared. */
const PLAYBACK_TTL_SECONDS = 2 * 60 * 60;

function credentials(): StreamCredentials {
  // Read per call, not at module load, so a missing variable fails the page
  // that needs it with a clear message instead of breaking every import.
  return streamCredentialsFrom(process.env);
}

export type StreamPlayback = {
  iframe: string;
  /** False while Stream is still encoding a fresh upload. */
  ready: boolean;
};

/**
 * Mints a playback address for ONE video.
 *
 * CALLERS MUST HAVE ALREADY ASKED THE DATABASE. The only caller is
 * `resolveLessonPlayback` in lib/video.ts, which receives a lesson row that
 * came back from the viewer's own RLS session — so by the time this runs, the
 * module audience check has said yes. This function is the privileged step;
 * it has no way to decide who may watch, and must never be reached without
 * that check in front of it.
 */
export async function streamPlayback(videoId: string): Promise<StreamPlayback> {
  const creds = credentials();
  const video = await describeVideo(creds, videoId);

  // Fail closed: a video that is not private is not handed out, even to a
  // viewer who may see it — it would mean the upload step was skipped or
  // undone, and the barn should hear about that rather than ship it.
  if (!video.requireSignedURLs) {
    throw new Error("This video is not set to require signed URLs, so it will not be played.");
  }

  const token = await mintPlaybackToken(creds, videoId, PLAYBACK_TTL_SECONDS);
  return { iframe: playbackUrls(video.playbackHost, token).iframe, ready: video.readyToStream };
}
