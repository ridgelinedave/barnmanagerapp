"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { barnToday } from "@/lib/dates";

/**
 * Admin timesheet review.
 *
 * The one thing worth stating plainly: nothing here edits a punch, because
 * nothing can. There is no UPDATE or DELETE policy on `punches` for any role.
 * A correction is an INSERT of an adjusting row that points at the original,
 * and the original stays. That is what keeps the ledger worth trusting when
 * someone queries their hours weeks later.
 */
export type TimesheetState = { error: string | null; message: string | null };

async function requireAdmin() {
  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") return null;
  return state.viewer;
}

function revalidate() {
  revalidatePath("/manage/timesheets");
  revalidatePath("/clock");
  revalidatePath("/more/timesheet");
}

/** Add a correcting punch. Never modifies the row being corrected. */
export async function addCorrection(
  _prev: TimesheetState,
  formData: FormData,
): Promise<TimesheetState> {
  if (!(await requireAdmin())) {
    return { error: "Only an admin can correct a timesheet.", message: null };
  }

  const profileId = String(formData.get("profile_id") ?? "");
  const adjustsId = String(formData.get("adjusts_punch_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const punchedAt = String(formData.get("punched_at") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!profileId || !adjustsId) return { error: "Missing the punch being corrected.", message: null };
  if (direction !== "in" && direction !== "out") return { error: "Pick in or out.", message: null };
  if (!punchedAt) return { error: "Pick the corrected time.", message: null };
  // The database CHECK requires this too; catching it here gives a readable
  // message instead of a constraint violation.
  if (!note) return { error: "Say why you're correcting it — this is an audit trail.", message: null };

  const supabase = await createClient();
  const { error } = await supabase.from("punches").insert({
    profile_id: profileId,
    direction,
    punched_at: new Date(punchedAt).toISOString(),
    source: "admin_adjustment",
    adjusts_punch_id: adjustsId,
    note,
  });

  if (error) return { error: error.message, message: null };

  revalidate();
  return { error: null, message: "Correction added. The original punch is unchanged." };
}

export async function createPayPeriod(
  _prev: TimesheetState,
  formData: FormData,
): Promise<TimesheetState> {
  if (!(await requireAdmin())) return { error: "Only an admin can open a pay period.", message: null };

  const start = String(formData.get("start_date") ?? "");
  const end = String(formData.get("end_date") ?? "");
  if (!start || !end) return { error: "Pick both dates.", message: null };
  if (end < start) return { error: "The end date can't be before the start.", message: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pay_periods")
    .insert({ start_date: start, end_date: end, status: "open" });

  if (error) {
    if (error.code === "23505") return { error: "That period already exists.", message: null };
    return { error: error.message, message: null };
  }

  revalidate();
  return { error: null, message: "Pay period opened." };
}

/**
 * Approve one employee's hours for a period.
 *
 * total_minutes is passed in from the server-computed pairing rather than
 * recomputed here, so what the admin saw on screen is exactly what is recorded.
 */
export async function approveTimesheet(
  _prev: TimesheetState,
  formData: FormData,
): Promise<TimesheetState> {
  const viewer = await requireAdmin();
  if (!viewer) return { error: "Only an admin can approve a timesheet.", message: null };

  const periodId = String(formData.get("period_id") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");
  const totalMinutes = Number(formData.get("total_minutes") ?? 0);

  if (!periodId || !profileId) return { error: "Missing employee or period.", message: null };
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return { error: "That total doesn't look right.", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("timesheet_approvals").upsert(
    {
      period_id: periodId,
      profile_id: profileId,
      total_minutes: Math.round(totalMinutes),
      approved_by: viewer.profile?.id ?? null,
      approved_at: new Date().toISOString(),
    },
    { onConflict: "period_id,profile_id" },
  );

  if (error) return { error: error.message, message: null };

  revalidate();
  return { error: null, message: "Approved." };
}

export async function setPeriodStatus(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["open", "approved", "synced"].includes(status)) return;

  const supabase = await createClient();
  await supabase.from("pay_periods").update({ status }).eq("id", id);

  revalidate();
}

/** Default a new period to the current week, Monday–Sunday, barn-local. */
export async function suggestedPeriod(): Promise<{ start: string; end: string }> {
  const today = barnToday();
  const date = new Date(`${today}T12:00:00Z`);
  const isoDow = ((date.getUTCDay() + 6) % 7) + 1;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - (isoDow - 1));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
