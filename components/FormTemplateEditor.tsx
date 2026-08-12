"use client";

import { useActionState, useId, useState } from "react";
import { saveTemplate, type TemplateState } from "@/app/(app)/manage/forms/actions";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input, Select, Textarea } from "@/components/ui/Field";
import { Sunk } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import {
  fieldsOf,
  FORM_FIELD_TYPES,
  FORM_FIELD_TYPE_LABELS,
  type FormField,
  type FormFieldType,
  type FormTemplate,
} from "@/lib/types";

const EMPTY: TemplateState = { error: null, message: null };

/**
 * Author a form.
 *
 * The field list is held in React state and submitted as ONE JSON string,
 * rather than as a spray of indexed inputs. Reordering a form built out of
 * `field[0][label]`-style names means renaming every input on every move, and
 * that is precisely where an off-by-one loses somebody's field.
 *
 * The server re-validates the JSON rather than trusting it — see parseSchema in
 * the action. A field that fails validation is refused with a reason, because
 * the renderer silently DROPS malformed fields and a form that saves happily
 * and then shows nothing is the worst kind of bug.
 */
function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  );
}

function FieldEditor({
  field,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  field: FormField;
  index: number;
  count: number;
  onChange: (patch: Partial<FormField>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const id = useId();

  return (
    <Sunk className="flex flex-col gap-2.5">
      <div>
        <label htmlFor={`${id}-label`} className="text-label font-medium text-ink">
          Question
        </label>
        <Input
          id={`${id}-label`}
          value={field.label}
          onChange={(event) => {
            const label = event.target.value;
            // The key follows the label until someone edits the key directly,
            // so the common case needs no thought and the rare one is still
            // possible.
            onChange(
              field.key === slugify(field.label) || !field.key
                ? { label, key: slugify(label) }
                : { label },
            );
          }}
          placeholder="Emergency contact name"
          className="mt-1.5"
        />
      </div>

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-type`} className="text-label font-medium text-ink">
            Answer type
          </label>
          <Select
            id={`${id}-type`}
            value={field.type}
            onChange={(event) => onChange({ type: event.target.value as FormFieldType })}
            className="mt-1.5"
          >
            {FORM_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {FORM_FIELD_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-32 shrink-0">
          <label htmlFor={`${id}-key`} className="text-label font-medium text-ink">
            Saved as
          </label>
          <Input
            id={`${id}-key`}
            value={field.key}
            onChange={(event) => onChange({ key: slugify(event.target.value) })}
            className="mt-1.5"
          />
        </div>
      </div>

      <label className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3">
        <input
          type="checkbox"
          checked={Boolean(field.required)}
          onChange={(event) => onChange({ required: event.target.checked })}
          className="size-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-body text-ink">Must be answered</span>
      </label>

      {/* Reorder and remove on one row, every target 44px. Up/down rather than
          drag: this is a phone, and a drag target has no keyboard equivalent.
          These were 32px in the first draft — measured, and fixed. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`Move ${field.label || "field"} up`}
          className="flex size-11 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink disabled:opacity-30"
        >
          <Icon name="chevron" className="size-4 -rotate-90" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label={`Move ${field.label || "field"} down`}
          className="flex size-11 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink disabled:opacity-30"
        >
          <Icon name="chevron" className="size-4 rotate-90" strokeWidth={2} />
        </button>

        <span className="flex-1" />

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${field.label || "field"}`}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border border-danger/35 px-3 text-caption font-semibold text-danger"
        >
          <Icon name="plus" className="size-4 rotate-45" strokeWidth={2} />
          Remove
        </button>
      </div>
    </Sunk>
  );
}

export function FormTemplateEditor({ template }: { template?: FormTemplate }) {
  const [state, formAction, pending] = useActionState(saveTemplate, EMPTY);
  const [fields, setFields] = useState<FormField[]>(() =>
    template ? fieldsOf(template.schema) : [],
  );
  const id = useId();

  function patch(index: number, next: Partial<FormField>) {
    setFields((current) => current.map((f, i) => (i === index ? { ...f, ...next } : f)));
  }

  function move(index: number, delta: number) {
    setFields((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {template && <input type="hidden" name="id" value={template.id} />}
      {/* The whole field list, as one value. */}
      <input type="hidden" name="schema" value={JSON.stringify(fields)} />

      <Field label="Form name" htmlFor={`${id}-name`}>
        <Input id={`${id}-name`} name="name" required defaultValue={template?.name ?? ""} />
      </Field>

      <Field
        label="What it is for"
        htmlFor={`${id}-description`}
        optional
        hint="One line. Families see this above the form."
      >
        <Textarea
          id={`${id}-description`}
          name="description"
          rows={2}
          defaultValue={template?.description ?? ""}
        />
      </Field>

      <Field
        label="Who fills it in"
        htmlFor={`${id}-applies`}
        hint="Per rider means one copy for each rider in the family."
      >
        <Select
          id={`${id}-applies`}
          name="applies_to"
          defaultValue={template?.applies_to ?? "family"}
        >
          <option value="family">One per family</option>
          <option value="rider">One per rider</option>
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <label className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3">
          <input
            type="checkbox"
            name="required"
            defaultChecked={template?.required ?? true}
            className="size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-body text-ink">Required — goes on every new family&apos;s list</span>
        </label>

        <label className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3">
          <input
            type="checkbox"
            name="active"
            defaultChecked={template?.active ?? true}
            className="size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-body text-ink">In use</span>
        </label>
      </div>

      {/* --- the field list ------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-heading text-ink">Questions</h3>
          <p className="text-caption text-muted">
            {fields.length === 0 ? "None yet" : `${fields.length}`}
          </p>
        </div>

        {fields.length === 0 && (
          <p className="text-caption text-muted">
            A form with no questions is still a signature — add questions if you need answers too.
          </p>
        )}

        {fields.map((field, index) => (
          <FieldEditor
            key={index}
            field={field}
            index={index}
            count={fields.length}
            onChange={(next) => patch(index, next)}
            onMove={(delta) => move(index, delta)}
            onRemove={() => setFields((current) => current.filter((_, i) => i !== index))}
          />
        ))}

        <Button
          type="button"
          variant="secondary"
          block
          arrow={false}
          icon="plus"
          onClick={() =>
            setFields((current) => [...current, { key: "", label: "", type: "text", required: false }])
          }
        >
          Add a question
        </Button>
      </div>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : template ? "Save form" : "Create form"}
      </Button>
    </form>
  );
}
