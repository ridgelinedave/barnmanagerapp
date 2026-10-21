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
