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

/** One horse and every active meal it has a chart for. */
export type HorseFeed = { horse: Horse; plans: FeedPlan[] };

/**
 * The feed board, BY HORSE.
 *
 * The old shape was meal-major — three lists, one per meal, a horse appearing
 * in each. That is how a spreadsheet thinks about feeding. A person walking the
 * aisle thinks horse-major: stand in front of Winston, read Winston. So the
 * board is now a list of horses, and the chart lives on the horse.
 *
 * Horses with no chart at all are included deliberately, so "nobody has set
 * Sable's feed" is visible on the board rather than being a silent absence.
 */
export async function feedBoardByHorse(): Promise<HorseFeed[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const [{ data: horses }, { data: plans }] = await Promise.all([
    supabase.from("horses").select("*").eq("active", true).order("name"),
    supabase.from("feed_plans").select("*").eq("active", true),
  ]);

  const byHorse = new Map<string, FeedPlan[]>();
  for (const plan of (plans ?? []) as FeedPlan[]) {
    const list = byHorse.get(plan.horse_id);
    if (list) list.push(plan);
    else byHorse.set(plan.horse_id, [plan]);
  }

  return ((horses ?? []) as Horse[]).map((horse) => ({
    horse,
    plans: (byHorse.get(horse.id) ?? []).sort(
      (a, b) => MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal),
    ),
  }));
}

const MEAL_ORDER: Meal[] = ["am", "lunch", "pm"];


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
