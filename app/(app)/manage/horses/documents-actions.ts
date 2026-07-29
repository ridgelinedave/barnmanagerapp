"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { DOCUMENTS_BUCKET, horseFolder, safeFileName } from "@/lib/documents";

/**
 * Uploads and deletions for the documents vault.
 *
 * The barn writes; families only ever read. That is enforced by the Storage
 * policies in migration 0012 — the role check here produces a readable message
 * rather than a raw storage error, and the path is built by the helper so an
 * upload cannot be steered into another horse's folder by its filename.
 */
export type DocumentState = { error: string | null; message: string | null };

async function requireBarn() {
  const state = await getViewer();
  if (state.status !== "viewer") return null;
  const { role } = state.viewer;
  if (role !== "admin" && role !== "staff") return null;
  return state.viewer;
}

function revalidate(horseId: string) {
  revalidatePath(`/manage/horses/${horseId}`);
  revalidatePath(`/more/horses/${horseId}`);
}

export async function uploadHorseDocument(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  if (!(await requireBarn())) {
    return { error: "Only the barn can add documents.", message: null };
  }

  const horseId = String(formData.get("horse_id") ?? "");
  const file = formData.get("file");

  if (!horseId) return { error: "Missing horse.", message: null };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload.", message: null };
  }

  const path = `${horseFolder(horseId)}/${safeFileName(file.name)}`;

  const supabase = await createClient();
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    // Deliberately NOT an upsert: silently replacing a Coggins certificate
    // with a file of the same name is how the wrong document ends up in the
    // vault with nobody noticing.
    upsert: false,
  });

  if (error) {
    if (/exists/i.test(error.message)) {
      return { error: "A document with that filename is already on this horse.", message: null };
    }
    return { error: error.message, message: null };
  }

  revalidate(horseId);
  return { error: null, message: "Uploaded." };
}

export async function deleteHorseDocument(formData: FormData): Promise<void> {
  if (!(await requireBarn())) return;

  const horseId = String(formData.get("horse_id") ?? "");
  const path = String(formData.get("path") ?? "");
  if (!horseId || !path) return;

  // Belt and braces: only ever delete inside this horse's folder, whatever the
  // form said.
  if (!path.startsWith(`${horseFolder(horseId)}/`)) return;

  const supabase = await createClient();
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);

  revalidate(horseId);
}
