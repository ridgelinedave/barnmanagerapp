"use client";

import { useActionState } from "react";
import { createEvent, type EventState } from "@/app/(app)/manage/events/actions";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/types";

const EMPTY: EventState = { error: null, message: null };

const FIELD = "min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base";

/**
 * Add something to the barn calendar.
 *
 * The visibility control is a two-option select rather than a checkbox, and it
 * spells out the consequence: "staff only" decides whether a vet visit lands on
 * forty families' phones, and a checkbox labelled "internal" is too easy to
 * leave in the wrong state.
 */
export function EventForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState(createEvent, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-title" className="text-sm font-medium">
          What is it
        </label>
        <input id="event-title" name="title" required className={FIELD} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-type" className="text-sm font-medium">
          Kind
        </label>
        <select id="event-type" name="type" defaultValue="clinic" className={FIELD}>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {EVENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-start-date" className="text-sm font-medium">
          Starts
        </label>
        <input
          id="event-start-date"
          name="start_date"
          type="date"
          required
          defaultValue={today}
          className={FIELD}
        />
        <input
          id="event-start-time"
          name="start_time"
          type="time"
          aria-label="Start time"
          defaultValue="09:00"
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-end-date" className="text-sm font-medium">
          Ends <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <input id="event-end-date" name="end_date" type="date" className={FIELD} />
        <input
          id="event-end-time"
          name="end_time"
          type="time"
          aria-label="End time"
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-location" className="text-sm font-medium">
          Where <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <input id="event-location" name="location" className={FIELD} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-description" className="text-sm font-medium">
          Details <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <textarea
          id="event-description"
          name="description"
          rows={2}
          className="rounded-xl border border-brand-ink/20 bg-white p-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-visibility" className="text-sm font-medium">
          Who sees it
        </label>
        <select id="event-visibility" name="visibility" defaultValue="all" className={FIELD}>
          <option value="all">Everyone — families and staff</option>
          <option value="staff">Staff only — internal</option>
        </select>
        <p className="text-xs text-brand-ink/55">
          Anything set to &ldquo;everyone&rdquo; appears on subscribed family calendars.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add to calendar"}
      </button>
    </form>
  );
}
