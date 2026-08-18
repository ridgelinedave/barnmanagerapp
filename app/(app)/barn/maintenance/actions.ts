"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  type MaintenancePriority,
  type MaintenanceStatus,
} from "@/lib/types";

export type MaintenanceState = { error: string | null; message: string | null };

/**
 * Raise a request. Anyone on the barn side can: reporting a broken gate is an
 * observation, not a decision.
 *
 * `status` and `raised_by` are NOT sent. maintenance_guard_insert() pins both —
 * status to 'open' specifically so a request cannot be created already-resolved
 * and slip past the update gate.
 */
export async function createMaintenanceRequest(
  _prev: MaintenanceState,
  formData: FormData,
): Promise<MaintenanceState> {
  const role = await currentRole();
  if (role !== "admin" && role !== "staff") {
    return { error: "Only the barn may raise a request.", message: null };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Say what is broken.", message: null };

  const priority = String(formData.get("priority") ?? "normal");

  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_requests").insert({
    title,
    description: String(formData.get("description") ?? "").trim(),
    priority: (MAINTENANCE_PRIORITIES as readonly string[]).includes(priority)
      ? (priority as MaintenancePriority)
      : "normal",
  });

  if (error) return { error: error.message, message: null };

  revalidatePath("/barn/maintenance");
  return { error: null, message: `"${title}" logged.` };
}

/**
 * Move a request along. Gated on has_permission('manage_horses') in the policy;
 * a staff member without the flag gets a refusal rather than a silent no-op,
 * because an update that matches zero rows returns no error.
 */
export async function setMaintenanceStatus(
  _prev: MaintenanceState,
  formData: FormData,
): Promise<MaintenanceState> {
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "");
  if (!id || !(MAINTENANCE_STATUSES as readonly string[]).includes(next)) {
    return { error: "That is not a status.", message: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("maintenance_requests")
    .update({ status: next as MaintenanceStatus })
    .eq("id", id)
    .select("id");

  if (error) return { error: error.message, message: null };
  // Zero rows means the UPDATE policy refused it. Say so.
  if (!data?.length) {
    return { error: "You do not have permission to change a request.", message: null };
  }

  revalidatePath("/barn/maintenance");
  return { error: null, message: null };
}
