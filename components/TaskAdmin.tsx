"use client";

import { useActionState } from "react";
import {
  generateTodaysTasks,
  createAdHocTask,
  createTaskTemplate,
  type TaskAdminState,
} from "@/app/(app)/manage/tasks/actions";
import { WEEKDAY_NAMES } from "@/lib/dates";
import { RECURRENCES } from "@/lib/types";

const EMPTY: TaskAdminState = { error: null, message: null };

type Assignable = { id: string; name: string };

function Feedback({ state }: { state: TaskAdminState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * Materialise today's tasks from templates.
 *
 * Deliberately a visible button rather than something automatic: the nightly
 * cron is deferred, and a generation step that silently did nothing would be
 * indistinguishable from a broken one. It reports the count it created.
 */
export function GenerateTasksButton() {
  const [state, formAction, pending] = useActionState(generateTodaysTasks, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate today's tasks"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function AdHocTaskForm({ assignable }: { assignable: Assignable[] }) {
  const [state, formAction, pending] = useActionState(createAdHocTask, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="adhoc-title" className="text-sm font-medium">
          Task
        </label>
        <input
          id="adhoc-title"
          name="title"
          required
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="adhoc-description" className="text-sm font-medium">
          Details <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <textarea
          id="adhoc-description"
          name="description"
          rows={2}
          className="rounded-xl border border-brand-ink/20 bg-white p-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="adhoc-assignee" className="text-sm font-medium">
          Assign to
        </label>
        <select
          id="adhoc-assignee"
          name="assignee"
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        >
          <option value="">Unassigned</option>
          {assignable.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add task for today"}
      </button>
    </form>
  );
}

export function TaskTemplateForm({ assignable }: { assignable: Assignable[] }) {
  const [state, formAction, pending] = useActionState(createTaskTemplate, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-title" className="text-sm font-medium">
          Recurring task
        </label>
        <input
          id="tpl-title"
          name="title"
          required
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-description" className="text-sm font-medium">
          Details <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <textarea
          id="tpl-description"
          name="description"
          rows={2}
          className="rounded-xl border border-brand-ink/20 bg-white p-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-recurrence" className="text-sm font-medium">
          Repeats
        </label>
        <select
          id="tpl-recurrence"
          name="recurrence"
          defaultValue="daily"
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        >
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {r === "daily" ? "Every day" : r === "weekday" ? "Weekdays (Mon–Fri)" : "Weekly"}
            </option>
          ))}
        </select>
        <p className="text-xs text-brand-ink/55">
          Pick a day below only if you chose Weekly.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-weekday" className="text-sm font-medium">
          Day of the week
        </label>
        <select
          id="tpl-weekday"
          name="weekday"
          defaultValue="1"
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        >
          {WEEKDAY_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-assignee" className="text-sm font-medium">
          Usually done by
        </label>
        <select
          id="tpl-assignee"
          name="default_assignee"
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        >
          <option value="">Unassigned</option>
          {assignable.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
      >
        {pending ? "Saving…" : "Add template"}
      </button>
    </form>
  );
}
