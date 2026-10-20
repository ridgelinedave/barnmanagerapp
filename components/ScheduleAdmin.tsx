"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FormFeedback, Select } from "@/components/ui/Field";
import {
  generateInstances,
  bookRider,
  createOneOffInstance,
  type ScheduleState,
} from "@/app/(app)/schedule/actions";

const EMPTY: ScheduleState = { error: null, message: null };

type Option = { id: string; name: string };

function Feedback({ state }: { state: ScheduleState }) {
  return <FormFeedback error={state.error} message={state.message} />;
}

/**
 * Materialise the next four weeks from the weekly templates.
 *
 * Visible and manual because the nightly cron is deferred. It reports the count
 * it created — a generation step that silently did nothing is indistinguishable
 * from a broken one.
 *
 * The label says what it makes, not how. "Generate the next 4 weeks" named a
 * window and a mechanism and left out both the noun (lessons) and where they
 * come from, which is why it read as jargon on the day screen. It lives in the
 * admin overflow now, in the menu size — a sentence, not a shouted slab.
 */
export function GenerateInstancesButton() {
  const [state, formAction, pending] = useActionState(generateInstances, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Button type="submit" size="menu" block disabled={pending} icon="calendar">
        {pending ? "Generating lessons…" : "Generate lessons from the weekly schedule"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * Add a rider to this lesson — on the lesson itself, admin only.
 *
 * The list holds only riders who could actually take the seat: active, at the
 * lesson's level when it has one, and not already in it. A full lesson says so
 * and offers nothing. The server action re-checks every one of these against
 * fresh rows, so this list is a convenience, never the rule.
 */
export function BookRiderForm({
  instanceId,
  riders,
  openSeats,
}: {
  instanceId: string;
  /** Already filtered to riders eligible for this lesson. */
  riders: Option[];
  openSeats: number;
}) {
  const [state, formAction, pending] = useActionState(bookRider, EMPTY);
  const id = `book-${instanceId}`;

  if (openSeats <= 0) {
    return <p className="font-condensed text-label font-semibold uppercase tracking-[0.08em] text-muted">Full</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="instance_id" value={instanceId} />
      <label htmlFor={id} className="flex items-baseline gap-2 text-label font-medium text-ink">
        Add a rider
        <span className="font-condensed text-micro uppercase text-muted tabular-nums">
          {openSeats} {openSeats === 1 ? "seat" : "seats"} open
        </span>
      </label>
      {riders.length === 0 ? (
        <p className="text-caption text-muted">No eligible riders.</p>
      ) : (
        <div className="flex items-center gap-2">
          <Select id={id} name="rider_id" required defaultValue="" className="min-w-0 flex-1">
            <option value="" disabled>
              Choose a rider
            </option>
            {riders.map((rider) => (
              <option key={rider.id} value={rider.id}>
                {rider.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" arrow={false} disabled={pending}>
            {pending ? "Adding" : "Add"}
          </Button>
        </div>
      )}
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
        <label htmlFor="oneoff-time" className="text-label font-medium text-ink">
          Start time
        </label>
        <input
          id="oneoff-time"
          name="start_time"
          type="time"
          required
          className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="oneoff-type" className="text-label font-medium text-ink">
            Type
          </label>
          <select
            id="oneoff-type"
            name="type"
            defaultValue="private"
            className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
          >
            <option value="private">Private</option>
            <option value="group">Group</option>
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="oneoff-duration" className="text-label font-medium text-ink">
            Length
          </label>
          <select
            id="oneoff-duration"
            name="duration_min"
            defaultValue="45"
            className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
          >
            <option value="45">45 min</option>
            <option value="60">60 min</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="oneoff-instructor" className="text-label font-medium text-ink">
          Instructor
        </label>
        <select
          id="oneoff-instructor"
          name="instructor_id"
          className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
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
        <label htmlFor="oneoff-level" className="text-label font-medium text-ink">
          Level <span className="font-normal text-muted">(optional)</span>
        </label>
        <select
          id="oneoff-level"
          name="level_id"
          className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
        >
          <option value="">Any level</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </select>
        <p className="text-caption text-muted">
          Limits who can be offered the spot if it opens up. Leave as Any to allow everyone.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="oneoff-max" className="text-label font-medium text-ink">
          Maximum riders
        </label>
        <input
          id="oneoff-max"
          name="max_riders"
          type="number"
          min={1}
          defaultValue={1}
          className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
        />
        <p className="text-caption text-muted">Ignored for a private lesson, which is always one.</p>
      </div>

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Adding…" : "Add a one-off lesson"}
      </Button>
    </form>
  );
}
