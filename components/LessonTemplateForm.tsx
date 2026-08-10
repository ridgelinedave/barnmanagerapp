"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormFeedback } from "@/components/ui/Field";
import {
  createLessonTemplate,
  type TemplateState,
} from "@/app/(app)/manage/lesson-templates/actions";
import { WEEKDAY_NAMES } from "@/lib/dates";
import { barn } from "@/config/barn";

type Option = { id: string; name: string };

/**
 * The weekly-schedule wizard: one slot at a time, built once, then only
 * deviations are edited (SPEC §3.3). Durations come from the barn config
 * rather than being hard-coded here.
 */
export function LessonTemplateForm({
  instructors,
  levels,
}: {
  instructors: Option[];
  levels: Option[];
}) {
  const [state, formAction, pending] = useActionState<TemplateState, FormData>(
    createLessonTemplate,
    { error: null, message: null },
  );
  const [type, setType] = useState<"private" | "group">("private");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-weekday" className="text-label font-medium text-ink">
          Day
        </label>
        <select
          id="tpl-weekday"
          name="weekday"
          defaultValue="1"
          className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
        >
          {WEEKDAY_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-start" className="text-label font-medium text-ink">
          Start time
        </label>
        <input
          id="tpl-start"
          name="start_time"
          type="time"
          required
          className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium text-ink">Lesson type</legend>
        {(
          [
            ["private", "Private", `${barn.lessons.privateMin} minutes, one rider`],
            ["group", "Group", `${barn.lessons.groupMin} minutes, several riders`],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className="flex min-h-12 items-start gap-3 rounded-control border border-line bg-surface p-3"
          >
            <input
              type="radio"
              name="type"
              value={value}
              defaultChecked={value === "private"}
              onChange={() => setType(value)}
              className="mt-0.5 size-5 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="block text-body font-semibold text-ink">{label}</span>
              <span className="block text-caption text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-duration" className="text-label font-medium text-ink">
          Length
        </label>
        <select
          id="tpl-duration"
          name="duration_min"
          defaultValue={String(barn.lessons.privateMin)}
          className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
        >
          <option value={barn.lessons.privateMin}>{barn.lessons.privateMin} minutes</option>
          <option value={barn.lessons.groupMin}>{barn.lessons.groupMin} minutes</option>
        </select>
      </div>

      {/* Only meaningful for a group; a private is always one rider. */}
      {type === "group" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tpl-max" className="text-label font-medium text-ink">
            Maximum riders
          </label>
          <input
            id="tpl-max"
            name="max_riders"
            type="number"
            min={1}
            defaultValue={4}
            className="min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-instructor" className="text-label font-medium text-ink">
          Instructor
        </label>
        <select
          id="tpl-instructor"
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
        <label htmlFor="tpl-level" className="text-label font-medium text-ink">
          Level <span className="font-normal text-muted">(optional)</span>
        </label>
        <select
          id="tpl-level"
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
      </div>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Add to the weekly schedule"}
      </Button>
    </form>
  );
}
