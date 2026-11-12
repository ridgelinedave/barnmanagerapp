"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormFeedback, Input } from "@/components/ui/Field";
import { setLessonsEnd } from "@/app/(app)/manage/team/actions";

type State = { error: string | null; message: string | null };
const EMPTY: State = { error: null, message: null };

const long = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

/**
 * "Lessons end" on a rider's card (0032). Belle records a student leaving by
 * setting the date their lessons end — today + the barn's notice period by
 * default (30 days), editable. The Academy is included with lessons, so the
 * line underneath says, in plain words, when their Academy access ends.
 *
 * `endDay` is the last day already set (YYYY-MM-DD, barn time), or null.
 */
export function LessonsEndForm({
  riderId,
  riderName,
  endDay,
  defaultDay,
  todayDay,
}: {
  riderId: string;
  riderName: string;
  endDay: string | null;
  /** Today + the notice period — what a new end date starts at. */
  defaultDay: string;
  todayDay: string;
}) {
  const [state, action, pending] = useActionState(setLessonsEnd, EMPTY);
  // Editing lasts until THIS edit's save succeeds: opening records the action
  // state it was opened on; a new state with no error (a save) closes it, an
  // error keeps it open with the message. Derived, so no effect is needed.
  const [openedOn, setOpenedOn] = useState<State | null>(null);
  const editing = openedOn !== null && (openedOn === state || state.error !== null);
  const id = useId();
  const passed = endDay !== null && endDay < todayDay;

  const line =
    endDay === null
      ? `${riderName} has the Academy while they take lessons.`
      : passed
        ? `Lessons ended ${long(endDay)}. Their Academy access has ended.`
        : `Lessons end ${long(endDay)}. Academy access ends at the end of that day.`;

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-caption text-ink">{line}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" arrow={false} onClick={() => setOpenedOn(state)}>
            {endDay ? "Change lessons end" : "Set lessons end"}
          </Button>
          {endDay && (
            <form action={action}>
              <input type="hidden" name="rider_id" value={riderId} />
              <input type="hidden" name="clear" value="1" />
              <Button type="submit" variant="ghost" arrow={false} disabled={pending}>
                Clear
              </Button>
            </form>
          )}
        </div>
        <FormFeedback error={state.error} message={state.message} />
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="rider_id" value={riderId} />
      <label htmlFor={id} className="text-label font-medium text-ink">
        Lessons end
      </label>
      <Input id={id} name="lessons_end" type="date" required defaultValue={endDay ?? defaultDay} min={todayDay} />
      <p className="text-caption text-muted">Their Academy access ends at the end of this day.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" arrow={false} disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" arrow={false} onClick={() => setOpenedOn(null)}>
          Cancel
        </Button>
      </div>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}
