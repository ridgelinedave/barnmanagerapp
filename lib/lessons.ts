import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import type {
  Level,
  BackfillOffer,
  EligibleRider,
  LessonInstance,
  LessonRider,
  LessonTemplate,
  Rider,
} from "@/lib/types";

/**
 * Lesson reads.
 *
 * As everywhere else in this codebase, none of these re-implement visibility.
 * A parent's session asking for "instances on this date" gets back only the
 * ones a rider of theirs is in, because `family_sees_instance()` says so in the
 * policy. Filtering again here would give the rule a second home.
 */
export async function listInstancesForDate(date: string): Promise<LessonInstance[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_instances")
    .select("*")
    .eq("date", date)
    .order("start_time", { ascending: true });

  if (error) return [];
  return (data ?? []) as LessonInstance[];
}

/** Upcoming instances from `from` (inclusive) forward. */
export async function listUpcomingInstances(from: string, through: string): Promise<LessonInstance[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_instances")
    .select("*")
    .gte("date", from)
    .lte("date", through)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) return [];
  return (data ?? []) as LessonInstance[];
}

export async function listLessonRidersForInstances(
  instanceIds: string[],
): Promise<LessonRider[]> {
  if (!supabaseConfigured() || instanceIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_riders")
    .select("*")
    .in("instance_id", instanceIds);

  if (error) return [];
  return (data ?? []) as LessonRider[];
}

export async function listLessonTemplates(): Promise<LessonTemplate[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_templates")
    .select("*")
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) return [];
  return (data ?? []) as LessonTemplate[];
}

/**
 * Backfill offers the caller may see.
 *
 * RLS returns a parent only their own riders' offers, so the parent screens
 * pass no filter beyond status.
 */
export async function listOffers(options?: {
  instanceIds?: string[];
  outstandingOnly?: boolean;
}): Promise<BackfillOffer[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase.from("backfill_offers").select("*");

  if (options?.instanceIds) {
    if (options.instanceIds.length === 0) return [];
    query = query.in("instance_id", options.instanceIds);
  }
  if (options?.outstandingOnly) query = query.eq("status", "sent");

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as BackfillOffer[];
}

/**
 * Riders who could take a released seat.
 *
 * Eligibility (active, level match, not already in the lesson) is decided by
 * the database function, not here — the same function the engine re-checks
 * against when the offers are actually sent, so the list the admin sees and
 * the rule that is enforced cannot drift apart.
 */
export async function listEligibleRiders(instanceId: string): Promise<EligibleRider[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("eligible_backfill_riders", {
    instance: instanceId,
  });

  if (error) return [];
  return (data ?? []) as EligibleRider[];
}

/** Rider levels. Read-all-authenticated lookup. */
export async function listLevels(): Promise<Level[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.from("levels").select("*").order("sort");
  if (error) return [];
  return (data ?? []) as Level[];
}

/** Riders the caller may see. RLS scopes a parent to their own family. */
export async function listVisibleRiders(): Promise<Rider[]> {
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
