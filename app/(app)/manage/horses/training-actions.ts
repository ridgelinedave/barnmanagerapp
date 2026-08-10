"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isDiscipline } from "@/lib/types";

/**
 * Training logging.
 *
 * Same two gates as care, and for the same reasons (migration 0020 mirrors
 * 0011 verb for verb):
 *
 *   logTraining     — admin OR staff. The barn logs the work; that is the job.
 *   deleteTraining  — manage_horses only. A log the writer can quietly remove
 *                     is not a log.
 *
 * Both run on the caller's own session, so the policies and the insert trigger
 * are the real gate; the checks here produce a readable sentence rather than a
 * silent zero-row result.
 *
 * `logged_by` is deliberately NOT sent from here. The trigger pins it to the
 * caller, and sending it would suggest the value is the app's to choose.
 */
export type TrainingState = { error: string | null; message: string | null };

async function requireBarn() {
  const state = await getViewer();
  if (state.status !== "viewer") return null;
  const { role } = state.viewer;
  if (role !== "admin" && role !== "staff") return null;
  return state.viewer;
}

async function requireManageHorses() {
  const state = await getViewer();
  if (state.status !== "viewer") return null;
  const { role, profile } = state.viewer;
  if (role !== "admin" && !profile?.manage_horses) return null;
  return state.viewer;
}

function revalidate(horseId?: string) {
  revalidatePath("/manage/horses");
  revalidatePath("/more/horses");
  if (horseId) {
    revalidatePath(`/manage/horses/${horseId}`);
    revalidatePath(`/more/horses/${horseId}`);
  }
}

function readable(message: string): string {
  if (message.includes("does not exist") || message.includes("schema cache")) {
    return "Training logs are not switched on yet — migration 0020 has not been applied.";
  }
  if (message.includes("Only the barn may log training")) {
    return "Only the barn can log training for a horse.";
  }
  return message;
}

export async function logTraining(
  _prev: TrainingState,
  formData: FormData,
): Promise<TrainingState> {
  if (!(await requireBarn())) {
    return { error: "Only the barn can log training for a horse.", message: null };
  }

  const horseId = String(formData.get("horse_id") ?? "");
  const discipline = String(formData.get("discipline") ?? "");
  const performedAt = String(formData.get("performed_at") ?? "");
  const focus = String(formData.get("focus") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const durationRaw = String(formData.get("duration_min") ?? "").trim();

  if (!horseId) return { error: "Missing horse.", message: null };
  if (!isDiscipline(discipline)) return { error: "Pick what the work was.", message: null };
  if (!performedAt) return { error: "Say which day this was.", message: null };

  // Minutes, or nothing. A blank box is "nobody timed it", which is the normal
  // case — it must not become 0, which would read as "a session of no length".
  const duration = durationRaw.length > 0 ? Number(durationRaw) : null;
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration > 600)) {
    return { error: "Give the length in minutes, or leave it blank.", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("training_logs").insert({
    horse_id: horseId,
    performed_at: performedAt,
    discipline,
    focus: focus.length > 0 ? focus : null,
    notes,
    duration_min: duration,
  });

  if (error) return { error: readable(error.message), message: null };

  revalidate(horseId);
  return { error: null, message: "Logged." };
}

export async function deleteTraining(formData: FormData): Promise<void> {
  if (!(await requireManageHorses())) return;

  const id = String(formData.get("id") ?? "");
  const horseId = String(formData.get("horse_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("training_logs").delete().eq("id", id);

  revalidate(horseId);
}
