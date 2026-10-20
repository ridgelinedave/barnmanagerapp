"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input, Select } from "@/components/ui/Field";
import {
  createEnrolment,
  endEnrolment,
  setOccurrenceHorse,
  type SeriesState,
} from "@/app/(app)/schedule/series-actions";

const EMPTY: SeriesState = { error: null, message: null };
type Option = { id: string; name: string };

/**
 * The horse for ONE occurrence, on the lesson card. Riders do not ride the
 * same horse every week; this changes this week and nothing else.
 */
export function OccurrenceHorseForm({
  bookingId,
  riderName,
  horseId,
  horses,
}: {
  bookingId: string;
  riderName: string;
  horseId: string | null;
  horses: Option[];
}) {
  const [state, action, pending] = useActionState(setOccurrenceHorse, EMPTY);
  const id = useId();

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="booking_id" value={bookingId} />
      <label htmlFor={id} className="text-label font-medium text-ink">
        {riderName}
      </label>
      <div className="flex items-center gap-2">
        <Select id={id} name="horse_id" defaultValue={horseId ?? ""} className="min-w-0 flex-1">
          <option value="">No horse set</option>
          {horses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" arrow={false} disabled={pending}>
          {pending ? "Saving" : "Set"}
        </Button>
      </div>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}

/** Enrol a rider in a weekly slot: weekly, every two weeks, or every N. */
export function EnrolForm({
  templateId,
  riders,
  horses,
  today,
}: {
  templateId: string;
  /** Already filtered: active, at the slot's level when it has one. */
  riders: Option[];
  horses: Option[];
  today: string;
}) {
  const [state, action, pending] = useActionState(createEnrolment, EMPTY);
  const [cadence, setCadence] = useState("1");
  const id = useId();

  if (riders.length === 0) return <p className="text-caption text-muted">No eligible riders.</p>;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="template_id" value={templateId} />

      <Field label="Rider" htmlFor={`${id}-rider`}>
        <Select id={`${id}-rider`} name="rider_id" required defaultValue="">
          <option value="" disabled>
            Choose a rider
          </option>
          {riders.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium text-ink">How often</legend>
        {[
          ["1", "Weekly"],
          ["2", "Every two weeks"],
          ["custom", "Every"],
        ].map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-3 text-body text-ink">
            <input
              type="radio"
              name="cadence"
              value={value}
              checked={cadence === value}
              onChange={() => setCadence(value)}
              className="size-5 accent-[var(--accent)]"
            />
            {label}
            {value === "custom" && (
              <>
                <Input
                  name="custom_weeks"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  defaultValue={3}
                  aria-label="Number of weeks"
                  disabled={cadence !== "custom"}
                  className="w-20"
                />
                weeks
              </>
            )}
          </label>
        ))}
      </fieldset>

      <Field label="Starting" htmlFor={`${id}-starts`} hint="The first lesson is the next slot on or after this date.">
        <Input id={`${id}-starts`} name="starts" type="date" defaultValue={today} min={today} />
      </Field>

      <Field label="Usual horse" htmlFor={`${id}-horse`} optional>
        <Select id={`${id}-horse`} name="horse_id" defaultValue="">
          <option value="">None</option>
          {horses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Enrolling" : "Enrol"}
      </Button>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}

/** End a series from a date. Later bookings it made are removed by the database. */
export function EndEnrolmentForm({ enrolmentId, today }: { enrolmentId: string; today: string }) {
  const [state, action, pending] = useActionState(endEnrolment, EMPTY);
  const id = useId();

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="enrolment_id" value={enrolmentId} />
      <Field label="Last lesson on or before" htmlFor={id} hint="Booked lessons after this date are removed.">
        <Input id={id} name="ends_on" type="date" defaultValue={today} min={today} />
      </Field>
      <Button type="submit" variant="danger" block disabled={pending}>
        {pending ? "Ending" : "End enrolment"}
      </Button>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}
