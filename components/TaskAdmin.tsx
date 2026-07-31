"use client";

import { useActionState } from "react";
import {
  generateTodaysTasks,
  createAdHocTask,
  createTaskTemplate,
  type TaskAdminState,
} from "@/app/(app)/manage/tasks/actions";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input, Select, Textarea } from "@/components/ui/Field";
import { WEEKDAY_NAMES } from "@/lib/dates";
import { RECURRENCES } from "@/lib/types";

const EMPTY: TaskAdminState = { error: null, message: null };

type Assignable = { id: string; name: string };

/**
 * Materialise today's tasks from the templates.
 *
 * Deliberately a visible button rather than something automatic: the nightly
 * cron is deferred, and a generation step that silently did nothing would be
 * indistinguishable from a broken one. It reports the count it created.
 */
export function GenerateTasksButton() {
  const [state, formAction, pending] = useActionState(generateTodaysTasks, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" variant="primary" block disabled={pending} icon="plus">
        {pending ? "Generating…" : "Generate today's tasks"}
      </Button>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}

export function AdHocTaskForm({ assignable }: { assignable: Assignable[] }) {
  const [state, formAction, pending] = useActionState(createAdHocTask, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Task" htmlFor="adhoc-title">
        <Input id="adhoc-title" name="title" required />
      </Field>

      <Field label="Details" htmlFor="adhoc-description" optional>
        <Textarea id="adhoc-description" name="description" rows={2} />
      </Field>

      <Field label="Assign to" htmlFor="adhoc-assignee">
        <Select id="adhoc-assignee" name="assignee">
          <option value="">Unassigned</option>
          {assignable.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </Field>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Adding…" : "Add task for today"}
      </Button>
    </form>
  );
}

export function TaskTemplateForm({ assignable }: { assignable: Assignable[] }) {
  const [state, formAction, pending] = useActionState(createTaskTemplate, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Recurring task" htmlFor="tpl-title">
        <Input id="tpl-title" name="title" required />
      </Field>

      <Field label="Details" htmlFor="tpl-description" optional>
        <Textarea id="tpl-description" name="description" rows={2} />
      </Field>

      <Field
        label="Repeats"
        htmlFor="tpl-recurrence"
        hint="Pick a day below only if you chose Weekly."
      >
        <Select id="tpl-recurrence" name="recurrence" defaultValue="daily">
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {r === "daily" ? "Every day" : r === "weekday" ? "Weekdays (Mon–Fri)" : "Weekly"}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Day of the week" htmlFor="tpl-weekday">
        <Select id="tpl-weekday" name="weekday" defaultValue="1">
          {WEEKDAY_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Usually done by" htmlFor="tpl-assignee">
        <Select id="tpl-assignee" name="default_assignee">
          <option value="">Unassigned</option>
          {assignable.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </Field>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Add template"}
      </Button>
    </form>
  );
}
