/**
 * The Academy upload POLICY — pure, used by the server (to mint a link) and
 * the browser (to show what will happen). No I/O.
 *
 * Every file goes up over tus, browser -> Cloudflare, in 10 MiB chunks: on
 * flaky barn wifi a dropped chunk is re-sent whole, and 10 MiB keeps that
 * retry cheap. 10 MiB is a multiple of 256 KiB and above Cloudflare's 5 MiB
 * minimum chunk (their maximum is 200 MiB).
 */
export const CHUNK_BYTES = 10 * 1024 * 1024;

/** When the browser cannot read a file's duration: 4 hours, and the row says so. */
export const FALLBACK_MAX_DURATION_SECONDS = 4 * 60 * 60;

/** Cloudflare's own ceiling for maxDurationSeconds. */
const STREAM_MAX_DURATION_SECONDS = 36_000;

/**
 * The storage Cloudflare reserves while the upload runs: the file's REAL
 * duration, read in the browser from its metadata (nothing uploaded), rounded
 * up, plus 10% and a minute. A blanket cap on ten files would reserve far
 * more than they need.
 */
export function maxDurationFor(durationSeconds: number | null | undefined): { seconds: number; fromFile: boolean } {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { seconds: FALLBACK_MAX_DURATION_SECONDS, fromFile: false };
  }
  const seconds = Math.ceil(Math.ceil(durationSeconds) * 1.1) + 60;
  return { seconds: Math.min(seconds, STREAM_MAX_DURATION_SECONDS), fromFile: true };
}

/**
 * The link's expiry. PROVED 2026-10-21: an expired link refuses the rest of an
 * upload already in progress (Cloudflare error 10017), so the expiry must
 * outlast a SLOW upload of the whole file. Budget: 32 KB/s (~0.25 Mbit/s,
 * poor barn wifi) for this file's size, never under 2 hours, and never over
 * the 24 hours Cloudflare accepts (48 h was refused). Each file's link is
 * minted just before that file starts, so a queue cannot outlive its links.
 * An abandoned link holds its reservation until it expires.
 */
const SLOW_BYTES_PER_SECOND = 32 * 1024;
const MIN_EXPIRY_SECONDS = 2 * 60 * 60;
const MAX_EXPIRY_SECONDS = 24 * 60 * 60;

export function expiryFor(sizeBytes: number, now: Date = new Date()): Date {
  const seconds = Math.min(MAX_EXPIRY_SECONDS, Math.max(MIN_EXPIRY_SECONDS, Math.ceil(sizeBytes / SLOW_BYTES_PER_SECOND)));
  return new Date(now.getTime() + seconds * 1000);
}

/** "Stirrups On.mp4" -> "Stirrups On". Lessons are titled from the filename, editable after. */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return base || "Untitled lesson";
}

/** Natural filename order: "Lesson 2" before "Lesson 10". */
export function byFilename(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * What to tell the barn owner when the video service says no — in plain
 * words, each ending in what to do next. Keyed on the HTTP status (and
 * Cloudflare's 10017, "link expired"), never on Cloudflare's message text.
 *
 * Cloudflare documents 413 and 429 for uploads over its limits, including an
 * account whose storage is full; it names no separate code for that, so both
 * read as "busy or full".
 */
export function uploadProblem(status: number | null | undefined, body?: string | null): string {
  if (body && /10017|expired/i.test(body)) return "The upload link ran out before the file finished. Press Retry to send this file again.";
  if (status === 413) return "This file is bigger than the video service accepts (30 GB). Export a smaller copy and add it again.";
  if (status === 429) {
    return "The video service is busy, or the barn's video storage is full. Wait a few minutes and press Retry. If it keeps happening, the storage plan needs more room.";
  }
  if (status === 401 || status === 403) {
    return "The video service turned down the barn's account. This can't be fixed from here: take a screenshot of this message for support.";
  }
  if (status && status >= 400 && status < 500) {
    return "The video service would not take this file. Press Retry. If it happens again, take a screenshot of this message for support.";
  }
  return "Couldn't reach the video service. Check the internet connection, then press Retry.";
}

/** The HTTP status inside a StreamError message ("… HTTP 429 …"), if any. */
export function statusFromMessage(message: string): number | null {
  const m = /HTTP (\d{3})/.exec(message);
  return m ? Number(m[1]) : null;
}
