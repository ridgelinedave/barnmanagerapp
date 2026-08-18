"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";

export type WaterState = { error: string | null; message: string | null };

/**
 * "Checked now" — one tap, the whole point of the screen.
 *
 * Writes last_checked_at and nothing else. That is not politeness: the column
 * guard water_sources_guard_update() REFUSES a staff update that touches the
 * name, location, interval or notes, so sending a wider patch from here would
 * fail for staff and quietly succeed for admin — two behaviours from one
 * button. One column keeps it one behaviour.
 */
export async function markWaterChecked(
  _prev: WaterState,
  formData: FormData,
): Promise<WaterState> {
  const role = await currentRole();
  if (role !== "admin" && role !== "staff") {
    return { error: "Only the barn records a trough check.", message: null };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Which trough?", message: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("water_sources")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message, message: null };

  revalidatePath("/barn/water");
  return { error: null, message: null };
}
