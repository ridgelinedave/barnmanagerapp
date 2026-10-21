"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckRow, Field, FormFeedback, Input, Select, Textarea } from "@/components/ui/Field";
import { PhotoUpload } from "@/components/PhotoUpload";
import { createCourse, updateCourse, type CourseState } from "@/app/(app)/lessons/learn/course-actions";

const EMPTY: CourseState = { error: null, message: null };

/**
 * Create or edit a course: title, description, a 16:9 cover (the photo
 * control's crop step in its wide mode), categories and audience — in ONE
 * form, so a new course is complete the first time it is saved. A new course
 * starts as a draft.
 */
export function CourseForm({
  course,
  coverSrc,
  categories,
  levels,
}: {
  course?: {
    id: string;
    title: string;
    description: string;
    audience: "all" | "level";
    audienceLevelId: string | null;
    categoryIds: string[];
  };
  coverSrc?: string | null;
  categories: { id: string; name: string }[];
  levels: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(course ? updateCourse : createCourse, EMPTY);
  const [audience, setAudience] = useState<"all" | "level">(course?.audience ?? "all");
  const id = useId();

  return (
    <form action={action} className="flex flex-col gap-4">
      {course && <input type="hidden" name="id" value={course.id} />}

      <PhotoUpload name="cover" aspect="wide" displayName="" label="Course cover" src={coverSrc ?? null} />

      <Field label="Title" htmlFor={`${id}-title`}>
        <Input id={`${id}-title`} name="title" required maxLength={200} defaultValue={course?.title ?? ""} />
      </Field>

      <Field label="Description" htmlFor={`${id}-description`} optional>
        <Textarea id={`${id}-description`} name="description" rows={4} defaultValue={course?.description ?? ""} />
      </Field>

      {categories.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 text-label font-medium text-ink">Categories</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {categories.map((cat) => (
              <CheckRow
                key={cat.id}
                label={cat.name}
                name="category_id"
                value={cat.id}
                defaultChecked={course?.categoryIds.includes(cat.id) ?? false}
              />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1 text-label font-medium text-ink">Who sees it</legend>
        <label className="flex min-h-11 items-center gap-3 text-body text-ink">
          <input
            type="radio"
            name="audience"
            value="all"
            checked={audience === "all"}
            onChange={() => setAudience("all")}
            className="size-5 accent-[var(--accent)]"
          />
          Every member
        </label>
        <label className="flex min-h-11 items-center gap-3 text-body text-ink">
          <input
            type="radio"
            name="audience"
            value="level"
            checked={audience === "level"}
            onChange={() => setAudience("level")}
            className="size-5 accent-[var(--accent)]"
          />
          One level
        </label>
        {audience === "level" && (
          <Select
            name="audience_level_id"
            aria-label="Level"
            required
            defaultValue={course?.audienceLevelId ?? ""}
          >
            <option value="" disabled>
              Choose a level
            </option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </Select>
        )}
      </fieldset>

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving" : course ? "Save" : "Create draft"}
      </Button>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}
