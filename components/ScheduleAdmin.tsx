"use client";

import { useActionState } from "react";
import {
  generateInstances,
  bookRider,
  createOneOffInstance,
  type ScheduleState,
} from "@/app/(app)/schedule/actions";

const EMPTY: ScheduleState = { error: null, message: null };

type Option = { id: string; name: string };

function Feedback({ state }: { state: ScheduleState }) {
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
 * Materialise the next four weeks from the weekly templates.
 *
 * Visible and manual because the nightly cron is deferred. It reports the count
 * it created — a generation step that silently did nothing is indistinguishable
 * from a broken one.
 */
export function GenerateInstancesButton() {
  const [state, formAction, pending] = useActionState(generateInstances, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate the next 4 weeks"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function BookRiderForm({
  instanceId,
  riders,
}: {
  instanceId: string;
  riders: Option[];
}) {
  const [state, formAction, pending] = useActionState(bookRider, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="instance_id" value={instanceId} />
      <div className="flex items-center gap-2">
        <label htmlFor={`book-${instanceId}`} className="sr-only">
          Book a rider into this lesson
        </label>
        <select
          id={`book-${instanceId}`}
          name="rider_id"
          required
          defaultValue=""
          className="min-h-11 flex-1 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm"
        >
          <option value="" disabled>
            Add a rider…
          </option>
          {riders.map((rider) => (
            <option key={rider.id} value={rider.id}>
              {rider.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "…" : "Book"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function OneOffLessonForm({
  date,
  instructors,
  levels,
}: {
  date: string;
  instructors: Option[];
  /** Optional: a one-off with no level is open to any rider for backfill. */
  levels: Option[];
}) {
  const [state, formAction, pending] = useActionState(createOneOffInstance, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="date" value={date} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="oneoff-time" className="text-sm font-medium">
          Start time
        </label>
        <input
          id="oneoff-time"
          name="start_time"
          type="time"
          required
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="oneoff-type" className="text-sm font-medium">
            Type
          </label>
          <select
            id="oneoff-type"
            name="type"
            defaultValue="private"
            className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
          >
            <option value="private">Private</option>
            <option value="group">Group</option>
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="oneoff-duration" className="text-sm font-medium">
            Length
          </label>
          <select
            id="oneoff-duration"
            name="duration_min"
            defaultValue="45"
            className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
          >
            <option value="45">45 min</option>
            <option value="60">60 min</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="oneoff-instructor" className="text-sm font-medium">
          Instructor
        </label>
        <select
          id="oneoff-instructor"
          name="instructor_id"
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        >
          <option value="">Unassigned</option>
          {instructors.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="oneoff-level" className="text-sm font-medium">
          Level <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <select
          id="oneoff-level"
          name="level_id"
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        >
          <option value="">Any level</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-brand-ink/55">
          Limits who can be offered the spot if it opens up. Leave as Any to allow everyone.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="oneoff-max" className="text-sm font-medium">
          Maximum riders
        </label>
        <input
          id="oneoff-max"
          name="max_riders"
          type="number"
          min={1}
          defaultValue={1}
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        />
        <p className="text-xs text-brand-ink/55">Ignored for a private lesson, which is always one.</p>
      </div>

      <Feedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add a one-off lesson"}
      </button>
    </form>
  );
}
