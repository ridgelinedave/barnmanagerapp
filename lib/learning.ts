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

/** A course's section (migration 0028). */
export type LearningSection = {
  id: string;
  module_id: string;
  title: string;
  position: number;
};

export type LearningLesson = {
  id: string;
  module_id: string;
  /** 0028: every lesson sits in a section of its own course. */
  section_id: string;
  title: string;
  notes: string;
  position: number;
  video_provider: string;
  video_id: string | null;
  duration_seconds: number | null;
};

const MODULE_COLUMNS = "id, title, description, position, published, audience, audience_level_id";
const LESSON_COLUMNS =
  "id, module_id, section_id, title, notes, position, video_provider, video_id, duration_seconds";
const SECTION_COLUMNS = "id, module_id, title, position";

/**
 * Reading order since 0028: by SECTION position, then lesson position. A
 * lesson's own position is only unique inside its section, so ordering by it
 * alone would interleave two sections.
 */
function inReadingOrder(lessons: LearningLesson[], sections: LearningSection[]): LearningLesson[] {
  const sectionRank = new Map(sections.map((s) => [s.id, s.position]));
  return [...lessons].sort(
    (a, b) =>
      (sectionRank.get(a.section_id) ?? 0) - (sectionRank.get(b.section_id) ?? 0) || a.position - b.position,
  );
}

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

/**
 * Every module this viewer may see, each with its lessons in order — the
 * Academy screen lists them expanded, so a lesson is one tap away. Two reads,
 * both on the viewer's session: RLS returns lessons only for readable modules.
 */
export async function listModulesWithLessons(): Promise<
  (LearningModule & { lessons: LearningLesson[]; sections: LearningSection[] })[]
> {
  const supabase = await createClient();
  const { data: modules } = await supabase
    .from("learning_modules")
    .select(MODULE_COLUMNS)
    .order("position");
  if (!modules || modules.length === 0) return [];
  const ids = modules.map((m) => m.id);

  const [{ data: lessons }, { data: sections }] = await Promise.all([
    supabase.from("learning_lessons").select(LESSON_COLUMNS).in("module_id", ids),
    supabase.from("learning_sections").select(SECTION_COLUMNS).in("module_id", ids).order("position"),
  ]);

  const allSections = (sections ?? []) as LearningSection[];
  const byModule = new Map<string, LearningLesson[]>();
  for (const lesson of (lessons ?? []) as LearningLesson[]) {
    byModule.set(lesson.module_id, [...(byModule.get(lesson.module_id) ?? []), lesson]);
  }
  return (modules as LearningModule[]).map((m) => {
    const own = allSections.filter((sec) => sec.module_id === m.id);
    return { ...m, sections: own, lessons: inReadingOrder(byModule.get(m.id) ?? [], own) };
  });
}

/** One module and its lessons in order, or null when the viewer may not see it. */
export async function loadModule(
  moduleId: string,
): Promise<{ module: LearningModule; lessons: LearningLesson[]; sections: LearningSection[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(moduleId)) return null;
  const supabase = await createClient();
  const { data: module } = await supabase
    .from("learning_modules")
    .select(MODULE_COLUMNS)
    .eq("id", moduleId)
    .maybeSingle();
  if (!module) return null;

  const [{ data: lessons }, { data: sections }] = await Promise.all([
    supabase.from("learning_lessons").select(LESSON_COLUMNS).eq("module_id", moduleId),
    supabase.from("learning_sections").select(SECTION_COLUMNS).eq("module_id", moduleId).order("position"),
  ]);

  const own = (sections ?? []) as LearningSection[];
  return {
    module: module as LearningModule,
    sections: own,
    lessons: inReadingOrder((lessons ?? []) as LearningLesson[], own),
  };
}

/** "12:05" from seconds. */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
