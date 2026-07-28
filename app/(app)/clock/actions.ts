"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";

/**
 * The staff clock punch — the only write staff have on the ledger.
 *
 * Location is optional on purpose. A punch must never fail because someone
 * denied GPS or is standing where there is no signal; it is recorded without
 * coordinates and flagged for the barn to look at. Refusing the punch would
 * teach people to work around the app.
 *
 * The database decides whether this is allowed (insert-only policy pinned to
 * the caller's own profile, plus a trigger). This action only supplies values.
 */
export type PunchState = { error: string | null; message: string | null };

export async function recordPunch(
  _prev: PunchState,
  formData: FormData,
): Promise<PunchState> {
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "in" && direction !== "out") {
    return { error: "Something went wrong — try again.", message: null };
  }

  const state = await getViewer();
  if (state.status !== "viewer") return { error: "You're not signed in.", message: null };

  const profileId = state.viewer.profile?.id ?? null;
  if (!profileId) {
    return { error: "Your account isn't linked to a barn profile.", message: null };
  }

  const rawLat = String(formData.get("lat") ?? "");
  const rawLng = String(formData.get("lng") ?? "");
  const lat = rawLat === "" ? null : Number(rawLat);
  const lng = rawLng === "" ? null : Number(rawLng);
  const usable = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

  const supabase = await createClient();
  const { error } = await supabase.from("punches").insert({
    profile_id: profileId,
    direction,
    punched_at: new Date().toISOString(),
    lat: usable ? lat : null,
    lng: usable ? lng : null,
    source: "self",
  });

  if (error) return { error: error.message, message: null };

  revalidatePath("/clock");
  revalidatePath("/more/timesheet");
  revalidatePath("/manage/timesheets");

  return {
    error: null,
    message: direction === "in" ? "Clocked in." : "Clocked out.",
  };
}
