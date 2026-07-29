"use client";

import { useActionState } from "react";
import { saveFormAnswers, signForm, type FormState } from "@/app/(app)/more/forms/actions";
import { fieldsOf, type FormSubmission, type FormTemplate } from "@/lib/types";

const EMPTY: FormState = { error: null, message: null };

const FIELD = "min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base";

function Feedback({ state }: { state: FormState }) {
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

function Field({
  field,
  value,
}: {
  field: ReturnType<typeof fieldsOf>[number];
  value: unknown;
}) {
  const id = `field-${field.key}`;
  const name = `field_${field.key}`;
  const label = (
    <label htmlFor={id} className="text-sm font-medium">
      {field.label}
      {!field.required && <span className="font-normal text-brand-ink/50"> (optional)</span>}
    </label>
  );

  if (field.type === "checkbox") {
    return (
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-brand-ink/20 bg-white px-3">
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={value === true}
          className="size-5 accent-brand-gold-deep"
        />
        <span className="text-base">{field.label}</span>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="flex flex-col gap-1.5">
        {label}
        <textarea
          id={id}
          name={name}
          rows={3}
          defaultValue={String(value ?? "")}
          className="rounded-xl border border-brand-ink/20 bg-white p-3 text-base"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      <input
        id={id}
        name={name}
        type={field.type === "date" ? "date" : "text"}
        defaultValue={String(value ?? "")}
        className={FIELD}
      />
    </div>
  );
}

/**
 * Fill in and sign one form.
 *
 * Two submit buttons on one set of fields, because "save and come back later"
 * and "sign this" are genuinely different decisions and a family should never
 * discover they have signed something by pressing the only button on screen.
 * Signing is the heavier one and asks for the name in the same step.
 *
 * A signed form renders read-only: the database refuses further edits from the
 * family, so offering the fields would be offering something that cannot work.
 */
export function FormFill({
  submission,
  template,
}: {
  submission: FormSubmission;
  template: FormTemplate;
}) {
  const [saveState, saveAction, saving] = useActionState(saveFormAnswers, EMPTY);
  const [signState, signAction, signing] = useActionState(signForm, EMPTY);
  const fields = fieldsOf(template.schema);
  const answers = submission.data ?? {};

  if (submission.status === "complete") {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-2xl bg-green-50 p-4 text-sm text-green-900">
          Signed by {submission.signed_name}. A copy is on file with the barn — ask them if
          anything needs changing.
        </p>

        <dl className="flex flex-col gap-2 rounded-2xl border border-brand-ink/10 bg-white p-4 text-sm">
          {fields.map((field) => (
            <div key={field.key} className="flex flex-col">
              <dt className="text-brand-ink/60">{field.label}</dt>
              <dd className="break-words">
                {field.type === "checkbox"
                  ? answers[field.key] === true
                    ? "Yes"
                    : "No"
                  : String(answers[field.key] ?? "—")}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  // ONE set of fields, two submit buttons pointing at two different server
  // actions. Rendering the fields twice — once to save, once to sign — would
  // duplicate every input id on the page and quietly break label association,
  // which on a phone means tapping a label focuses the wrong box.
  return (
    <form action={saveAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={submission.id} />

      {fields.map((field) => (
        <Field key={field.key} field={field} value={answers[field.key]} />
      ))}

      <button
        type="submit"
        disabled={saving || signing}
        className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-4 text-base font-semibold disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save for later"}
      </button>

      <Feedback state={saveState} />

      <section className="mt-3 flex flex-col gap-3 rounded-2xl border border-brand-ink/15 bg-white p-4">
        <h2 className="text-base font-semibold">Sign</h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="signed_name" className="text-sm font-medium">
            Type your full name
          </label>
          <input id="signed_name" name="signed_name" className={FIELD} />
          <p className="text-xs text-brand-ink/55">
            This is your signature. Once signed, only the barn can change it.
          </p>
        </div>

        <Feedback state={signState} />

        {/* Signing submits the same fields, so what is signed is always what is
            on screen — never a half-saved earlier version. */}
        <button
          type="submit"
          formAction={signAction}
          disabled={saving || signing}
          className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
        >
          {signing ? "Signing…" : "Sign and submit"}
        </button>
      </section>
    </form>
  );
}
