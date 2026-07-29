"use client";

import { useActionState } from "react";
import { logCareEvent, sendCareDigest, type CareState } from "@/app/(app)/manage/care/actions";
import { CARE_TYPES, CARE_TYPE_LABELS } from "@/lib/types";

const EMPTY: CareState = { error: null, message: null };

const FIELD = "min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base";
const SUBMIT =
  "min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60";

function Feedback({ state }: { state: CareState }) {
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="care-type" className="text-sm font-medium">
          What was done
        </label>
        <select id="care-type" name="type" defaultValue="farrier" className={FIELD}>
          {CARE_TYPES.map((type) => (
            <option key={type} value={type}>
              {CARE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="care-description" className="text-sm font-medium">
          Details <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <textarea
          id="care-description"
          name="description"
          rows={2}
          placeholder="Reset front shoes. Slight bruise on the near fore."
          className="rounded-xl border border-brand-ink/20 bg-white p-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="care-performed" className="text-sm font-medium">
          When
        </label>
        <input
          id="care-performed"
          name="performed_at"
          type="date"
          required
          defaultValue={today}
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="care-due" className="text-sm font-medium">
          Next due <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <input id="care-due" name="due_next" type="date" className={FIELD} />
        <p className="text-xs text-brand-ink/55">
          Leave empty for a one-off. Anything due in the next 30 days shows on the barn&apos;s
          due-soon list.
        </p>
      </div>

      <Feedback state={state} />

      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending ? "Saving…" : "Log care"}
      </button>
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
      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending ? "Sending…" : "Send due-soon reminders"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
