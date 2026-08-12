"use client";

import { useActionState, useId, useState } from "react";
import { issueTemplate, type TemplateState } from "@/app/(app)/manage/forms/actions";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Select } from "@/components/ui/Field";
import { Callout } from "@/components/ui/primitives";
import type { Family, FormTemplate } from "@/lib/types";

const EMPTY: TemplateState = { error: null, message: null };

/**
 * Issue a form to families.
 *
 * "Everyone" is a tick rather than an empty selection meaning all. Sending a
 * waiver to the whole barn because nobody was chosen is the wrong direction for
 * a mistake to fall, and an explicit tick is one extra thought at exactly the
 * moment thought is worth having.
 *
 * Pressing this twice is harmless: `form_submissions_one_per_scope` absorbs the
 * duplicates, and the action reports what actually changed rather than what it
 * attempted.
 */
export function FormIssuer({
  templates,
  families,
  defaultTemplateId,
}: {
  templates: FormTemplate[];
  families: Family[];
  defaultTemplateId?: string;
}) {
  const [state, formAction, pending] = useActionState(issueTemplate, EMPTY);
  const [everyone, setEveryone] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const id = useId();

  const active = templates.filter((template) => template.active);

  if (active.length === 0) {
    return (
      <p className="text-caption text-muted">
        No forms are switched on. Create one, or turn one back on, before issuing it.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Which form" htmlFor={`${id}-template`}>
        <Select id={`${id}-template`} name="template_id" defaultValue={defaultTemplateId ?? ""}>
          {active.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
              {template.applies_to === "rider" ? " (per rider)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <p className="text-label font-medium text-ink">Who gets it</p>

        <label className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3">
          <input
            type="checkbox"
            name="everyone"
            checked={everyone}
            onChange={(event) => setEveryone(event.target.checked)}
            className="size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-body text-ink">Every family</span>
        </label>

        {everyone ? (
          <Callout tone="gold" icon="alert">
            This goes to all {families.length} families. Anyone who already has it is skipped.
          </Callout>
        ) : (
          <div className="flex flex-col gap-2">
            {families.map((family) => (
              <label
                key={family.id}
                className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3"
              >
                <input
                  type="checkbox"
                  name="family_id"
                  value={family.id}
                  checked={chosen.has(family.id)}
                  onChange={(event) =>
                    setChosen((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(family.id);
                      else next.delete(family.id);
                      return next;
                    })
                  }
                  className="size-5 shrink-0 accent-[var(--accent)]"
                />
                <span className="text-body text-ink">{family.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <FormFeedback error={state.error} message={state.message} />

      <Button
        type="submit"
        variant="primary"
        block
        disabled={pending || (!everyone && chosen.size === 0)}
      >
        {pending
          ? "Issuing…"
          : everyone
            ? "Issue to every family"
            : chosen.size === 0
              ? "Choose who gets it"
              : `Issue to ${chosen.size} famil${chosen.size === 1 ? "y" : "ies"}`}
      </Button>
    </form>
  );
}
