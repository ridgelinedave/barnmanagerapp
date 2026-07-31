"use client";

import { useActionState } from "react";
import { Card, Callout } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { CheckRow, Field, FormFeedback, Input, Textarea } from "@/components/ui/Field";
import { saveFormAnswers, signForm, type FormState } from "@/app/(app)/more/forms/actions";
import { fieldsOf, type FormSubmission, type FormTemplate } from "@/lib/types";

const EMPTY: FormState = { error: null, message: null };

function Feedback({ state }: { state: FormState }) {
  return <FormFeedback error={state.error} message={state.message} />;
}

/** One field from the template's jsonb schema, rendered as the right control. */
function SchemaField({
  field,
  value,
}: {
  field: ReturnType<typeof fieldsOf>[number];
  value: unknown;
}) {
  const id = `field-${field.key}`;
  const name = `field_${field.key}`;

  if (field.type === "checkbox") {
    return (
      <CheckRow id={id} name={name} label={field.label} defaultChecked={value === true} />
    );
  }

  if (field.type === "textarea") {
    return (
      <Field label={field.label} htmlFor={id} optional={!field.required}>
        <Textarea id={id} name={name} rows={3} defaultValue={String(value ?? "")} />
      </Field>
    );
  }

  return (
    <Field label={field.label} htmlFor={id} optional={!field.required}>
      <Input
        id={id}
        name={name}
        type={field.type === "date" ? "date" : "text"}
        defaultValue={String(value ?? "")}
      />
    </Field>
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
        <Callout tone="forest" icon="check">
          Signed by {submission.signed_name}. A copy is on file with the barn — ask them if
          anything needs changing.
        </Callout>

        <Card className="p-4">
          <dl className="flex flex-col gap-2 text-caption">
            {fields.map((field) => (
              <div key={field.key} className="flex flex-col">
                <dt className="text-muted">{field.label}</dt>
                <dd className="break-words text-ink">
                  {field.type === "checkbox"
                    ? answers[field.key] === true
                      ? "Yes"
                      : "No"
                    : String(answers[field.key] ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
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
        <SchemaField key={field.key} field={field} value={answers[field.key]} />
      ))}

      <Button type="submit" variant="secondary" block disabled={saving || signing}>
        {saving ? "Saving…" : "Save for later"}
      </Button>

      <Feedback state={saveState} />

      <Card className="mt-3 flex flex-col gap-3 p-4">
        <h2 className="font-display text-heading text-ink">Sign</h2>

        <Field
          label="Type your full name"
          htmlFor="signed_name"
          hint="This is your signature. Once signed, only the barn can change it."
        >
          <Input id="signed_name" name="signed_name" autoComplete="name" />
        </Field>

        <Feedback state={signState} />

        {/* Signing submits the same fields, so what is signed is always what is
            on screen — never a half-saved earlier version. */}
        <Button
          type="submit"
          formAction={signAction}
          variant="primary"
          block
          disabled={saving || signing}
        >
          {signing ? "Signing…" : "Sign and submit"}
        </Button>
      </Card>
    </form>
  );
}
