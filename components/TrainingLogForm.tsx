"use client";

import { useActionState, useId } from "react";
import { logTraining, type TrainingState } from "@/app/(app)/manage/horses/training-actions";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input, Select, Textarea } from "@/components/ui/Field";
import { DISCIPLINES, DISCIPLINE_LABELS } from "@/lib/types";

const EMPTY: TrainingState = { error: null, message: null };

/**
 * Log a training session.
 *
 * The date defaults to today but is editable, because the normal case is
 * writing up Tuesday's hack on Wednesday morning — the database allows a past
 * date for exactly that reason (migration 0020), so the form must too.
 *
 * Duration is optional and stays empty rather than defaulting to a number.
 * Most sessions are not timed, and a pre-filled "45" would quietly become a
 * record of something nobody measured.
 */
export function TrainingLogForm({ horseId, today }: { horseId: string; today: string }) {
  const [state, formAction, pending] = useActionState(logTraining, EMPTY);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="horse_id" value={horseId} />

      <Field label="What was the work" htmlFor={`${id}-discipline`}>
        <Select id={`${id}-discipline`} name="discipline" defaultValue="flatwork">
          {DISCIPLINES.map((discipline) => (
            <option key={discipline} value={discipline}>
              {DISCIPLINE_LABELS[discipline]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Day" htmlFor={`${id}-performed`} hint="Yesterday's ride can go in today.">
        <Input id={`${id}-performed`} name="performed_at" type="date" defaultValue={today} required />
      </Field>

      <Field
        label="Focus"
        htmlFor={`${id}-focus`}
        optional
        hint="What you worked on — shoulder-in, grids, hill work."
      >
        <Input id={`${id}-focus`} name="focus" />
      </Field>

      <Field label="Minutes" htmlFor={`${id}-duration`} optional>
        <Input
          id={`${id}-duration`}
          name="duration_min"
          type="number"
          inputMode="numeric"
          min="1"
          max="600"
          placeholder="45"
        />
      </Field>

      <Field label="Notes" htmlFor={`${id}-notes`} optional>
        <Textarea id={`${id}-notes`} name="notes" />
      </Field>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Log training"}
      </Button>
    </form>
  );
}
