import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { featureEnabled } from "@/config/barn";
import { addBarnDays } from "@/lib/dates";

/**
 * The client list — the barn owner's CRM.
 *
 * A CLIENT is a `families` row: the account that pays. Whether it is a
 * boarder, a lesson family or both is not stored anywhere; it falls out of
 * what the client HAS (riders, horses), so it cannot drift from the facts.
 * See migration 0026's header for the full model.
 *
 * Every read is on the RLS-scoped client. The screen is admin-only, and
 * admin reads all of these tables already; nothing here widens anything.
 */
export type ClientStatus = "active" | "inactive" | "on_break";

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  on_break: "On a break",
};

/** Derived, never stored. */
export type ClientKind = "Lessons" | "Boarding" | "Lessons and boarding" | "No riders or horses";

export type ClientRow = {
  id: string;
  name: string;
  /** Null until migration 0026 adds families.status (flag `clientStatus`). */
  status: ClientStatus | null;
  kind: ClientKind;
  riders: string[];
  horses: string[];
  /** The soonest booked lesson for any of their riders, from today. */
  nextLesson: { date: string; time: string } | null;
  pendingForms: number;
};

function kindOf(riders: number, horses: number): ClientKind {
  if (riders > 0 && horses > 0) return "Lessons and boarding";
  if (riders > 0) return "Lessons";
  if (horses > 0) return "Boarding";
  return "No riders or horses";
}

export async function listClients(today: string): Promise<ClientRow[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const [families, riders, horses, forms, instances] = await Promise.all([
    supabase.from("families").select("*").order("name"),
    supabase.from("riders").select("id, family_id, name, active").order("name"),
    supabase.from("horses").select("id, owner_family_id, name, barn_name, active").order("name"),
    supabase.from("form_submissions").select("family_id, status").eq("status", "pending"),
    supabase
      .from("lesson_instances")
      .select("id, date, start_time")
      .eq("status", "scheduled")
      .gte("date", today)
      .lte("date", addBarnDays(today, 120))
      .order("date")
      .order("start_time"),
  ]);

  const instanceList = instances.data ?? [];
  const { data: bookings } = instanceList.length
    ? await supabase
        .from("lesson_riders")
        .select("instance_id, rider_id, status")
        .in("instance_id", instanceList.map((i) => i.id))
        .in("status", ["booked", "backfilled"])
    : { data: [] };

  const riderFamily = new Map((riders.data ?? []).map((r) => [r.id as string, r.family_id as string]));
  const instanceById = new Map(instanceList.map((i) => [i.id as string, i]));

  const next = new Map<string, { date: string; time: string }>();
  for (const b of bookings ?? []) {
    const family = riderFamily.get(b.rider_id as string);
    const instance = instanceById.get(b.instance_id as string);
    if (!family || !instance) continue;
    const candidate = { date: instance.date as string, time: instance.start_time as string };
    const current = next.get(family);
    if (!current || `${candidate.date}${candidate.time}` < `${current.date}${current.time}`) {
      next.set(family, candidate);
    }
  }

  const pending = new Map<string, number>();
  for (const f of forms.data ?? []) pending.set(f.family_id as string, (pending.get(f.family_id as string) ?? 0) + 1);

  const showStatus = featureEnabled("clientStatus");

  return (families.data ?? []).map((family) => {
    const own = (riders.data ?? []).filter((r) => r.family_id === family.id && r.active);
    const owned = (horses.data ?? []).filter((h) => h.owner_family_id === family.id && h.active);
    const status = showStatus && typeof family.status === "string" ? (family.status as ClientStatus) : null;
    return {
      id: family.id as string,
      name: family.name as string,
      status,
      kind: kindOf(own.length, owned.length),
      riders: own.map((r) => r.name as string),
      horses: owned.map((h) => (h.barn_name as string) || (h.name as string)),
      nextLesson: next.get(family.id as string) ?? null,
      pendingForms: pending.get(family.id as string) ?? 0,
    };
  });
}
