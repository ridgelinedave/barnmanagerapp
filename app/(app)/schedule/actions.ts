"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isLessonType } from "@/lib/types";
import { addBarnDays, barnToday } from "@/lib/dates";

/** Admin schedule actions. RLS is the gate; these produce readable errors. */
export type ScheduleState = { error: string | null; message: string | null };

async function requireAdmin() {
  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") return null;
  return state.viewer;
}

function revalidate() {
  revalidatePath("/schedule");
  revalidatePath("/lessons");
  revalidatePath("/manage/lesson-templates");
}

/**
 * Materialise instances from the active templates.
 *
 * The date window is computed here, in barn-local time, and passed explicitly —
 * the SQL default would use UTC current_date and quietly skip the rest of the
 * evening. See lib/dates.ts.
 */
export async function generateInstances(
  _prev: ScheduleState,
  _formData: FormData,
): Promise<ScheduleState> {
  if (!(await requireAdmin())) {
    return { error: "Only an admin can generate the schedule.", message: null };
  }

  const from = barnToday();
  const through = addBarnDays(from, 28);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_lesson_instances", {
    from_date: from,
    through_date: through,
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  const created = typeof data === "number" ? data : 0;
  return {
    error: null,
    message:
      created === 0
        ? "Already up to date — no new lessons to add."
        : `Added ${created} lesson${created === 1 ? "" : "s"} through ${through}.`,
  };
}

export async function bookRider(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  if (!(await requireAdmin())) return { error: "Only an admin can book riders.", message: null };

  const instanceId = String(formData.get("instance_id") ?? "");
  const riderId = String(formData.get("rider_id") ?? "");
  if (!instanceId || !riderId) return { error: "Pick a rider.", message: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_riders")
    .insert({ instance_id: instanceId, rider_id: riderId, status: "booked" });

  if (error) {
    // The unique constraint is the real guard against double-booking; this just
    // turns it into something readable.
    if (error.code === "23505") {
      return { error: "That rider is already in this lesson.", message: null };
    }
    return { error: error.message, message: null };
  }

  revalidate();
  return { error: null, message: "Rider booked." };
}

export async function cancelInstance(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("lesson_instances").update({ status: "cancelled" }).eq("id", id);

  revalidate();
}

export async function restoreInstance(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("lesson_instances").update({ status: "scheduled" }).eq("id", id);

  revalidate();
}

export async function updateInstanceNotes(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  const notes = String(formData.get("notes") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("lesson_instances").update({ notes }).eq("id", id);

  revalidate();
}

/**
 * Offer a released seat to the selected riders.
 *
 * Eligibility is re-checked inside send_backfill_offers(), so a stale form or a
 * forged rider id cannot place someone in a lesson they do not qualify for.
 */
export async function sendOffers(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  if (!(await requireAdmin())) return { error: "Only an admin can offer a spot.", message: null };

  const instanceId = String(formData.get("instance_id") ?? "");
  const riderIds = formData.getAll("rider_ids").map(String).filter(Boolean);

  if (!instanceId) return { error: "Missing lesson.", message: null };
  if (riderIds.length === 0) return { error: "Pick at least one rider.", message: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_backfill_offers", {
    instance: instanceId,
    rider_ids: riderIds,
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  const sent = typeof data === "number" ? data : 0;
  return {
    error: null,
    message:
      sent === 0
        ? "No new offers went out — those riders already have one, or aren't eligible."
        : `Offered the spot to ${sent} rider${sent === 1 ? "" : "s"}. First to accept gets it.`,
  };
}

/** Place a rider directly, skipping the offer round. */
export async function assignBackfill(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  if (!(await requireAdmin())) return { error: "Only an admin can assign a spot.", message: null };

  const instanceId = String(formData.get("instance_id") ?? "");
  const riderId = String(formData.get("rider_id") ?? "");
  if (!instanceId || !riderId) return { error: "Pick a rider.", message: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_assign_backfill", {
    instance: instanceId,
    rider: riderId,
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  return { error: null, message: "Rider assigned, and any outstanding offers were closed." };
}

/**
 * Queue tomorrow's lesson reminders.
 *
 * Manual for now — the nightly cron is deferred. Idempotent in the database, so
 * pressing it twice cannot double-notify a family.
 */
export async function sendLessonReminders(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  if (!(await requireAdmin())) {
    return { error: "Only an admin can send reminders.", message: null };
  }

  const date = String(formData.get("date") ?? "") || addBarnDays(barnToday(), 1);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enqueue_lesson_reminders", { target_date: date });

  if (error) return { error: error.message, message: null };

  revalidate();
  const created = typeof data === "number" ? data : 0;
  return {
    error: null,
    message:
      created === 0
        ? "Everyone with a lesson that day has already been reminded."
        : `Sent ${created} reminder${created === 1 ? "" : "s"}.`,
  };
}

/** One-off lesson that is not part of the weekly pattern. */
export async function createOneOffInstance(
  _prev: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  if (!(await requireAdmin())) return { error: "Only an admin can add lessons.", message: null };

  const date = String(formData.get("date") ?? "") || barnToday();
  const startTime = String(formData.get("start_time") ?? "");
  const durationMin = Number(formData.get("duration_min") ?? 45);
  const type = String(formData.get("type") ?? "private");
  const instructorId = String(formData.get("instructor_id") ?? "");
  const levelId = String(formData.get("level_id") ?? "");
  const maxRiders = Number(formData.get("max_riders") ?? 1);

  if (!startTime) return { error: "Pick a start time.", message: null };
  if (!isLessonType(type)) return { error: "Pick a lesson type.", message: null };
  if (![45, 60].includes(durationMin)) return { error: "Pick a valid duration.", message: null };

  const supabase = await createClient();
  const { error } = await supabase.from("lesson_instances").insert({
    template_id: null,
    date,
    start_time: startTime,
    duration_min: durationMin,
    type,
    instructor_id: instructorId || null,
    status: "scheduled",
    // A one-off with no level is open to any rider for backfill purposes.
    level_id: levelId || null,
    max_riders: type === "private" ? 1 : Math.max(1, maxRiders),
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  return { error: null, message: "Lesson added." };
}
