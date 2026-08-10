"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback } from "@/components/ui/Field";
import {
  uploadHorseDocument,
  type DocumentState,
} from "@/app/(app)/manage/horses/documents-actions";

const EMPTY: DocumentState = { error: null, message: null };

/**
 * Upload a document to a horse's folder.
 *
 * A plain file input rather than a drag-and-drop zone: this is used one-handed
 * on a phone, where "choose file" opens the camera roll or the scanner app and
 * a drop target is useless.
 */
export function DocumentUploadForm({ horseId }: { horseId: string }) {
  const [state, formAction, pending] = useActionState(uploadHorseDocument, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="horse_id" value={horseId} />

      <Field
        label="Add a document"
        htmlFor="doc-file"
        hint="Coggins, registration papers, vet reports. The owning family can read these; nobody else can."
      >
        <input
          id="doc-file"
          name="file"
          type="file"
          required
          className="min-h-12 w-full rounded-control border border-line bg-surface p-2.5 text-caption text-ink file:mr-3 file:min-h-9 file:rounded-[0.5rem] file:border-0 file:bg-accent file:px-3 file:text-label file:font-semibold file:text-ink"
        />
      </Field>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending} icon="plus">
        {pending ? "Uploading…" : "Upload"}
      </Button>
    </form>
  );
}
