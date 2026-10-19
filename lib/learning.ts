import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Learning modules (migration 0023). EVERY read here runs on the caller's own
 * session, so RLS decides who sees what: admin everything, staff published
 * modules, families published modules in their audience. Nothing here
 * filters by role — a filter written here would be a second copy of the rule.
 */

export type LearningModule = {
  id: string;
  title: string;
  description: string;
  position: number;
  published: boolean;
  audience: "all" | "level";
  audience_level_id: string | null;
};

export type LearningLesson = {
  id: string;
  module_id: string;
  title: string;
  notes: string;
  position: number;
  video_provider: string;
  video_id: string | null;
  duration_seconds: number | null;
};

const MODULE_COLUMNS = "id, title, description, position, published, audience, audience_level_id";
const LESSON_COLUMNS =
  "id, module_id, title, notes, position, video_provider, video_id, duration_seconds";

/** Every module this viewer may see, in order, with its lesson count. */
export async function listModules(): Promise<(LearningModule & { lessonCount: number })[]> {
  const supabase = await createClient();
  const { data: modules } = await supabase
    .from("learning_modules")
    .select(MODULE_COLUMNS)
    .order("position");
  if (!modules || modules.length === 0) return [];

  const { data: lessons } = await supabase
    .from("learning_lessons")
    .select("module_id")
    .in(
      "module_id",
      modules.map((m) => m.id),
    );
  const counts = new Map<string, number>();
  for (const row of lessons ?? []) counts.set(row.module_id, (counts.get(row.module_id) ?? 0) + 1);

  return (modules as LearningModule[]).map((m) => ({ ...m, lessonCount: counts.get(m.id) ?? 0 }));
}

/** One module and its lessons in order, or null when the viewer may not see it. */
export async function loadModule(
  moduleId: string,
): Promise<{ module: LearningModule; lessons: LearningLesson[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(moduleId)) return null;
  const supabase = await createClient();
  const { data: module } = await supabase
    .from("learning_modules")
    .select(MODULE_COLUMNS)
    .eq("id", moduleId)
    .maybeSingle();
  if (!module) return null;

  const { data: lessons } = await supabase
    .from("learning_lessons")
    .select(LESSON_COLUMNS)
    .eq("module_id", moduleId)
    .order("position");

  return { module: module as LearningModule, lessons: (lessons ?? []) as LearningLesson[] };
}

/** "12:05" from seconds. */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
