"use client";

import { useActionState } from "react";
import { FormFeedback } from "@/components/ui/Field";
import { PhotoUpload } from "@/components/PhotoUpload";
import type { PhotoState } from "@/app/(app)/media-actions";

const EMPTY: PhotoState = { error: null, message: null };

/**
 * PhotoUpload on an EXISTING record: confirming the crop submits straight to
 * `action` with the record's id. For a record being created, put PhotoUpload
 * itself inside the create form instead, so the photo is saved with it.
 */
export function PhotoUploadForm({
  action,
  fields,
  displayName,
  src,
  label,
  size,
}: {
  action: (prev: PhotoState, formData: FormData) => Promise<PhotoState>;
  fields: Record<string, string>;
  displayName: string;
  src?: string | null;
  label: string;
  size?: "md" | "lg" | "xl";
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1" aria-busy={pending}>
      {Object.entries(fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <PhotoUpload displayName={displayName} src={src} label={label} size={size} autoSubmit />
      {pending && <p className="font-condensed text-label text-muted">Saving photo</p>}
      <FormFeedback error={state.error} message={null} />
    </form>
  );
}
