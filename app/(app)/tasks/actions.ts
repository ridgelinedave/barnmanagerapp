"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";

/**
 * The one write staff have on tasks: completing their own.
 *
 * Runs on the caller's session, so the row policy ("assignee is me") and the
 * column trigger (only the completion columns may change, and completed_by must
 * be the caller) both apply. This action does not, and must not, re-implement
 * those rules — it just supplies the values.
 */
export type CompleteState = { error: string | null };

export async function setTaskDone(
  _prev: CompleteState,
  formData: FormData,
): Promise<CompleteState> {
  const id = String(formData.get("id") ?? "");
  const done = formData.get("done") === "true";
  if (!id) return { error: "Missing task id." };

  const state = await getViewer();
  if (state.status !== "viewer") return { error: "You're not signed in." };

  const profileId = state.viewer.profile?.id ?? null;
  if (!profileId) return { error: "Your account isn't linked to a barn profile." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update(
      done
        ? { status: "done", completed_at: new Date().toISOString(), completed_by: profileId }
        : // Un-completing clears the stamps; the CHECK constraint requires an
          // open task to carry neither.
          { status: "open", completed_at: null, completed_by: null },
    )
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/manage/tasks");
  return { error: null };
}
