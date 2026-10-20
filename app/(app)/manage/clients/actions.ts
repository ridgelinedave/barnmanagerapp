"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { featureEnabled } from "@/config/barn";

export type ClientStatusState = { error: string | null; message: string | null };

const STATUSES = ["active", "inactive", "on_break"] as const;

/**
 * Set a client's status. Admin only — families has an admin-only UPDATE policy
 * (0003), so a client cannot change their own; this check only turns a refusal
 * into a sentence. What the status does is in migration 0026's header: only
 * active clients get new series bookings.
 */
export async function setClientStatus(_prev: ClientStatusState, formData: FormData): Promise<ClientStatusState> {
  if (!featureEnabled("clientStatus")) return { error: "Client status is not switched on.", message: null };
  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") {
    return { error: "Only an admin can change a client's status.", message: null };
  }

  const familyId = String(formData.get("family_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(familyId) || !(STATUSES as readonly string[]).includes(status)) {
    return { error: "Pick a status.", message: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("families").update({ status }).eq("id", familyId).select("id");
  if (error) return { error: error.message, message: null };
  if (!data?.length) return { error: "Not saved.", message: null };

  revalidatePath("/manage/clients");
  return { error: null, message: "Saved." };
}
