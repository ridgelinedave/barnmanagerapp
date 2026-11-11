"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input, Select } from "@/components/ui/Field";
import { grantAccess, type GrantState } from "@/app/(app)/manage/academy-access/actions";

const EMPTY: GrantState = { error: null, message: null };
const ROLE = { parent: "Client", staff: "Staff", admin: "Admin" } as const;

/** Grant Academy access by hand: a person, an optional last day, a note. */
export function GrantAccessForm({ people }: { people: { profileId: string; name: string; role: keyof typeof ROLE }[] }) {
  const [state, action, pending] = useActionState(grantAccess, EMPTY);
  const id = useId();
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Who" htmlFor={`${id}-who`}>
        <Select id={`${id}-who`} name="profile_id" required defaultValue="">
          <option value="" disabled>
            Choose a person
          </option>
          {people.map((p) => (
            <option key={p.profileId} value={p.profileId}>
              {p.name} · {ROLE[p.role]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Last day" htmlFor={`${id}-ends`} optional hint="Access ends at the end of this day. Leave it empty for no end.">
        <Input id={`${id}-ends`} name="ends" type="date" />
      </Field>
      <Field label="Note" htmlFor={`${id}-note`} optional hint="Internal. They never see it.">
        <Input id={`${id}-note`} name="note" maxLength={500} placeholder="Paid through December" />
      </Field>
      <Button type="submit" variant="primary" block disabled={pending}>
        Grant access
      </Button>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}
