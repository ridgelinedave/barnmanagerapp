/**
 * The position a member reached in each lesson, remembered in THIS browser so
 * a lesson picks up where they left off on the same device. Across devices
 * needs a table (learning_positions, in supabase/pending/ for audit); until
 * then this is the whole of it. Guarded: blocked storage just means starting
 * from the top.
 */
const KEY = (lessonId: string) => `monarch.academy.position.${lessonId}`;

export function savedPosition(lessonId: string): number | null {
  try {
    const v = Number(window.localStorage.getItem(KEY(lessonId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function savePosition(lessonId: string, seconds: number) {
  try {
    window.localStorage.setItem(KEY(lessonId), String(Math.floor(seconds)));
  } catch {
    // Storage blocked or full: the lesson simply starts from the top next time.
  }
}

export function clearPosition(lessonId: string) {
  try {
    window.localStorage.removeItem(KEY(lessonId));
  } catch {
    // As above.
  }
}
