"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentRole } from "@/lib/guard";
import { SUPPLY_STATUSES, type SupplyStatus } from "@/lib/types";

export type SupplyState = { error: string | null; message: string | null };

/** Barn-only, restated here so the UI fails fast with a sentence a person can read. */
async function requireBarn() {
  const role = await currentRole();
  if (role !== "admin" && role !== "staff") {
    throw new Error("Only the barn may change the supply list.");
  }
}

const asNumber = (value: FormDataEntryValue | null): number | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Add something to the supply list.
 *
 * THE NOTIFICATION IS PART OF THIS ACTION, NOT A SEPARATE BUTTON. Belle's ask
 * was "boarder supply sends a notification when we add it", so adding IS the
 * trigger — a button someone has to remember to press is a notification that
 * does not get sent.
 *
 * IT IS ALSO NOT ALLOWED TO BREAK THE INSERT. The item is already committed by
 * the time we call enqueue_boarder_supply_notices(); if that RPC fails, the
 * shavings are still on the list and the person who added them is told so. A
 * database trigger would have coupled the two — firing inside the writer's
 * transaction, so a notification failure would roll back the item — which is
 * the wrong trade for a shopping list. The failure is logged for the server
 * log and surfaced honestly in the success message rather than swallowed.
 *
 * The RPC stays barn-gated and idempotent on its own account, so calling it
 * here cannot notify anyone this caller could not have notified by hand, and
 * a double submit cannot double-notify.
 */
export async function createSupplyItem(
  _prev: SupplyState,
  formData: FormData,
): Promise<SupplyState> {
  await requireBarn();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the item a name.", message: null };

  const scope = String(formData.get("scope") ?? "barn") === "boarder" ? "boarder" : "barn";
  const familyId = String(formData.get("family_id") ?? "").trim() || null;
  const horseId = String(formData.get("horse_id") ?? "").trim() || null;

  // The CHECK constraint refuses these too; catching them here turns a raw
  // 23514 into a sentence.
  if (scope === "boarder" && !familyId) {
    return { error: "A boarder item needs the family it is for.", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("supply_items").insert({
    name,
    category: String(formData.get("category") ?? "").trim(),
    scope,
    quantity: asNumber(formData.get("quantity")),
    unit: String(formData.get("unit") ?? "").trim(),
    reorder_threshold: asNumber(formData.get("reorder_threshold")),
    notes: String(formData.get("notes") ?? "").trim(),
    // Barn items carry neither, and the constraint enforces it.
    family_id: scope === "boarder" ? familyId : null,
    horse_id: scope === "boarder" ? horseId : null,
    // requested_by is pinned by supply_items_guard_insert(); not sent.
  });

  if (error) return { error: error.message, message: null };

  revalidatePath("/barn/supplies");

  if (scope !== "boarder") {
    return { error: null, message: `${name} added.` };
  }

  // --- the notify half, deliberately non-fatal -------------------------------
  const { data: sent, error: notifyError } = await supabase.rpc(
    "enqueue_boarder_supply_notices",
  );

  if (notifyError) {
    // Logged, not thrown. The item exists; saying "failed" would be a lie and
    // would invite someone to add it a second time.
    console.error("[supplies] item added but notification failed:", notifyError.message);
    return {
      error: null,
      message: `${name} added. The family could not be notified just now — tell them, or try the list again later.`,
    };
  }

  const count = typeof sent === "number" ? sent : 0;
  return {
    error: null,
    message:
      count > 0
        ? `${name} added, and the family has been notified.`
        : `${name} added. The family had already been notified about it.`,
  };
}

/** Move an item along: needed -> ordered -> received. */
export async function setSupplyStatus(
  _prev: SupplyState,
  formData: FormData,
): Promise<SupplyState> {
  await requireBarn();

  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "");
  if (!id || !SUPPLY_STATUSES.includes(next as SupplyStatus)) {
    return { error: "That is not a status.", message: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("supply_items")
    .update({ status: next as SupplyStatus })
    .eq("id", id);

  if (error) return { error: error.message, message: null };

  revalidatePath("/barn/supplies");
  return { error: null, message: null };
}
