import "server-only";

import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";
import { supabaseConfigured } from "@/lib/env";
import type {
  BlanketPlan,
  BlanketRule,
  MaintenanceRequest,
  SupplyItem,
  TurnoutPlan,
  WaterSource,
} from "@/lib/types";

/**
 * The five barn-ops reads, all on the RLS-scoped client.
 *
 * WHO SEES WHAT IS NOT DECIDED HERE and must never be. Migration 0022's
 * policies do it: barn-only for troughs and maintenance, own-family for
 * boarder supplies, own-horse for blanket and turnout plans. Re-implementing
 * any of that in this file would give the rule a second home and a chance to
 * drift — the same discipline lib/calendar.ts and lib/shows.ts follow.
 *
 * What this file DOES decide is presentation: what counts as "running low",
 * what counts as "overdue", and how a plan reads on a board.
 */

/** True when staff or admin — the barn side, as opposed to a family. */
export async function isBarnSide(): Promise<boolean> {
  const role = await currentRole();
  return role === "admin" || role === "staff";
}

/* -------------------------------------------------------------------------- */
/* Supplies                                                                    */
/* -------------------------------------------------------------------------- */

export type SupplyRow = SupplyItem & { familyName: string | null; horseName: string | null };

/**
 * Running low = the barn has said so, OR the count has fallen to the line.
 *
 * Two conditions rather than one because they answer different questions: the
 * threshold is arithmetic the barn set up in advance, and `needed` is somebody
 * standing in the feed room saying we are out. Either is enough.
 */
export function isRunningLow(item: SupplyItem): boolean {
  if (item.status === "received") return false;
  if (item.status === "needed") return true;
  return (
    item.reorder_threshold !== null &&
    item.quantity !== null &&
    item.quantity <= item.reorder_threshold
  );
}

export async function listSupplies(): Promise<SupplyRow[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("supply_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (!items?.length) return [];

  // Names come from separate reads rather than a nested select: a nested join
  // across RLS-policed tables that returns null tells you nothing about WHICH
  // policy dropped it.
  const familyIds = [...new Set(items.map((i) => i.family_id).filter(Boolean))] as string[];
  const horseIds = [...new Set(items.map((i) => i.horse_id).filter(Boolean))] as string[];

  const [{ data: families }, { data: horses }] = await Promise.all([
    familyIds.length
      ? supabase.from("families").select("id, name").in("id", familyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    horseIds.length
      ? supabase.from("horses").select("id, name").in("id", horseIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const familyName = new Map((families ?? []).map((f) => [f.id, f.name]));
  const horseName = new Map((horses ?? []).map((h) => [h.id, h.name]));

  return (items as SupplyItem[]).map((item) => ({
    ...item,
    familyName: item.family_id ? (familyName.get(item.family_id) ?? null) : null,
    horseName: item.horse_id ? (horseName.get(item.horse_id) ?? null) : null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Water                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Overdue when the interval has elapsed since the last check — and when it has
 * NEVER been checked, which is the state a new trough starts in and the one
 * most worth flagging.
 */
export function waterIsOverdue(source: WaterSource, now = new Date()): boolean {
  if (!source.last_checked_at) return true;
  const due = new Date(source.last_checked_at);
  due.setUTCDate(due.getUTCDate() + source.reminder_interval_days);
  return due.getTime() <= now.getTime();
}

/** "3 days ago", "today". Relative, because the exact minute is never the point. */
export function sinceLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "Never checked";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Checked today";
  if (days === 1) return "Checked yesterday";
  return `Checked ${days} days ago`;
}

export async function listWaterSources(): Promise<WaterSource[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("water_sources").select("*").order("name");
  return (data ?? []) as WaterSource[];
}

/* -------------------------------------------------------------------------- */
/* Blanketing and turnout — both boards are "one row per horse"                */
/* -------------------------------------------------------------------------- */

export type HorseRef = { id: string; name: string };

export type BlanketRow = { horse: HorseRef; plan: BlanketPlan | null };
export type TurnoutRow = { horse: HorseRef; plan: TurnoutPlan | null };

/** Horses the caller may see. RLS decides: the barn gets all, a family its own. */
async function visibleHorses(): Promise<HorseRef[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("horses")
    .select("id, name")
    .eq("active", true)
    .order("name");
  return (data ?? []) as HorseRef[];
}

/**
 * A horse with NO plan still appears on the board.
 *
 * That is the whole point of a board: the gap is the information. A list of
 * only the horses someone has already written a plan for cannot tell you which
 * horse was forgotten.
 */
export async function listBlanketBoard(): Promise<BlanketRow[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();
  const horses = await visibleHorses();
  if (!horses.length) return [];

  const { data: plans } = await supabase
    .from("blanket_plans")
    .select("*")
    .in(
      "horse_id",
      horses.map((h) => h.id),
    );

  const byHorse = new Map((plans ?? []).map((p) => [p.horse_id, p as BlanketPlan]));
  return horses.map((horse) => ({ horse, plan: byHorse.get(horse.id) ?? null }));
}

export async function listTurnoutBoard(): Promise<TurnoutRow[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();
  const horses = await visibleHorses();
  if (!horses.length) return [];

  const { data: plans } = await supabase
    .from("turnout_plans")
    .select("*")
    .in(
      "horse_id",
      horses.map((h) => h.id),
    );

  const byHorse = new Map((plans ?? []).map((p) => [p.horse_id, p as TurnoutPlan]));
  return horses.map((horse) => ({ horse, plan: byHorse.get(horse.id) ?? null }));
}

/** "Under 40: heavy · 40-55: medium". One line, because a board is scanned. */
export function blanketSummary(rules: BlanketRule[]): string {
  if (!rules.length) return "";
  return rules
    .map((rule) => {
      const range =
        rule.min_f !== null && rule.max_f !== null
          ? `${rule.min_f}–${rule.max_f}`
          : rule.max_f !== null
            ? `Under ${rule.max_f}`
            : rule.min_f !== null
              ? `Over ${rule.min_f}`
              : "Any";
      return `${range}: ${rule.layer}`;
    })
    .join(" · ");
}

/** "Mask, spray" — only what is actually on. */
export function flySummary(plan: BlanketPlan): string {
  const on = [
    plan.fly_mask ? "Mask" : null,
    plan.fly_sheet ? "Sheet" : null,
    plan.fly_spray ? "Spray" : null,
  ].filter(Boolean);
  return on.join(", ");
}

/* -------------------------------------------------------------------------- */
/* Maintenance                                                                 */
/* -------------------------------------------------------------------------- */

export type MaintenanceRow = MaintenanceRequest & { assigneeName: string | null };

export async function listMaintenance(): Promise<MaintenanceRow[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("maintenance_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (!rows?.length) return [];

  const ids = [...new Set(rows.map((r) => r.assignee_id).filter(Boolean))] as string[];
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string | null }[] };

  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  return (rows as MaintenanceRequest[]).map((row) => ({
    ...row,
    assigneeName: row.assignee_id ? (name.get(row.assignee_id) ?? null) : null,
  }));
}

/** Can this caller close a request? Mirrors the UPDATE policy exactly. */
export async function canResolveMaintenance(): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_permission", { perm: "manage_horses" });
  return data === true;
}
