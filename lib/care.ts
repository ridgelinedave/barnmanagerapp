import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { addBarnDays, barnToday } from "@/lib/dates";
import type { CareEvent, Horse } from "@/lib/types";

/**
 * How far ahead "due soon" looks.
 *
 * KEEP IN SYNC with the 30-day window in enqueue_care_due_digest()
 * (supabase/migrations/20260728000700_care_events.sql). Two homes for one
 * number is a drift risk, and the alternatives are worse: putting a product
 * rule in config/barn.ts, which is for barn-specific FACTS, or a second RPC
 * whose only job is to restate a subtraction. If the digest window changes,
 * change it here too.
 */
export const CARE_DUE_SOON_DAYS = 30;

/**
 * Care history for one horse, most recent first.
 *
 * Not filtered by who is asking. RLS returns the full history to the barn and
 * to the owning family, and NOTHING to a family whose rider merely rides the
 * horse — so a parent calling this for a horse they do not own gets an empty
 * list, which is exactly what the screen should show.
 */
export async function listCareEvents(horseId: string): Promise<CareEvent[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("care_events")
    .select("*")
    .eq("horse_id", horseId)
    .order("performed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as CareEvent[];
}

export type DueSoonEntry = { event: CareEvent; horse: Horse };

/**
 * Everything falling due in the next 30 days, across every horse, soonest
 * first. Admin surface — a parent running it would see only their own horse's
 * items, which is harmless but not a screen we render.
 *
 * INCLUDES ITEMS ALREADY OVERDUE, which the digest deliberately does not: the
 * digest notifies about what is coming, and this is the barn's standing list of
 * what needs doing. An overdue Coggins dropping off the only screen that tracks
 * it, on the day it starts to matter, is exactly the wrong behaviour.
 *
 * Two queries rather than an embed, for the same reason as the feed board: an
 * embed returns a null horse for any row whose horse the caller cannot read,
 * and a due item with no horse name is worse than no due item.
 *
 * The window is measured from the BARN's today (lib/dates.ts), while the digest
 * measures from Postgres `current_date`, which is UTC. For a few hours each
 * evening the two can disagree about an item sitting exactly on the boundary —
 * the screen shows it a little before the digest would mention it, or the
 * reverse. Noted rather than solved: this is a "look at this in the next month"
 * surface, not a deadline.
 */
export async function careDueSoon(): Promise<DueSoonEntry[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data: events, error } = await supabase
    .from("care_events")
    .select("*")
    .not("due_next", "is", null)
    .lte("due_next", addBarnDays(barnToday(), CARE_DUE_SOON_DAYS))
    .order("due_next", { ascending: true });

  if (error || !events?.length) return [];

  const horseIds = [...new Set(events.map((e) => e.horse_id as string))];
  const { data: horses } = await supabase.from("horses").select("*").in("id", horseIds);
  const byId = new Map((horses ?? []).map((h) => [h.id as string, h as Horse]));

  const out: DueSoonEntry[] = [];
  for (const event of events as CareEvent[]) {
    const horse = byId.get(event.horse_id);
    if (!horse) continue;
    out.push({ event, horse });
  }
  return out;
}

/** Upcoming due items for ONE horse — the parent-facing "what's coming up". */
export function upcoming(events: CareEvent[]): CareEvent[] {
  const today = barnToday();
  return events
    .filter((e) => e.due_next !== null && e.due_next >= today)
    .sort((a, b) => (a.due_next ?? "").localeCompare(b.due_next ?? ""));
}

/** Names for the "logged by" line, keyed by profiles.id. */
export async function loggerNames(): Promise<Map<string, string>> {
  if (!supabaseConfigured()) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["staff", "admin"]);

  if (error) return new Map();
  return new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string) ?? "The barn"]));
}
