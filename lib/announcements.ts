import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import type { Announcement } from "@/lib/types";

/**
 * Announcement reads.
 *
 * NOTE: these queries deliberately do NOT filter on `audience`. Audience
 * scoping is an RLS policy, so a parent's session simply cannot see a
 * staff-only row. Adding a redundant `.eq("audience", …)` here would create a
 * second place for the rule to live, and the day the two disagree is the day a
 * staff-only announcement leaks. Let the database decide.
 */
export async function listAnnouncements(limit = 20): Promise<Announcement[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("pinned", { ascending: false })
    .order("posted_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as Announcement[];
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  if (!supabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return null;
  return (data as Announcement) ?? null;
}
