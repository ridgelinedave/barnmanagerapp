"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isHorseSex, isMeal, type HorseSex } from "@/lib/types";

/**
 * Horse, rider-assignment and feed-plan management.
 *
 * Every one of these runs on the caller's own session, so the
 * has_permission('manage_horses') policies are the real gate. The checks here
 * produce a readable message instead of a silent zero-row update; removing them
 * would change the wording, not the permission.
 *
 * They check the PERMISSION, not the role, deliberately: SPEC §4 has
 * manage_horses as a grantable flag so a senior trainer can keep the feed board
 * without becoming an admin. Checking `role === 'admin'` here would let the UI
 * refuse someone the database would have allowed.
 */
export type HorseAdminState = { error: string | null; message: string | null };

async function requireManageHorses() {
  const state = await getViewer();
  if (state.status !== "viewer") return null;
  const { role, profile } = state.viewer;
  if (role !== "admin" && !profile?.manage_horses) return null;
  return state.viewer;
}

function revalidate(horseId?: string) {
  revalidatePath("/manage/horses");
  revalidatePath("/more/horses");
  revalidatePath("/tasks/feed");
  if (horseId) {
    revalidatePath(`/manage/horses/${horseId}`);
    revalidatePath(`/more/horses/${horseId}`);
  }
}

const DENIED = "You do not have permission to manage horses.";

/** Empty string → null, so an untouched optional field stores as absent. */
function optional(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

/** The sex column is a CHECK; anything not in the list stores as absent. */
function sexOf(formData: FormData): HorseSex | null {
  const value = optional(formData, "sex");
  return isHorseSex(value) ? value : null;
}

/**
 * Height in hands, where the decimal is INCHES and so only runs 0–3.
 *
 * `horses_height_is_hands` enforces this, but a constraint violation reaches
 * the person as a raw Postgres string. Catching it here means "16.7" gets a
 * sentence that explains the notation instead.
 *
 * Returns `undefined` when the value is unusable, which the callers turn into
 * an error — distinct from `null`, which means "deliberately not set".
 */
function heightOf(formData: FormData): number | null | undefined {
  const raw = optional(formData, "height_hands");
  if (raw === null) return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value >= 30) return undefined;

  // One decimal place, and that place is inches: 0-3.
  const inches = Math.round(value * 10) % 10;
  if (inches > 3) return undefined;

  return Math.round(value * 10) / 10;
}

const HEIGHT_HELP =
  "Height is in hands and the decimal is inches, so it runs .0 to .3 — 16.2 is sixteen hands two inches.";

export async function createHorse(
  _prev: HorseAdminState,
  formData: FormData,
): Promise<HorseAdminState> {
  if (!(await requireManageHorses())) return { error: DENIED, message: null };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the horse a name.", message: null };

  const height = heightOf(formData);
  if (height === undefined) return { error: HEIGHT_HELP, message: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("horses")
    .insert({
      name,
      barn_name: optional(formData, "barn_name"),
      // "" is the barn itself — a horse with no owning family.
      owner_family_id: optional(formData, "owner_family_id"),
      colour: optional(formData, "colour"),
      sex: sexOf(formData),
      height_hands: height,
      breed: optional(formData, "breed"),
      dob: optional(formData, "dob"),
      notes: optional(formData, "notes"),
      active: true,
    })
    .select()
    .single();

  if (error) return { error: error.message, message: null };

  revalidate(data.id);
  redirect(`/manage/horses/${data.id}`);
}

export async function updateHorse(
  _prev: HorseAdminState,
  formData: FormData,
): Promise<HorseAdminState> {
  if (!(await requireManageHorses())) return { error: DENIED, message: null };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return { error: "Missing horse.", message: null };
  if (!name) return { error: "Give the horse a name.", message: null };

  const height = heightOf(formData);
  if (height === undefined) return { error: HEIGHT_HELP, message: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("horses")
    .update({
      name,
      barn_name: optional(formData, "barn_name"),
      owner_family_id: optional(formData, "owner_family_id"),
      colour: optional(formData, "colour"),
      sex: sexOf(formData),
      height_hands: height,
      breed: optional(formData, "breed"),
      dob: optional(formData, "dob"),
      notes: optional(formData, "notes"),
      active: formData.get("active") === "on",
    })
    .eq("id", id);

  if (error) return { error: error.message, message: null };

  revalidate(id);
  return { error: null, message: "Saved." };
}

export async function deleteHorse(formData: FormData): Promise<void> {
  if (!(await requireManageHorses())) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("horses").delete().eq("id", id);

  revalidate();
  redirect("/manage/horses");
}

export async function assignRider(
  _prev: HorseAdminState,
  formData: FormData,
): Promise<HorseAdminState> {
  if (!(await requireManageHorses())) return { error: DENIED, message: null };

  const horseId = String(formData.get("horse_id") ?? "");
  const riderId = String(formData.get("rider_id") ?? "");
  if (!horseId || !riderId) return { error: "Pick a rider.", message: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("horse_riders")
    .insert({ horse_id: horseId, rider_id: riderId });

  if (error) {
    // The unique pair constraint. Saying so beats a raw 23505.
    if (error.code === "23505") {
      return { error: "That rider is already on this horse.", message: null };
    }
    return { error: error.message, message: null };
  }

  revalidate(horseId);
  return { error: null, message: "Rider assigned." };
}

export async function unassignRider(formData: FormData): Promise<void> {
  if (!(await requireManageHorses())) return;

  const horseId = String(formData.get("horse_id") ?? "");
  const riderId = String(formData.get("rider_id") ?? "");
  if (!horseId || !riderId) return;

  const supabase = await createClient();
  await supabase.from("horse_riders").delete().eq("horse_id", horseId).eq("rider_id", riderId);

  revalidate(horseId);
}

/**
 * Add or replace the plan for one meal.
 *
 * The table allows only ONE ACTIVE plan per horse per meal, so replacing means
 * retiring the current one rather than deleting it: the old chart stays
 * readable as history. Retire first, then insert — the other order trips the
 * unique index.
 */
export async function saveFeedPlan(
  _prev: HorseAdminState,
  formData: FormData,
): Promise<HorseAdminState> {
  if (!(await requireManageHorses())) return { error: DENIED, message: null };

  const horseId = String(formData.get("horse_id") ?? "");
  const meal = String(formData.get("meal") ?? "");
  const description = String(formData.get("description") ?? "").trim();

  if (!horseId) return { error: "Missing horse.", message: null };
  if (!isMeal(meal)) return { error: "Pick a meal.", message: null };
  if (!description) return { error: "Say what the horse is fed.", message: null };

  const supabase = await createClient();

  const { error: retireError } = await supabase
    .from("feed_plans")
    .update({ active: false })
    .eq("horse_id", horseId)
    .eq("meal", meal)
    .eq("active", true);

  if (retireError) return { error: retireError.message, message: null };

  const { error } = await supabase.from("feed_plans").insert({
    horse_id: horseId,
    meal,
    description,
    supplements: String(formData.get("supplements") ?? "").trim(),
    special_instructions: String(formData.get("special_instructions") ?? "").trim(),
    active: true,
  });

  if (error) return { error: error.message, message: null };

  revalidate(horseId);
  return { error: null, message: "Feed chart updated." };
}

export async function retireFeedPlan(formData: FormData): Promise<void> {
  if (!(await requireManageHorses())) return;

  const id = String(formData.get("id") ?? "");
  const horseId = String(formData.get("horse_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("feed_plans").update({ active: false }).eq("id", id);

  revalidate(horseId);
}
