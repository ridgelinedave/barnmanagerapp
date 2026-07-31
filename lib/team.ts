import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { featureEnabled } from "@/config/barn";
import type { Invite } from "@/lib/invites";
import type { Family, Level, Profile, Rider } from "@/lib/types";

/**
 * Reads for the Team panel — people, families, riders and levels.
 *
 * None of these filter by role. RLS already decides who sees which row, and
 * the panel is behind an admin-only route, so re-checking here would give the
 * rule a second home and a chance to drift. A non-admin who somehow reached
 * these functions gets back what the database is willing to show them, which
 * for `profiles` is their own row and their own family — not an error, and not
 * everyone else's phone number.
 */

/**
 * Everyone with a login, ordered the way the barn thinks about them: admin,
 * then staff, then parents, alphabetical inside each. Postgres cannot order by
 * an arbitrary enum-ish list without a CASE expression, and PostgREST cannot
 * express one, so the rank is applied here.
 */
const ROLE_RANK = { admin: 0, staff: 1, parent: 2 } as const;

export type TeamMember = Profile & { familyName: string | null };

export async function listTeam(): Promise<TeamMember[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const [{ data: profiles, error }, families] = await Promise.all([
    supabase.from("profiles").select("*"),
    listFamilies(),
  ]);

  if (error) return [];

  const familyName = new Map(families.map((family) => [family.id, family.name]));

  return ((profiles ?? []) as Profile[])
    .map((profile) => ({
      ...profile,
      familyName: profile.family_id ? (familyName.get(profile.family_id) ?? null) : null,
    }))
    .sort(
      (a, b) =>
        ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
        (a.full_name ?? "").localeCompare(b.full_name ?? ""),
    );
}

/**
 * How many admins the barn has.
 *
 * Used to stop the last one demoting themselves into a barn nobody can
 * administer. Counted through the caller's own session, so it is only accurate
 * for someone who can already see every profile — which is exactly who is
 * allowed to change a role.
 */
export async function adminCount(): Promise<number> {
  if (!supabaseConfigured()) return 0;

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (error) return 0;
  return count ?? 0;
}

export async function listFamilies(): Promise<Family[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.from("families").select("*").order("name");

  if (error) return [];
  return (data ?? []) as Family[];
}

export type FamilyWithRiders = Family & { riders: Rider[] };

/**
 * Families with their riders attached.
 *
 * Two queries and a join in memory rather than a nested PostgREST select: the
 * embedded form applies the parent table's policy to the child rows in a way
 * that is easy to misread, and the barn has tens of families, not thousands.
 * Clear beats clever at this size.
 */
export async function listFamiliesWithRiders(): Promise<FamilyWithRiders[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const [families, { data: riders, error }] = await Promise.all([
    listFamilies(),
    supabase.from("riders").select("*").order("name"),
  ]);

  if (error) return families.map((family) => ({ ...family, riders: [] }));

  const byFamily = new Map<string, Rider[]>();
  for (const rider of (riders ?? []) as Rider[]) {
    const list = byFamily.get(rider.family_id);
    if (list) list.push(rider);
    else byFamily.set(rider.family_id, [rider]);
  }

  return families.map((family) => ({ ...family, riders: byFamily.get(family.id) ?? [] }));
}

/**
 * Every invite, newest first.
 *
 * Reads through the caller's own session, so the admin-only SELECT policy is
 * what returns rows — a staff or parent session gets an empty list rather than
 * an error, which is the correct answer and not one this function has to
 * decide. Returns [] when the flag is off so the panel can render before the
 * migration is applied.
 */
export async function listInvites(): Promise<Invite[]> {
  if (!supabaseConfigured() || !featureEnabled("invites")) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .order("created_at", { ascending: false });

  // A missing table is the expected state until migration 0017 is applied.
  if (error) return [];
  return (data ?? []) as Invite[];
}

export async function listLevels(): Promise<Level[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .order("sort")
    .order("name");

  if (error) return [];
  return (data ?? []) as Level[];
}
