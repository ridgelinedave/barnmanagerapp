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
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  return { error: null, message: "Lesson added." };
}
