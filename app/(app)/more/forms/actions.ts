"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/session";
import { DOCUMENTS_BUCKET, familyFolder, safeFileName } from "@/lib/documents";
import { renderPdf, type PdfLine } from "@/lib/pdf";
import { barn } from "@/config/barn";
import { fieldsOf, type FormSubmission, type FormTemplate } from "@/lib/types";

/**
 * Filling in and signing an onboarding form.
 *
 * The security here is in the database, not in this file: the row policy
 * decides which submissions the caller can touch and the guard trigger decides
 * what a permitted update may change — including refusing to mark anything
 * complete without a signature, and setting `signed_at` itself. These functions
 * cannot grant anything the policies would not.
 */
export type FormState = { error: string | null; message: string | null };

async function requireParent() {
  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "parent") return null;
  return state.viewer;
}

/** Collect the answers for a template's declared fields, and nothing else. */
function answersFrom(formData: FormData, template: FormTemplate): Record<string, unknown> {
  const answers: Record<string, unknown> = {};

  for (const field of fieldsOf(template.schema)) {
    const raw = formData.get(`field_${field.key}`);
    answers[field.key] = field.type === "checkbox" ? raw === "on" : String(raw ?? "").trim();
  }

  return answers;
}

function missingRequired(answers: Record<string, unknown>, template: FormTemplate): string | null {
  for (const field of fieldsOf(template.schema)) {
    if (!field.required) continue;
    const value = answers[field.key];
    if (field.type === "checkbox" ? value !== true : String(value ?? "").length === 0) {
      return field.label;
    }
  }
  return null;
}

export async function saveFormAnswers(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireParent())) return { error: "Only a parent can fill in this form.", message: null };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing form.", message: null };

  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle<FormSubmission>();
  if (!submission) return { error: "That form is not available.", message: null };

  const { data: template } = await supabase
    .from("form_templates")
    .select("*")
    .eq("id", submission.template_id)
    .maybeSingle<FormTemplate>();
  if (!template) return { error: "That form is not available.", message: null };

  const { error } = await supabase
    .from("form_submissions")
    .update({ data: answersFrom(formData, template) })
    .eq("id", id);

  if (error) return { error: error.message, message: null };

  revalidatePath("/more/forms");
  revalidatePath(`/more/forms/${id}`);
  return { error: null, message: "Saved. You can come back and finish later." };
}

/**
 * Sign and complete a form, then write the signed PDF to the vault.
 *
 * TWO CLIENTS, ON PURPOSE:
 *
 *  - the SIGNING runs on the parent's own session, so the row policy and the
 *    guard trigger are the things that decide whether it is allowed. If this
 *    ran as the service role it would bypass exactly the rules that make a
 *    signature mean anything.
 *  - the PDF UPLOAD runs as the service role, because families deliberately
 *    have no write access to the documents bucket (migration 0012) — a document
 *    a family can write is a document the barn did not verify. The upload
 *    happens only AFTER the database has accepted the signature, so the
 *    privileged step is gated by the unprivileged one.
 *
 * If the PDF write fails the signature still stands: the row is the record, the
 * PDF is a rendering of it. The path is left null and the barn can re-render.
 */
export async function signForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireParent();
  if (!viewer) return { error: "Only a parent can sign this form.", message: null };

  const id = String(formData.get("id") ?? "");
  const signedName = String(formData.get("signed_name") ?? "").trim();

  if (!id) return { error: "Missing form.", message: null };
  if (!signedName) return { error: "Type your full name to sign.", message: null };

  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle<FormSubmission>();
  if (!submission) return { error: "That form is not available.", message: null };

  const { data: template } = await supabase
    .from("form_templates")
    .select("*")
    .eq("id", submission.template_id)
    .maybeSingle<FormTemplate>();
  if (!template) return { error: "That form is not available.", message: null };

  const answers = answersFrom(formData, template);
  const missing = missingRequired(answers, template);
  if (missing) return { error: `${missing} is required before you can sign.`, message: null };

  // The database sets signed_at and refuses this entirely without a name.
  const { data: signed, error } = await supabase
    .from("form_submissions")
    .update({ data: answers, status: "complete", signed_name: signedName })
    .eq("id", id)
    .select()
    .single<FormSubmission>();

  if (error) return { error: error.message, message: null };

  await storeSignedPdf(signed, template);

  revalidatePath("/more/forms");
  revalidatePath(`/more/forms/${id}`);
  revalidatePath("/manage/forms");
  return { error: null, message: "Signed. A copy is on file with the barn." };
}

/** Render the signed submission and put it in the vault. Never throws. */
async function storeSignedPdf(submission: FormSubmission, template: FormTemplate): Promise<void> {
  try {
    const lines: PdfLine[] = [
      { text: barn.name, heading: true },
      { text: template.name, heading: true, gap: true },
    ];

    if (template.description) lines.push({ text: template.description, gap: true });

    for (const field of fieldsOf(template.schema)) {
      const value = submission.data?.[field.key];
      const rendered =
        field.type === "checkbox" ? (value === true ? "Yes" : "No") : String(value ?? "");
      lines.push({ text: `${field.label}: ${rendered || "—"}` });
    }

    lines.push({ text: "Signature", heading: true, gap: true });
    lines.push({ text: `Signed by: ${submission.signed_name ?? ""}` });
    lines.push({ text: `Signed at: ${submission.signed_at ?? ""}` });
    lines.push({
      text: "Typed signature, submitted electronically through the barn app.",
      gap: true,
    });
    lines.push({ text: `Record id: ${submission.id}` });

    const pdf = renderPdf(lines);
    const path = `${familyFolder(submission.family_id)}/forms/${safeFileName(
      `${template.name}-${submission.id}.pdf`,
    )}`;

    // Service role: families have no write access to the vault. See the note
    // on signForm() for why this is the privileged half of the operation.
    const adminClient = createAdminClient();
    const { error } = await adminClient.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });

    if (error) return;

    await adminClient.from("form_submissions").update({ document_path: path }).eq("id", submission.id);
  } catch {
    // The signature is the record; the PDF is a rendering of it. A failure here
    // must never undo a valid signature or show the family an error for
    // something they cannot act on.
  }
}
