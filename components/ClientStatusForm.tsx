"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Select } from "@/components/ui/Field";
import { setClientStatus, type ClientStatusState } from "@/app/(app)/manage/clients/actions";

const EMPTY: ClientStatusState = { error: null, message: null };

/** Active / Inactive / On a break, for one client. Admin only. */
export function ClientStatusForm({ familyId, status }: { familyId: string; status: string }) {
  const [state, action, pending] = useActionState(setClientStatus, EMPTY);
  const id = useId();

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="family_id" value={familyId} />
      <Field label="Status" htmlFor={id} hint="Only active clients are booked into their recurring lessons.">
        <Select id={id} name="status" defaultValue={status}>
          <option value="active">Active</option>
          <option value="on_break">On a break</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving" : "Save"}
      </Button>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}
