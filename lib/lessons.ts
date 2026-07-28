import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import type { LessonInstance, LessonRider, LessonTemplate, Rider } from "@/lib/types";

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
