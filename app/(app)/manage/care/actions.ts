"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isCareType } from "@/lib/types";

/**
 * Care logging and corrections.
 *
 * Note the two different gates, which are not the same rule:
 *
 *   logCareEvent   — admin OR staff. The barn logs care; that is the job.
 *   correct/delete — manage_horses only. A care log the person who wrote it can
 *                    rewrite is not a medical record (see migration 0011).
 *
 * All of these run on the caller's own session, so the policies and the insert
 * trigger are the real gate. The checks here produce a readable message rather
 * than a silent zero-row result.
 *
 * `logged_by` is deliberately NOT sent from here. The trigger pins it to the
 * caller, and sending it would suggest the value is the app's to choose.
 */
export type CareState = { error: string | null; message: string | null };

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
  revalidatePath("/manage/care");
  revalidatePath("/manage/horses");
  revalidatePath("/more/horses");
  if (horseId) {
    revalidatePath(`/manage/horses/${horseId}`);
    revalidatePath(`/more/horses/${horseId}`);
  }
}

export async function logCareEvent(_prev: CareState, formData: FormData): Promise<CareState> {
  if (!(await requireBarn())) {
    return { error: "Only the barn can log care for a horse.", message: null };
  }

  const horseId = String(formData.get("horse_id") ?? "");
  const type = String(formData.get("type") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const performedAt = String(formData.get("performed_at") ?? "");
  const dueNext = String(formData.get("due_next") ?? "");

  if (!horseId) return { error: "Missing horse.", message: null };
  if (!isCareType(type)) return { error: "Pick what kind of care this was.", message: null };
  if (!performedAt) return { error: "When did this happen?", message: null };

  const supabase = await createClient();
  const { error } = await supabase.from("care_events").insert({
    horse_id: horseId,
    type,
    description,
    performed_at: performedAt,
    // Empty means "nothing scheduled after this" — a wound, a one-off vet call.
    due_next: dueNext || null,
  });

  if (error) return { error: error.message, message: null };

  revalidate(horseId);
  return { error: null, message: "Logged." };
}

export async function correctCareEvent(_prev: CareState, formData: FormData): Promise<CareState> {
  if (!(await requireManageHorses())) {
    return { error: "Only the barn owner can correct a care record.", message: null };
  }

  const id = String(formData.get("id") ?? "");
  const horseId = String(formData.get("horse_id") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const dueNext = String(formData.get("due_next") ?? "");

  if (!id) return { error: "Missing record.", message: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("care_events")
    .update({ description, due_next: dueNext || null })
    .eq("id", id);

  if (error) return { error: error.message, message: null };

  revalidate(horseId);
  return { error: null, message: "Corrected." };
}

export async function deleteCareEvent(formData: FormData): Promise<void> {
  if (!(await requireManageHorses())) return;

  const id = String(formData.get("id") ?? "");
  const horseId = String(formData.get("horse_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("care_events").delete().eq("id", id);

  revalidate(horseId);
}

/**
 * Notify the admins of everything due in the next 30 days.
 *
 * Idempotent per care item, so the button is safe to press twice — it reports
 * how many notifications it actually created, because a button that silently
 * did nothing is indistinguishable from a broken one.
 *
 * DEFERRED: SPEC §8 wants this as a weekly digest on a cron. See the note in
 * migration 0011 — the current idempotency key would make a weekly job go
 * quiet after the first week.
 */
export async function sendCareDigest(_prev: CareState, _formData: FormData): Promise<CareState> {
  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") {
    return { error: "Only an admin can send the care digest.", message: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enqueue_care_due_digest");

  if (error) return { error: error.message, message: null };

  revalidate();
  const created = typeof data === "number" ? data : 0;
  return {
    error: null,
    message:
      created === 0
        ? "Already sent — nothing new is due."
        : `Sent ${created} reminder${created === 1 ? "" : "s"}.`,
  };
}
