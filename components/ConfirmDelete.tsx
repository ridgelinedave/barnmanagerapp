"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { deleteBarnOpsRow, type DeleteState } from "@/app/(app)/barn/delete-actions";

/**
 * Delete, with a second tap to mean it. THE confirmation pattern for the app.
 *
 * Inline, not window.confirm(): a native dialog in an installed PWA on iOS is
 * a system sheet that names the web origin, and it cannot be styled or read
 * by the suite. The first tap swaps the button for the question and two
 * answers, Keep first; the destructive one stays a danger ghost, never a filled red block,
 * and focus moves to "Keep" so a stray second tap or Enter is the safe one.
 */
export function ConfirmDelete({
  table,
  id,
  name,
}: {
  table: "supply_items" | "water_sources" | "blanket_plans" | "turnout_plans" | "maintenance_requests";
  id: string;
  /** What is being deleted, as the person would say it: "Shavings", "Duke's turnout plan". */
  name: string;
}) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteBarnOpsRow, {
    error: null,
    done: false,
  });
  if (!asking) {
    return (
      <Button type="button" variant="danger" size="default" onClick={() => setAsking(true)} className="self-start">
        Delete
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2" role="group" aria-label={`Delete ${name}`}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <p className="text-body text-ink">Delete {name}? This cannot be undone.</p>
      <div className="flex flex-wrap gap-2">
        {/* KEEP FIRST. It lands exactly where the first Delete was, so a
            double tap — or a tap that registers twice — keeps the item. With
            Delete in that spot, a double tap deleted (found in testing). */}
        <Button autoFocus type="button" variant="secondary" onClick={() => setAsking(false)} disabled={pending}>
          Keep
        </Button>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting" : "Delete"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-caption text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
