"use client";

import { useActionState } from "react";
import { Field, FormFeedback, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { saveLessonNotes, type LearningState } from "@/app/(app)/lessons/learn/actions";

const EMPTY: LearningState = { error: null, message: null };

/**
 * The admin's notes editor for one lesson. The barn owner writes these
 * herself — nothing here is pre-filled, summarised or suggested.
 */
export function LearningNotesEditor({
  lessonId,
  moduleId,
  notes,
}: {
  lessonId: string;
  moduleId: string;
  notes: string;
}) {
  const [state, formAction, pending] = useActionState(saveLessonNotes, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="lesson_id" value={lessonId} />
      <input type="hidden" name="module_id" value={moduleId} />
      <Field label="Notes" htmlFor={`notes-${lessonId}`}>
        <Textarea id={`notes-${lessonId}`} name="notes" rows={8} defaultValue={notes} />
      </Field>
      <FormFeedback error={state.error} message={state.message} />
      <Button type="submit" variant="primary" arrow={false} disabled={pending} className="lg:self-start">
        {pending ? "Saving…" : "Save notes"}
      </Button>
    </form>
  );
}
