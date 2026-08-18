"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";
import type { BlanketRule } from "@/lib/types";

export type PlanState = { error: string | null; message: string | null };

async function requireBarn() {
  const role = await currentRole();
  if (role !== "admin" && role !== "staff") {
    throw new Error("Only the barn may write a care plan.");
  }
}

/**
 * Rules arrive as one JSON string, not a spray of indexed inputs — the same
 * choice FormTemplateEditor made, for the same reason: reordering indexed
 * names is where an off-by-one loses somebody's rule.
 *
 * RE-VALIDATED HERE rather than trusted. The column is constrained only to be
 * an ARRAY, so a malformed object would store happily and then render as
 * nothing; a plan that saves and shows blank is worse than one that refuses.
 */
function parseRules(raw: string): BlanketRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    throw new Error("The blanket rules were not readable.");
  }
  if (!Array.isArray(parsed)) throw new Error("The blanket rules were not a list.");

  return parsed.map((entry) => {
    const rule = entry as Partial<BlanketRule>;
    const layer = String(rule.layer ?? "").trim();
    if (!layer) throw new Error("Every rule needs a layer — what actually goes on.");
    const num = (v: unknown) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error("A temperature was not a number.");
      return n;
    };
    return { min_f: num(rule.min_f), max_f: num(rule.max_f), layer };
  });
}

/** One plan per horse — upserted on horse_id, which carries a UNIQUE index. */
export async function saveBlanketPlan(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requireBarn();

  const horseId = String(formData.get("horse_id") ?? "");
  if (!horseId) return { error: "Which horse?", message: null };

  let rules: BlanketRule[];
  try {
    rules = parseRules(String(formData.get("rules") ?? "[]"));
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "Bad rules.", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("blanket_plans").upsert(
    {
      horse_id: horseId,
      blanket_rules: rules,
      fly_mask: formData.get("fly_mask") === "on",
      fly_sheet: formData.get("fly_sheet") === "on",
      fly_spray: formData.get("fly_spray") === "on",
      notes: String(formData.get("notes") ?? "").trim(),
    },
    { onConflict: "horse_id" },
  );

  if (error) return { error: error.message, message: null };

  revalidatePath("/barn/blanketing");
  return { error: null, message: "Plan saved." };
}
