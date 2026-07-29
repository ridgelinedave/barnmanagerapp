import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import type { FeedPlan, Horse, HorseBasics, Meal, Rider } from "@/lib/types";

/**
 * Horse reads.
 *
 * None of these filter by family. RLS already decides who sees which horse, so
 * a parent asking for "all horses" gets back exactly the one they own — and a
 * horse their rider merely rides is not in that answer at all. Re-implementing
 * the rule here would give it a second home and a chance to drift.
 *
 * The one query that is NOT a table read is basicsForFamily(). The basics tier
 * is a column projection, and a projection cannot be expressed as a row policy,
 * so it comes from horses_basics() — see migration 0010.
 */
export async function listHorses(): Promise<Horse[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("horses")
    .select("*")
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error) return [];
  return (data ?? []) as Horse[];
}

export async function getHorse(id: string): Promise<Horse | null> {
  if (!supabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.from("horses").select("*").eq("id", id).maybeSingle();

  if (error) return null;
  return (data as Horse) ?? null;
}

/**
 * Horses the viewer's family rides but does not own — name, barn name and
 * photo, and nothing else the database is willing to return.
 */
export async function basicsForFamily(): Promise<HorseBasics[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("horses_basics");

  if (error) return [];
  return (data ?? []) as HorseBasics[];
}

export async function listFeedPlans(horseId: string): Promise<FeedPlan[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feed_plans")
    .select("*")
    .eq("horse_id", horseId)
    .order("active", { ascending: false })
    .order("meal", { ascending: true });

  if (error) return [];
  return (data ?? []) as FeedPlan[];
}

/** A feed-board row: the plan, plus the horse it belongs to. */
export type FeedBoardEntry = { plan: FeedPlan; horse: Horse };

/**
 * Every active feed plan, grouped by meal — the morning surface.
 *
 * Two queries rather than a PostgREST embed, because the embed would silently
 * return a null horse for any row whose horse the caller cannot read. Staff and
 * admin can read every horse, so that cannot happen today; doing the join here
 * means it still cannot happen if this is ever shown to somebody narrower.
 * A plan whose horse is unreadable is dropped rather than rendered nameless.
 */
export async function feedBoard(): Promise<Record<Meal, FeedBoardEntry[]>> {
  const empty: Record<Meal, FeedBoardEntry[]> = { am: [], lunch: [], pm: [] };
  if (!supabaseConfigured()) return empty;

  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from("feed_plans")
    .select("*")
    .eq("active", true);

  if (error || !plans?.length) return empty;

  const horseIds = [...new Set(plans.map((p) => p.horse_id as string))];
  const { data: horses } = await supabase
    .from("horses")
    .select("*")
    .in("id", horseIds)
    .eq("active", true);

  const byId = new Map((horses ?? []).map((h) => [h.id as string, h as Horse]));

  const board: Record<Meal, FeedBoardEntry[]> = { am: [], lunch: [], pm: [] };
  for (const plan of plans as FeedPlan[]) {
    const horse = byId.get(plan.horse_id);
    if (!horse) continue;
    board[plan.meal].push({ plan, horse });
  }

  for (const meal of Object.keys(board) as Meal[]) {
    board[meal].sort((a, b) => a.horse.name.localeCompare(b.horse.name));
  }

  return board;
}

/** Riders assigned to a horse. Admin/staff read all; a parent sees their own. */
export async function listHorseRiders(horseId: string): Promise<Rider[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from("horse_riders")
    .select("rider_id")
    .eq("horse_id", horseId);

  if (error || !links?.length) return [];

  const { data: riders } = await supabase
    .from("riders")
    .select("*")
    .in(
      "id",
      links.map((l) => l.rider_id as string),
    )
    .order("name", { ascending: true });

  return (riders ?? []) as Rider[];
}

/** Every rider, for the admin assignment picker. RLS scopes this to admin/staff. */
export async function listAssignableRiders(): Promise<Rider[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("riders")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) return [];
  return (data ?? []) as Rider[];
}

/** Family names for the owner picker and the ownership chip. */
export async function familyNames(): Promise<Map<string, string>> {
  if (!supabaseConfigured()) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase.from("families").select("id, name");

  if (error) return new Map();
  return new Map((data ?? []).map((f) => [f.id as string, f.name as string]));
}
