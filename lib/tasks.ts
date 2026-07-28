import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import type { Profile, Task, TaskTemplate } from "@/lib/types";

/**
 * Task reads.
 *
 * As with announcements, none of these filter by assignee for scoping. The RLS
 * policy already restricts staff to their own assignments, so a staff session
 * asking for "all tasks on this date" gets back exactly their own. Duplicating
 * the rule here would give it a second home and a chance to drift.
 */
export async function listTasksForDate(date: string): Promise<Task[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("date", date)
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as Task[];
}

export async function listTaskTemplates(): Promise<TaskTemplate[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_templates")
    .select("*")
    .order("active", { ascending: false })
    .order("title", { ascending: true });

  if (error) return [];
  return (data ?? []) as TaskTemplate[];
}

/** Staff who can be assigned work. Admin-only in practice — RLS decides. */
export async function listAssignableProfiles(): Promise<Profile[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["staff", "admin"])
    .order("full_name", { ascending: true });

  if (error) return [];
  return (data ?? []) as Profile[];
}

/** Display names for assignee chips, keyed by profiles.id. */
export function nameMap(profiles: Profile[]): Map<string, string> {
  return new Map(profiles.map((p) => [p.id, p.full_name ?? "Unnamed"]));
}
