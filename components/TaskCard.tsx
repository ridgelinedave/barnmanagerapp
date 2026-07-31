"use client";

import { useActionState } from "react";
import { Chip } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
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

      {/*
       * The whole card is the button. A 56px row you can hit anywhere beats a
       * 24px checkbox you have to aim at — these get ticked off one-handed, in
       * gloves, often in the dark.
       */}
      <button
        type="submit"
        disabled={pending}
        aria-pressed={done}
        className={`flex min-h-14 w-full items-start gap-3 rounded-card border p-4 text-left transition-[transform,opacity] duration-150 ease-out active:scale-[0.99] disabled:opacity-60 ${
          done ? "border-line bg-sunk" : "border-line bg-surface"
        }`}
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
            done ? "border-forest bg-forest text-white" : "border-muted/50"
          }`}
        >
          {done && <Icon name="check" className="size-4" strokeWidth={3} />}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block font-display text-heading leading-snug ${
              done ? "text-muted line-through" : "text-ink"
            }`}
          >
            {task.title}
          </span>
          {task.description && (
            <span className="mt-0.5 block text-caption text-muted">{task.description}</span>
          )}
          {showAssignee && (
            <span className="mt-1.5 block">
              <Chip
                value={assigneeName ?? "Unassigned"}
                icon={assigneeName ? "check" : "alert"}
                tone={assigneeName ? "neutral" : "gold"}
              />
            </span>
          )}
          {state.error && (
            <span role="alert" className="mt-1 block text-caption font-medium text-danger">
              {state.error}
            </span>
          )}
        </span>

        <span className="shrink-0 self-center font-display text-eyebrow uppercase text-muted">
          {pending ? "…" : done ? "Undo" : "Done"}
        </span>
      </button>
    </form>
  );
}
