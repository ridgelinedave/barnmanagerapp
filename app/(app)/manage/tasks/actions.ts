"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isRecurrence } from "@/lib/types";
import { barnToday } from "@/lib/dates";

/**
 * Admin task management.
 *
 * Every one of these runs on the caller's own session, so the admin-only
 * policies are the real gate. The role checks here produce readable errors;
 * removing them would change the message, not the permission.
 */
export type TaskAdminState = { error: string | null; message: string | null };

async function requireAdmin() {
  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") return null;
  return state.viewer;
}

function revalidate() {
  revalidatePath("/manage/tasks");
  revalidatePath("/tasks");
}

/**
 * Materialise today's tasks from the active templates.
 *
 * DEFERRED: a nightly cron should call generate_tasks_for_date. Until that
 * exists this is the admin-triggered stand-in, which is why it reports how many
 * rows it created — running it twice is safe and correctly reports 0.
 */
export async function generateTodaysTasks(
  _prev: TaskAdminState,
  _formData: FormData,
): Promise<TaskAdminState> {
  if (!(await requireAdmin())) return { error: "Only an admin can generate tasks.", message: null };

  const supabase = await createClient();
  // The barn's calendar day, not the server's — see lib/dates.ts.
  const { data, error } = await supabase.rpc("generate_tasks_for_date", {
    target_date: barnToday(),
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  const created = typeof data === "number" ? data : 0;
  return {
    error: null,
    message:
      created === 0
        ? "Already up to date — nothing new to generate."
        : `Generated ${created} task${created === 1 ? "" : "s"} for today.`,
  };
}

export async function createAdHocTask(
  _prev: TaskAdminState,
  formData: FormData,
): Promise<TaskAdminState> {
  if (!(await requireAdmin())) return { error: "Only an admin can add tasks.", message: null };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const assignee = String(formData.get("assignee") ?? "");
  const date = String(formData.get("date") ?? "") || barnToday();

  if (!title) return { error: "Give the task a title.", message: null };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title,
    description,
    date,
    assignee: assignee || null,
    status: "open",
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  return { error: null, message: "Task added." };
}

export async function assignTask(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  const assignee = String(formData.get("assignee") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("tasks")
    .update({ assignee: assignee || null })
    .eq("id", id);

  revalidate();
}

export async function deleteTask(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("tasks").delete().eq("id", id);

  revalidate();
}

export async function createTaskTemplate(
  _prev: TaskAdminState,
  formData: FormData,
): Promise<TaskAdminState> {
  if (!(await requireAdmin())) return { error: "Only an admin can add templates.", message: null };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const recurrence = String(formData.get("recurrence") ?? "");
  const weekdayRaw = String(formData.get("weekday") ?? "");
  const defaultAssignee = String(formData.get("default_assignee") ?? "");

  if (!title) return { error: "Give the template a title.", message: null };
  if (!isRecurrence(recurrence)) return { error: "Pick how often it repeats.", message: null };

  // The table constrains this too; catching it here gives a readable message
  // instead of a raw constraint violation.
  const weekday = recurrence === "weekly" ? Number(weekdayRaw) : null;
  if (recurrence === "weekly" && !(weekday && weekday >= 1 && weekday <= 7)) {
    return { error: "Pick which day of the week it repeats on.", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("task_templates").insert({
    title,
    description,
    recurrence,
    weekday,
    default_assignee: defaultAssignee || null,
    active: true,
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  return { error: null, message: "Template added." };
}

export async function setTemplateActive(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("task_templates").update({ active }).eq("id", id);

  revalidate();
}

export async function deleteTaskTemplate(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("task_templates").delete().eq("id", id);

  revalidate();
}
