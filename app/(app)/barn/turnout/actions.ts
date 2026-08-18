"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";
import { TURNOUT_PATTERNS, type TurnoutPattern } from "@/lib/types";

export type TurnoutState = { error: string | null; message: string | null };

/** One plan per horse — upserted on horse_id, which carries a UNIQUE index. */
export async function saveTurnoutPlan(
  _prev: TurnoutState,
  formData: FormData,
): Promise<TurnoutState> {
  const role = await currentRole();
  if (role !== "admin" && role !== "staff") {
    return { error: "Only the barn may set turnout.", message: null };
  }

  const horseId = String(formData.get("horse_id") ?? "");
  if (!horseId) return { error: "Which horse?", message: null };

  const pattern = String(formData.get("pattern") ?? "daily");

  const supabase = await createClient();
  const { error } = await supabase.from("turnout_plans").upsert(
    {
      horse_id: horseId,
      paddock: String(formData.get("paddock") ?? "").trim(),
      turnout_group: String(formData.get("turnout_group") ?? "").trim(),
      pattern: (TURNOUT_PATTERNS as readonly string[]).includes(pattern)
        ? (pattern as TurnoutPattern)
        : "daily",
      notes: String(formData.get("notes") ?? "").trim(),
    },
    { onConflict: "horse_id" },
  );

  if (error) return { error: error.message, message: null };

  revalidatePath("/barn/turnout");
  return { error: null, message: "Turnout saved." };
}
