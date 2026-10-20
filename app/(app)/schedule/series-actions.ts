"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { featureEnabled } from "@/config/barn";
import { addBarnDays, barnToday } from "@/lib/dates";

/**
 * Horse-per-occurrence and recurring enrolment. Migration 0025.
 *
 * Every action here refuses while `lessonSeries` is off, because the columns
 * and the table it writes do not exist until 0025 is applied — a write would
 * fail with a schema error rather than a sentence.
 */
export type SeriesState = { error: string | null; message: string | null };

const OFF: SeriesState = { error: "Recurring lessons are not switched on yet.", message: null };
const UUID = /^[0-9a-f-]{36}$/i;

async function requireAdmin(): Promise<boolean> {
  const state = await getViewer();
  return state.status === "viewer" && state.viewer.role === "admin";
}

function revalidate() {
  revalidatePath("/schedule");
  revalidatePath("/lessons");
}

/**
 * Set the horse for ONE occurrence. Writes lesson_riders.horse_id on that row
 * and nothing else — the series' usual horse is a different column on a
 * different table, so this cannot change it.
 */
export async function setOccurrenceHorse(_prev: SeriesState, formData: FormData): Promise<SeriesState> {
  if (!featureEnabled("lessonSeries")) return OFF;
  if (!(await requireAdmin())) return { error: "Only an admin can change the horse.", message: null };

  const bookingId = String(formData.get("booking_id") ?? "");
  const horseId = String(formData.get("horse_id") ?? "");
  if (!UUID.test(bookingId)) return { error: "That booking could not be found.", message: null };
  if (horseId && !UUID.test(horseId)) return { error: "Pick a horse.", message: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_riders")
    .update({ horse_id: horseId || null })
    .eq("id", bookingId)
    .select("id");

  if (error) return { error: error.message, message: null };
  if (!data?.length) return { error: "Not saved.", message: null };

  revalidate();
  return { error: null, message: "Horse set for this lesson." };
}

/**
 * Enrol a rider in a recurring slot.
 *
 * `starts` is any date; the first lesson is the first day on or after it that
 * falls on the slot's weekday — the database refuses an anchor on any other
 * day, and computing it here means the person never sees that refusal.
 * Then the next four weeks are booked immediately, so the enrolment shows up
 * on the schedule now rather than at the next generation.
 */
export async function createEnrolment(_prev: SeriesState, formData: FormData): Promise<SeriesState> {
  if (!featureEnabled("lessonSeries")) return OFF;
  if (!(await requireAdmin())) return { error: "Only an admin can enrol riders.", message: null };

  const templateId = String(formData.get("template_id") ?? "");
  const riderId = String(formData.get("rider_id") ?? "");
  const horseId = String(formData.get("horse_id") ?? "");
  const cadence = String(formData.get("cadence") ?? "1");
  const custom = Number(formData.get("custom_weeks") ?? "");
  const starts = String(formData.get("starts") ?? "") || barnToday();

  if (!UUID.test(templateId) || !UUID.test(riderId)) return { error: "Pick a rider.", message: null };
  const interval = cadence === "custom" ? custom : Number(cadence);
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) {
    return { error: "Every 1 to 12 weeks.", message: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(starts)) return { error: "That start date does not look right.", message: null };

  const supabase = await createClient();
  const { data: template } = await supabase
    .from("lesson_templates")
    .select("weekday")
    .eq("id", templateId)
    .maybeSingle();
  if (!template) return { error: "That lesson slot could not be found.", message: null };

  // ISO weekday of `starts` (1 = Monday), at noon UTC so no zone moves the day.
  const isoDay = ((new Date(`${starts}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const anchor = addBarnDays(starts, (template.weekday - isoDay + 7) % 7);

  const { error } = await supabase.from("lesson_enrolments").insert({
    template_id: templateId,
    rider_id: riderId,
    horse_id: horseId && UUID.test(horseId) ? horseId : null,
    interval_weeks: interval,
    anchor_date: anchor,
  });
  if (error) {
    if (error.code === "23505") return { error: "That rider is already enrolled from that date.", message: null };
    return { error: error.message, message: null };
  }

  const today = barnToday();
  const { data: booked } = await supabase.rpc("book_enrolments", {
    from_date: today,
    through_date: addBarnDays(today, 28),
  });

  revalidate();
  return {
    error: null,
    message: `Enrolled from ${anchor}.${typeof booked === "number" && booked > 0 ? ` ${booked} booked.` : ""}`,
  };
}

/**
 * End a series. Future bookings it made after `ends_on` are removed by the
 * database (0025's trigger), never here, so the rule has one home.
 */
export async function endEnrolment(_prev: SeriesState, formData: FormData): Promise<SeriesState> {
  if (!featureEnabled("lessonSeries")) return OFF;
  if (!(await requireAdmin())) return { error: "Only an admin can end an enrolment.", message: null };

  const id = String(formData.get("enrolment_id") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "") || barnToday();
  if (!UUID.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
    return { error: "That enrolment could not be found.", message: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_enrolments")
    .update({ ends_on: endsOn })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message, message: null };
  if (!data?.length) return { error: "Not saved.", message: null };

  revalidate();
  return { error: null, message: `Ends ${endsOn}. Later lessons removed.` };
}
