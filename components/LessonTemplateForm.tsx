"use client";

import { useActionState, useState } from "react";
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
        <label htmlFor="tpl-weekday" className="text-sm font-medium">
          Day
        </label>
        <select
          id="tpl-weekday"
          name="weekday"
          defaultValue="1"
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        >
          {WEEKDAY_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-start" className="text-sm font-medium">
          Start time
        </label>
        <input
          id="tpl-start"
          name="start_time"
          type="time"
          required
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Lesson type</legend>
        {(
          [
            ["private", "Private", `${barn.lessons.privateMin} minutes, one rider`],
            ["group", "Group", `${barn.lessons.groupMin} minutes, several riders`],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className="flex min-h-12 items-start gap-3 rounded-xl border border-brand-ink/20 bg-white p-3"
          >
            <input
              type="radio"
              name="type"
              value={value}
              defaultChecked={value === "private"}
              onChange={() => setType(value)}
              className="mt-1 size-5 accent-[var(--brand-gold)]"
            />
            <span>
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block text-xs text-brand-ink/60">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-duration" className="text-sm font-medium">
          Length
        </label>
        <select
          id="tpl-duration"
          name="duration_min"
          defaultValue={String(barn.lessons.privateMin)}
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
        >
          <option value={barn.lessons.privateMin}>{barn.lessons.privateMin} minutes</option>
          <option value={barn.lessons.groupMin}>{barn.lessons.groupMin} minutes</option>
        </select>
      </div>

      {/* Only meaningful for a group; a private is always one rider. */}
      {type === "group" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tpl-max" className="text-sm font-medium">
            Maximum riders
          </label>
          <input
            id="tpl-max"
            name="max_riders"
            type="number"
            min={1}
            defaultValue={4}
            className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-instructor" className="text-sm font-medium">
          Instructor
        </label>
        <select
          id="tpl-instructor"
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
        <label htmlFor="tpl-level" className="text-sm font-medium">
          Level <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <select
          id="tpl-level"
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
        {pending ? "Saving…" : "Add to the weekly schedule"}
      </button>
    </form>
  );
}
