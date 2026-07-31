"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input, Select, Textarea } from "@/components/ui/Field";
import { logCareEvent, sendCareDigest, type CareState } from "@/app/(app)/manage/care/actions";
import { CARE_TYPES, CARE_TYPE_LABELS } from "@/lib/types";

const EMPTY: CareState = { error: null, message: null };

function Feedback({ state }: { state: CareState }) {
  return <FormFeedback error={state.error} message={state.message} />;
}

/**
 * Quick care logging, for the barn.
 *
 * `performed_at` defaults to today but is editable, because the common case is
 * logging something that happened earlier in the week — the vet came Tuesday,
 * someone writes it up on Thursday. The database accepts a past date on
 * purpose; see migration 0011.
 *
 * There is no "logged by" field. The database pins it to whoever is signed in,
 * so offering it would imply a choice that does not exist.
 */
export function CareLogForm({ horseId, today }: { horseId: string; today: string }) {
  const [state, formAction, pending] = useActionState(logCareEvent, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="horse_id" value={horseId} />

      <Field label="What was done" htmlFor="care-type">
        <Select id="care-type" name="type" defaultValue="farrier">
          {CARE_TYPES.map((type) => (
            <option key={type} value={type}>
              {CARE_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Details" htmlFor="care-description" optional>
        <Textarea
          id="care-description"
          name="description"
          rows={2}
          placeholder="Reset front shoes. Slight bruise on the near fore."
        />
      </Field>

      <Field label="When" htmlFor="care-performed">
        <Input id="care-performed" name="performed_at" type="date" required defaultValue={today} />
      </Field>

      <Field
        label="Next due"
        htmlFor="care-due"
        optional
        hint="Leave empty for a one-off. Anything due in the next 30 days shows on the barn's due-soon list."
      >
        <Input id="care-due" name="due_next" type="date" />
      </Field>

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Log care"}
      </Button>
    </form>
  );
}

/**
 * Notify the admins of everything due in the next 30 days.
 *
 * Deliberately a visible button, not something automatic: the cron is deferred,
 * and it reports the count it created so pressing it twice is obviously safe
 * rather than mysteriously silent.
 */
export function SendCareDigestButton() {
  const [state, formAction, pending] = useActionState(sendCareDigest, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" variant="primary" block disabled={pending} icon="bell">
        {pending ? "Sending…" : "Send due-soon reminders"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
