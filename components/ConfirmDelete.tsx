"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { deleteBarnOpsRow, type DeleteState } from "@/app/(app)/barn/delete-actions";

/**
 * Delete, with a second tap to mean it. THE confirmation pattern for the app.
 *
 * Inline, not window.confirm(): a native dialog in an installed PWA on iOS is
 * a system sheet that names the web origin, and it cannot be styled or read
 * by the suite. The first tap swaps the button for the question and two
 * answers, Keep first; the destructive one stays a danger ghost, never a
 * filled red block, and focus moves to "Keep" so a stray second tap or Enter
 * is the safe one.
 *
 * Two entry points over one UI: `ConfirmDelete` for the operations tables
 * (one whitelisted action), `ConfirmDeleteForm` for any other delete action.
 */
function Ask({
  name,
  pending,
  error,
  formAction,
  children,
}: {
  name: string;
  pending: boolean;
  error?: string | null;
  formAction: (formData: FormData) => void | Promise<void>;
  /** The hidden fields that say what is being deleted. */
  children: ReactNode;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button type="button" variant="danger" onClick={() => setAsking(true)} className="self-start">
        Delete
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2" role="group" aria-label={`Delete ${name}`}>
      {children}
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
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

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
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteBarnOpsRow, {
    error: null,
    done: false,
  });

  return (
    <Ask name={name} pending={pending} error={state.error} formAction={action}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
    </Ask>
  );
}

/** The same confirmation over any delete action that takes a form. */
export function ConfirmDeleteForm({
  action,
  fields,
  name,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  name: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Ask
      name={name}
      pending={pending}
      formAction={async (formData) => {
        setPending(true);
        try {
          await action(formData);
        } finally {
          setPending(false);
        }
      }}
    >
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
    </Ask>
  );
}
