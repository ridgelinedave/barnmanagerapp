"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageBarnOps } from "@/lib/barn-ops";

export type DeleteState = { error: string | null; done: boolean };

/**
 * ONE delete for every operations screen, over a closed list of tables.
 *
 * The table name arrives from the form, so it is never trusted: it must be a
 * key of this map, and the map is the only place a table name is spelled. The
 * screen to refresh comes from the same entry, not from the client.
 *
 * Gated on has_permission('manage_horses') — admin, or the flag — here so the
 * person gets a sentence, and by RLS regardless. RLS refusing a DELETE is not
 * an error, it is zero rows, so the delete asks for the deleted id back and
 * treats "nothing came back" as refused rather than reporting success.
 */
const TABLES = {
  supply_items: "/barn/supplies",
  water_sources: "/barn/water",
  blanket_plans: "/barn/blanketing",
  turnout_plans: "/barn/turnout",
  maintenance_requests: "/barn/maintenance",
} as const;

type BarnOpsTable = keyof typeof TABLES;

const isTable = (value: string): value is BarnOpsTable => Object.hasOwn(TABLES, value);

export async function deleteBarnOpsRow(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const table = String(formData.get("table") ?? "");
  const id = String(formData.get("id") ?? "");

  if (!isTable(table) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return { error: "That item could not be found.", done: false };
  }
  if (!(await canManageBarnOps())) {
    return { error: "Only an admin, or someone with the Horses & feed permission, can delete.", done: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");

  if (error) return { error: error.message, done: false };
  if (!data || data.length === 0) {
    return { error: "Not deleted. It may already be gone, or you may not have access.", done: false };
  }

  revalidatePath(TABLES[table]);
  revalidatePath("/barn");
  return { error: null, done: true };
}
