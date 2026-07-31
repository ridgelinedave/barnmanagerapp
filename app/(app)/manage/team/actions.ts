"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { adminCount } from "@/lib/team";
import { isPermissionFlag, isRole, type Role } from "@/lib/types";

/**
 * Team, family, rider and level administration.
 *
 * NO NEW SECURITY MODEL. Every write below runs on the caller's own session
 * against the admin-only policies that migration 0003 already installed on
 * profiles / families / riders / levels, plus the
 * profiles_guard_privileged_columns trigger that stops a non-admin editing
 * role, flags or family linkage on their own row. The checks in this file
 * produce a sentence a person can read instead of a silent zero-row update;
 * deleting them would change the wording, not the permission.
 *
 * This is the one place in the app that checks `role === 'admin'` rather than
 * a permission flag, and that is deliberate: managing who has permissions is
 * not itself a grantable permission.
 */
export type TeamState = { error: string | null; message: string | null };

const OK = (message: string): TeamState => ({ error: null, message });
const FAIL = (error: string): TeamState => ({ error, message: null });

const DENIED = "Only an admin can change who is on the team.";

async function requireAdmin() {
  const state = await getViewer();
  if (state.status !== "viewer") return null;
  return state.viewer.role === "admin" ? state.viewer : null;
}

function revalidate() {
  revalidatePath("/manage/team");
  // A role change rewrites someone's whole tab bar, and a rider or level edit
  // shows up on the schedule and the backfill picker.
  revalidatePath("/manage");
  revalidatePath("/schedule");
}

/** Empty string → null, so an untouched optional field stores as absent. */
function optional(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Turn a Postgres complaint into something Belle can act on.
 *
 * The CHECK constraint below is the one this screen can actually trip, and its
 * raw message ("new row for relation profiles violates check constraint
 * profiles_family_only_for_parents") tells her nothing about what to do.
 */
function readable(message: string): string {
  if (message.includes("profiles_family_only_for_parents")) {
    return "Only parents belong to a family. Clear the family before making this person staff or an admin.";
  }
  if (message.includes("levels_name_key")) {
    return "There is already a level with that name.";
  }
  if (message.includes("Only an admin may change")) {
    return DENIED;
  }
  return message;
}

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Name and phone. Nothing privileged, so it is a separate action from the role
 * and flag changes below — the form a person edits most often should not carry
 * the fields that can lock someone out.
 */
export async function updatePersonDetails(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  if (!(await requireAdmin())) return FAIL(DENIED);

  const id = text(formData, "id");
  if (!id) return FAIL("Missing person.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: optional(formData, "full_name"),
      phone: optional(formData, "phone"),
    })
    .eq("id", id);

  if (error) return FAIL(readable(error.message));

  revalidate();
  return OK("Saved.");
}

/**
 * Change someone's role.
 *
 * TWO THINGS THIS HAS TO GET RIGHT, both of which the database will otherwise
 * refuse or allow wrongly:
 *
 *  1. `profiles_family_only_for_parents` requires family_id to be null unless
 *     role is 'parent'. Promoting a parent to staff therefore has to clear the
 *     family IN THE SAME UPDATE — two statements would leave a moment where the
 *     row violates its own constraint, and the first one would simply fail.
 *  2. The barn must not end up with no admin at all. Nothing in the schema
 *     prevents the last admin demoting themselves, and the resulting state is
 *     unrecoverable from inside the app: no one left can promote anyone.
 */
export async function updatePersonRole(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const viewer = await requireAdmin();
  if (!viewer) return FAIL(DENIED);

  const id = text(formData, "id");
  const role = text(formData, "role");
  const currentRoleValue = text(formData, "current_role");
  const familyId = optional(formData, "family_id");

  if (!id) return FAIL("Missing person.");
  if (!isRole(role)) return FAIL("Pick a role.");

  if (role === currentRoleValue && !familyId) return OK("No change.");

  // The last-admin guard, FIRST of two.
  //
  // This one exists for the message, not for the guarantee: it catches the
  // ordinary mistake early and says something useful about it. The guarantee
  // is migration 0016's `enforce_at_least_one_admin` trigger, which refuses the
  // write outright — including the race this check cannot see, where two admins
  // demote each other in the same instant and both read a count of 1.
  //
  // Deleting this check would not make the app unsafe; it would make it rude.
  // The trigger's own message is readable, so a race still surfaces as a
  // sentence rather than a stack trace.
  if (currentRoleValue === "admin" && role !== "admin") {
    if ((await adminCount()) <= 1) {
      return FAIL(
        "This is the barn's only admin. Make someone else an admin first, or there will be nobody left who can.",
      );
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      role: role as Role,
      // Staff and admin never belong to a family; parents may or may not yet.
      family_id: role === "parent" ? familyId : null,
    })
    .eq("id", id);

  if (error) return FAIL(readable(error.message));

  revalidate();
  return OK(role === "parent" ? "Role updated." : "Role updated, and family link cleared.");
}

/**
 * Toggle one permission flag.
 *
 * One flag per submit rather than a save-the-whole-form: these are the levers
 * that decide who can rewrite the schedule, and a checkbox that takes effect
 * on its own is easier to reason about — and to undo — than a form where three
 * unrelated changes ride along with the one you meant.
 */
export async function togglePermission(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = text(formData, "id");
  const flag = text(formData, "flag");
  if (!id || !isPermissionFlag(flag)) return;

  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ [flag]: text(formData, "value") === "on" })
    .eq("id", id);

  revalidate();
}

/* -------------------------------------------------------------------------- */
/* Families                                                                    */
/* -------------------------------------------------------------------------- */

export async function createFamily(_prev: TeamState, formData: FormData): Promise<TeamState> {
  if (!(await requireAdmin())) return FAIL(DENIED);

  const name = text(formData, "name");
  if (!name) return FAIL("Give the family a name.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("families")
    .insert({ name, notes: optional(formData, "notes") });

  if (error) return FAIL(readable(error.message));

  revalidate();
  return OK("Family added.");
}

export async function updateFamily(_prev: TeamState, formData: FormData): Promise<TeamState> {
  if (!(await requireAdmin())) return FAIL(DENIED);

  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!id) return FAIL("Missing family.");
  if (!name) return FAIL("Give the family a name.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("families")
    .update({ name, notes: optional(formData, "notes") })
    .eq("id", id);

  if (error) return FAIL(readable(error.message));

  revalidate();
  return OK("Saved.");
}

/* -------------------------------------------------------------------------- */
/* Riders                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Riders have no login of their own, so there is no invite, no email and no
 * auth user to create — a rider is a record the barn keeps, and can be added
 * freely.
 *
 * There is no `age` column and there must never be one: age is derived from
 * `dob` at read time (lib/dates.ts). A stored age is wrong within a year of
 * being typed.
 */
export async function createRider(_prev: TeamState, formData: FormData): Promise<TeamState> {
  if (!(await requireAdmin())) return FAIL(DENIED);

  const familyId = text(formData, "family_id");
  const name = text(formData, "name");
  if (!familyId) return FAIL("Missing family.");
  if (!name) return FAIL("Give the rider a name.");

  const supabase = await createClient();
  const { error } = await supabase.from("riders").insert({
    family_id: familyId,
    name,
    dob: optional(formData, "dob"),
    level_id: optional(formData, "level_id"),
    photo_url: optional(formData, "photo_url"),
    notes: optional(formData, "notes"),
    active: true,
  });

  if (error) return FAIL(readable(error.message));

  revalidate();
  return OK("Rider added.");
}

export async function updateRider(_prev: TeamState, formData: FormData): Promise<TeamState> {
  if (!(await requireAdmin())) return FAIL(DENIED);

  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!id) return FAIL("Missing rider.");
  if (!name) return FAIL("Give the rider a name.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("riders")
    .update({
      name,
      dob: optional(formData, "dob"),
      level_id: optional(formData, "level_id"),
      photo_url: optional(formData, "photo_url"),
      notes: optional(formData, "notes"),
      active: formData.get("active") === "on",
    })
    .eq("id", id);

  if (error) return FAIL(readable(error.message));

  revalidate();
  return OK("Saved.");
}

/* -------------------------------------------------------------------------- */
/* Levels                                                                      */
/* -------------------------------------------------------------------------- */

export async function createLevel(_prev: TeamState, formData: FormData): Promise<TeamState> {
  if (!(await requireAdmin())) return FAIL(DENIED);

  const name = text(formData, "name");
  if (!name) return FAIL("Give the level a name.");

  const sort = Number(text(formData, "sort"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("levels")
    .insert({ name, sort: Number.isFinite(sort) ? sort : 0 });

  if (error) return FAIL(readable(error.message));

  revalidate();
  return OK("Level added.");
}

export async function updateLevel(_prev: TeamState, formData: FormData): Promise<TeamState> {
  if (!(await requireAdmin())) return FAIL(DENIED);

  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!id) return FAIL("Missing level.");
  if (!name) return FAIL("Give the level a name.");

  const sort = Number(text(formData, "sort"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("levels")
    .update({ name, sort: Number.isFinite(sort) ? sort : 0 })
    .eq("id", id);

  if (error) return FAIL(readable(error.message));

  revalidate();
  return OK("Saved.");
}

/**
 * Reorder by nudging one level past its neighbour.
 *
 * Up/down buttons rather than drag-and-drop: this is a list of five or six
 * things edited twice a year, and a drag target on a phone is a worse control
 * than a button — it needs a gesture nobody is told about and has no keyboard
 * equivalent.
 */
export async function moveLevel(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = text(formData, "id");
  const direction = text(formData, "direction");
  if (!id || (direction !== "up" && direction !== "down")) return;

  const supabase = await createClient();
  const { data } = await supabase.from("levels").select("id, sort").order("sort").order("name");
  const levels = (data ?? []) as { id: string; sort: number }[];

  const index = levels.findIndex((level) => level.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= levels.length) return;

  // Rewrite the whole list's sort values from its new order rather than
  // swapping the two rows' numbers. `sort` defaults to 0 and nothing enforces
  // uniqueness, so any two levels can hold the same value — and swapping equal
  // numbers moves nothing while looking like it worked.
  const reordered = [...levels];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

  await Promise.all(
    reordered.map((level, position) =>
      supabase.from("levels").update({ sort: position }).eq("id", level.id),
    ),
  );

  revalidate();
}
