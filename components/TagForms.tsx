"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/Button";
import { FormFeedback, Input } from "@/components/ui/Field";
import { createTag, renameTag, type TagState } from "@/app/(app)/manage/tags/actions";

const EMPTY: TagState = { error: null, message: null };

/** A new tag, by name. Creating one opens it, ready to add people. */
export function NewTagForm() {
  const [state, action, pending] = useActionState(createTag, EMPTY);
  const id = useId();
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1.5 text-label font-medium text-ink">
          New tag
          <Input id={id} name="name" required maxLength={80} placeholder="Academy members" />
        </label>
        <Button type="submit" variant="primary" arrow={false} disabled={pending}>
          Create
        </Button>
      </div>
      <FormFeedback error={state.error} />
    </form>
  );
}

export function RenameTagForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(renameTag, EMPTY);
  const inputId = useId();
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={inputId} className="flex flex-col gap-1.5 text-label font-medium text-ink">
        Name
        <Input id={inputId} name="name" required maxLength={80} defaultValue={name} />
      </label>
      <Button type="submit" variant="primary" block disabled={pending}>
        Save
      </Button>
      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}
