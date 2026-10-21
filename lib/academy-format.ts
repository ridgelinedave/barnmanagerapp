/**
 * The Academy's pure helpers — no I/O, safe on server and client.
 *
 * Kept apart from the data layer so the presentational components (Phase 2)
 * and the tests can use them without pulling in Supabase.
 */

/**
 * A lesson's length, or "Processing" while Stream is still encoding.
 * Duration arrives from Stream once processing finishes; until then it is
 * null, and the screen must never show a blank or a zero.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "Processing";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Course percentage: completed PUBLISHED lessons over total published lessons, whole percent. */
export function coursePercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/** "3 sections · 24 lessons" — singular where it is one. */
export function outlineSummary(sections: number, lessons: number): string {
  const s = `${sections} ${sections === 1 ? "section" : "sections"}`;
  const l = `${lessons} ${lessons === 1 ? "lesson" : "lessons"}`;
  return `${s} · ${l}`;
}

/**
 * A lesson counts as watched at 90% — the credits and the last "see you next
 * time" are not the lesson. The same for every barn, so it lives here, not in
 * config/barn.ts.
 */
export const COMPLETE_AT = 0.9;

/**
 * Whether playback just CROSSED the completion mark, moving forward: the
 * previous position was below it and this one is at or past it. Crossing,
 * not "is past", so a member who un-ticks a lesson by hand and keeps
 * watching the last tenth is not re-ticked on every time update.
 */
export function crossedCompletion(previous: number, current: number, duration: number): boolean {
  if (!(duration > 0)) return false;
  const mark = duration * COMPLETE_AT;
  return previous < mark && current >= mark;
}
