"use client";

import { useActionState } from "react";
import { setTaskDone, type CompleteState } from "@/app/(app)/tasks/actions";
import type { Task } from "@/lib/types";

/**
 * A single task, as a card with one obvious action (SPEC §3.4, §7).
 *
 * The whole row is the target — a 56px button, not a fiddly checkbox — because
 * staff tick these off one-handed with gloves on.
 */
export function TaskCard({
  task,
  assigneeName,
  showAssignee = false,
}: {
  task: Task;
  assigneeName?: string;
  /** Admin views show who a task belongs to; a staff member's own list doesn't. */
  showAssignee?: boolean;
}) {
  const [state, formAction, pending] = useActionState<CompleteState, FormData>(setTaskDone, {
    error: null,
  });

  const done = task.status === "done";

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="done" value={done ? "false" : "true"} />

      <button
        type="submit"
        disabled={pending}
        aria-pressed={done}
        className={`flex min-h-14 w-full items-start gap-3 rounded-2xl border p-4 text-left disabled:opacity-60 ${
          done ? "border-brand-ink/10 bg-brand-ink/5" : "border-brand-ink/15 bg-white"
        }`}
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
            done ? "border-brand-gold-deep bg-brand-gold-deep text-white" : "border-brand-ink/30"
          }`}
        >
          {done && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="size-4">
              <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block text-base font-semibold leading-snug ${
              done ? "text-brand-ink/50 line-through" : ""
            }`}
          >
            {task.title}
          </span>
          {task.description && (
            <span className="mt-0.5 block text-sm text-brand-ink/70">{task.description}</span>
          )}
          {showAssignee && (
            <span className="mt-1 block text-xs text-brand-ink/55">
              {assigneeName ? `Assigned to ${assigneeName}` : "Unassigned"}
            </span>
          )}
          {state.error && (
            <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
              {state.error}
            </span>
          )}
        </span>

        <span className="shrink-0 self-center text-xs font-semibold uppercase tracking-wide text-brand-ink/45">
          {pending ? "…" : done ? "Undo" : "Done"}
        </span>
      </button>
    </form>
  );
}
