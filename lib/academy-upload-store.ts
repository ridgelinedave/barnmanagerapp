/**
 * Unfinished Academy uploads, remembered in THIS browser so that a reload, a
 * closed tab or a phone that locked mid-upload can carry on where Cloudflare
 * left off instead of starting again.
 *
 * What is kept is the one-time tus link for each video (good for that video
 * only, until its expiry — never the account token), the section it belongs
 * to and the file's name and size. The FILE itself cannot be kept: a browser
 * will not hand a page a file it was not just given. So an interrupted upload
 * that still has bytes to send asks for the same file again, matched by name
 * and size; one whose bytes are all in finishes without it.
 *
 * Per-browser by design (localStorage): the upload is happening from this
 * machine. Every read and write is guarded — storage can be blocked or full,
 * and losing this list only costs a re-upload, never data.
 */
export type SavedUpload = {
  name: string;
  size: number;
  sectionId: string;
  sectionTitle: string;
  title: string;
  uploadUrl: string;
  videoId: string;
  /** ISO time the tus link stops working (Cloudflare refuses it after). */
  expiresAt: string;
  durationSeconds: number | null;
};

const KEY = "monarch.academy.uploads.v1";

/** Same name and same size: the same file, for the purpose of resuming. */
export function sameFile(a: { name: string; size: number }, b: { name: string; size: number }): boolean {
  return a.name === b.name && a.size === b.size;
}

/** A link with under five minutes left is not worth resuming on. */
export function stillUsable(saved: Pick<SavedUpload, "expiresAt">, now: number = Date.now()): boolean {
  const t = Date.parse(saved.expiresAt);
  return Number.isFinite(t) && t - now > 5 * 60 * 1000;
}

function isSaved(value: unknown): value is SavedUpload {
  const v = value as SavedUpload;
  return (
    typeof v?.name === "string" &&
    typeof v.size === "number" &&
    typeof v.sectionId === "string" &&
    typeof v.uploadUrl === "string" &&
    typeof v.videoId === "string" &&
    typeof v.expiresAt === "string"
  );
}

export function readSaved(): SavedUpload[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isSaved) : [];
  } catch {
    return [];
  }
}

function write(list: SavedUpload[]) {
  try {
    if (list.length) window.localStorage.setItem(KEY, JSON.stringify(list));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Blocked or full storage: the upload still runs, it just cannot resume after a reload.
  }
}

export function rememberUpload(saved: SavedUpload) {
  write([...readSaved().filter((s) => s.videoId !== saved.videoId), saved]);
}

export function forgetUpload(videoId: string) {
  write(readSaved().filter((s) => s.videoId !== videoId));
}
