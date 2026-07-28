"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isLessonType } from "@/lib/types";

export type TemplateState = { error: string | null; message: string | null };

async function requireAdmin() {
  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") return null;
  return state.viewer;
}

function revalidate() {
  revalidatePath("/manage/lesson-templates");
  revalidatePath("/schedule");
}

export async function createLessonTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  if (!(await requireAdmin())) {
    return { error: "Only an admin can edit the weekly schedule.", message: null };
  }

  const weekday = Number(formData.get("weekday") ?? 0);
  const startTime = String(formData.get("start_time") ?? "");
  const type = String(formData.get("type") ?? "private");
  const durationMin = Number(formData.get("duration_min") ?? 45);
  const maxRiders = Number(formData.get("max_riders") ?? 1);
  const instructorId = String(formData.get("instructor_id") ?? "");
  const levelId = String(formData.get("level_id") ?? "");

  if (!(weekday >= 1 && weekday <= 7)) return { error: "Pick a day.", message: null };
  if (!startTime) return { error: "Pick a start time.", message: null };
  if (!isLessonType(type)) return { error: "Pick private or group.", message: null };
  if (![45, 60].includes(durationMin)) return { error: "Pick a valid duration.", message: null };
  if (!(maxRiders >= 1)) return { error: "A lesson needs room for at least one rider.", message: null };

  const supabase = await createClient();
  const { error } = await supabase.from("lesson_templates").insert({
    weekday,
    start_time: startTime,
    duration_min: durationMin,
    type,
    max_riders: type === "private" ? 1 : maxRiders,
    instructor_id: instructorId || null,
    level_id: levelId || null,
    active: true,
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  return { error: null, message: "Added to the weekly schedule." };
}

export async function setTemplateActive(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("lesson_templates").update({ active }).eq("id", id);

  revalidate();
}

export async function deleteLessonTemplate(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Instances already generated keep their rows; the FK is ON DELETE SET NULL,
  // so they become one-offs rather than vanishing from a day that already ran.
  const supabase = await createClient();
  await supabase.from("lesson_templates").delete().eq("id", id);

  revalidate();
}
