"use client";

import { useActionState } from "react";
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="doc-file" className="text-sm font-medium">
          Add a document
        </label>
        <input
          id="doc-file"
          name="file"
          type="file"
          required
          className="min-h-12 rounded-xl border border-brand-ink/20 bg-white p-2.5 text-sm file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-brand-gold file:px-3 file:text-sm file:font-semibold file:text-brand-ink"
        />
        <p className="text-xs text-brand-ink/55">
          Coggins, registration papers, vet reports. The owning family can read these; nobody
          else can.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
