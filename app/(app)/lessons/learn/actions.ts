"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";

/**
 * Admin actions for learning modules. Each runs on the caller's own session,
 * so RLS (admin-only writes, migration 0023) is what actually decides; the
 * role check here only turns "zero rows changed" into a sentence.
 */

export type LearningState = { error: string | null; message: string | null };
const OK = (message: string): LearningState => ({ error: null, message });
const FAIL = (error: string): LearningState => ({ error, message: null });

const UUID = /^[0-9a-f-]{36}$/i;

function revalidate(moduleId?: string) {
  revalidatePath("/lessons/learn");
  if (moduleId) revalidatePath(`/lessons/learn/${moduleId}`, "layout");
}

export async function setModulePublished(formData: FormData): Promise<void> {
  if ((await currentRole()) !== "admin") return;
  const id = String(formData.get("id") ?? "");
  const published = formData.get("published") === "true";
  if (!UUID.test(id)) return;

  const supabase = await createClient();
  await supabase.from("learning_modules").update({ published }).eq("id", id);
  revalidate(id);
}

/**
 * Moves one lesson up or down WITHIN ITS SECTION by rewriting that section's
 * whole list through learning_reorder_section (0028) — never by swapping two
 * rows' numbers, which goes wrong the moment two rows share a value (the
 * levels reorder lesson). Positions are per section since 0028.
 */
export async function moveLesson(formData: FormData): Promise<void> {
  if ((await currentRole()) !== "admin") return;
  const moduleId = String(formData.get("module_id") ?? "");
  const lessonId = String(formData.get("lesson_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!UUID.test(moduleId) || !UUID.test(lessonId)) return;
  if (direction !== "up" && direction !== "down") return;

  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("learning_lessons")
    .select("section_id")
    .eq("id", lessonId)
    .eq("module_id", moduleId)
    .maybeSingle();
  if (!lesson?.section_id) return;
  const { data } = await supabase
    .from("learning_lessons")
    .select("id")
    .eq("section_id", lesson.section_id)
    .order("position");
  const ids = (data ?? []).map((row) => row.id as string);

  const index = ids.indexOf(lessonId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];

  await supabase.rpc("learning_reorder_section", { section: lesson.section_id, lesson_ids: ids });
  revalidate(moduleId);
}

export async function saveLessonNotes(prev: LearningState, formData: FormData): Promise<LearningState> {
  void prev; // useActionState's previous state; this action does not need it.
  if ((await currentRole()) !== "admin") return FAIL("Only the barn admin can edit lesson notes.");
  const lessonId = String(formData.get("lesson_id") ?? "");
  const moduleId = String(formData.get("module_id") ?? "");
  const notes = String(formData.get("notes") ?? "");
  if (!UUID.test(lessonId)) return FAIL("That lesson could not be found.");
  if (notes.length > 20_000) return FAIL("Those notes are too long to save in one go.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learning_lessons")
    .update({ notes })
    .eq("id", lessonId)
    .select("id");
  if (error || !data?.length) return FAIL("The notes were not saved. Try again.");

  revalidate(UUID.test(moduleId) ? moduleId : undefined);
  return OK("Saved.");
}
