import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import type { PayPeriod, Punch, TimesheetApproval } from "@/lib/types";

/**
 * Punch reads.
 *
 * No scoping here: the RLS policy returns a staff member only their own rows
 * and an admin everyone's, so the same query serves both screens. Filtering
 * again in the app would give the rule a second home.
 */
export async function listPunchesBetween(from: string, to: string): Promise<Punch[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("punches")
    .select("*")
    .gte("punched_at", from)
    .lte("punched_at", to)
    .order("punched_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as Punch[];
}

export async function listPayPeriods(): Promise<PayPeriod[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pay_periods")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) return [];
  return (data ?? []) as PayPeriod[];
}

export async function listApprovals(periodId?: string): Promise<TimesheetApproval[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase.from("timesheet_approvals").select("*");
  if (periodId) query = query.eq("period_id", periodId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as TimesheetApproval[];
}
