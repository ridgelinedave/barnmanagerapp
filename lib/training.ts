import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import type { TrainingLog } from "@/lib/types";

/**
 * Training history for one horse, most recent first.
 *
 * Not filtered by who is asking, exactly like listCareEvents(). RLS returns
 * the full history to the barn and to the OWNING family, and NOTHING to a
 * family whose rider merely rides the horse — so a parent calling this for a
 * horse they do not own gets an empty list, which is precisely what the screen
 * should show. Re-implementing that rule here would give it a second home and
 * a chance to drift out of step with the policy.
 *
 * A missing table is the expected state until migration 0020 is applied, so an
 * error returns [] rather than throwing on a screen that has other sections.
 */
export async function listTrainingLogs(horseId: string): Promise<TrainingLog[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_logs")
    .select("*")
    .eq("horse_id", horseId)
    .order("performed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as TrainingLog[];
}
