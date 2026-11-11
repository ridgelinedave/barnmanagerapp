"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";
import { barn, featureEnabled } from "@/config/barn";
import { endOfZonedDay } from "@/lib/academy-access";

/**
 * Academy access granted by hand (0032) — e.g. a paying non-student; payment
 * happens outside the app. Admin only (RLS; the check here turns a refusal
 * into a sentence). A grant is ENDED, not deleted, so the record stays.
 */
export type GrantState = { error: string | null; message: string | null };
const OK = (message: string): GrantState => ({ error: null, message });
const FAIL = (error: string): GrantState => ({ error, message: null });
const UUID = /^[0-9a-f-]{36}$/i;

export async function grantAccess(_prev: GrantState, formData: FormData): Promise<GrantState> {
  if (!featureEnabled("academyAccess")) return FAIL("Academy access isn't switched on yet.");
  if ((await currentRole()) !== "admin") return FAIL("Only the barn admin can grant access.");
  const profileId = String(formData.get("profile_id") ?? "");
  const day = String(formData.get("ends") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!UUID.test(profileId)) return FAIL("Choose who gets access.");
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return FAIL("That end date isn't a date.");

  const supabase = await createClient();
  const { error } = await supabase.from("academy_grants").insert({
    profile_id: profileId,
    ends_at: day ? endOfZonedDay(day, barn.timezone).toISOString() : null,
    note,
  });
  if (error) return FAIL("Access wasn't granted. Try again.");
  revalidatePath("/manage/academy-access");
  return OK("Access granted.");
}

/** End a grant now. The row stays as the record of it. */
export async function endGrant(formData: FormData): Promise<void> {
  if ((await currentRole()) !== "admin") return;
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("academy_grants").update({ ends_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/manage/academy-access");
}
