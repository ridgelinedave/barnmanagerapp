"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";

/**
 * The lesson notes editor's action (course authoring is course-actions.ts).
 * It runs on the caller's own session, so RLS (admin-only writes, migration
 * 0023) is what actually decides; the role check here only turns "zero rows
 * changed" into a sentence.
 */

export type LearningState = { error: string | null; message: string | null };
const OK = (message: string): LearningState => ({ error: null, message });
const FAIL = (error: string): LearningState => ({ error, message: null });

const UUID = /^[0-9a-f-]{36}$/i;

function revalidate(moduleId?: string) {
  revalidatePath("/lessons/learn");
  if (moduleId) revalidatePath(`/lessons/learn/${moduleId}`, "layout");
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
