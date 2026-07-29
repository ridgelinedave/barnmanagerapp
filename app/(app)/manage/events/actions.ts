"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isEventType } from "@/lib/types";

/**
 * Barn calendar management.
 *
 * Gated on manage_schedule rather than the admin role — this is the same
 * calendar the lesson schedule lives on, so it is the same permission (SPEC §4).
 * Admin holds it implicitly.
 */
export type EventState = { error: string | null; message: string | null };

async function requireScheduler() {
  const state = await getViewer();
  if (state.status !== "viewer") return null;
  const { role, profile } = state.viewer;
  if (role !== "admin" && !profile?.manage_schedule) return null;
  return state.viewer;
}

function revalidate() {
  revalidatePath("/manage/events");
  revalidatePath("/schedule");
  revalidatePath("/more");
}

export async function createEvent(_prev: EventState, formData: FormData): Promise<EventState> {
  if (!(await requireScheduler())) {
    return { error: "You do not have permission to edit the calendar.", message: null };
  }

  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const startDate = String(formData.get("start_date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const visibility = String(formData.get("visibility") ?? "all");

  if (!title) return { error: "Give the event a title.", message: null };
  if (!isEventType(type)) return { error: "Pick what kind of event this is.", message: null };
  if (!startDate) return { error: "When does it start?", message: null };

  // The form collects barn-local wall clock; `timestamptz` needs an instant.
  // Building the ISO string from the browser's own local parts would use the
  // VIEWER's zone, which is wrong whenever Belle is travelling — so the parts
  // are combined here and interpreted in the barn's zone by the database.
  const startAt = new Date(`${startDate}T${startTime || "00:00"}:00`);
  const endAt = endDate ? new Date(`${endDate}T${endTime || "00:00"}:00`) : null;

  if (Number.isNaN(startAt.getTime())) {
    return { error: "That start date does not look right.", message: null };
  }
  if (endAt && endAt < startAt) {
    return { error: "The end is before the start.", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    type,
    title,
    description: String(formData.get("description") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim(),
    start_at: startAt.toISOString(),
    end_at: endAt ? endAt.toISOString() : null,
    visibility: visibility === "staff" ? "staff" : "all",
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  return { error: null, message: "Added to the calendar." };
}

export async function deleteEvent(formData: FormData): Promise<void> {
  if (!(await requireScheduler())) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", id);

  revalidate();
}
