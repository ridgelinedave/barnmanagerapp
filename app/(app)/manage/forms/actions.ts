"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isFormField, type FormField } from "@/lib/types";

/**
 * Admin-side forms: onboarding, template authoring, and issuing.
 *
 * NO SQL WAS NEEDED FOR ANY OF IT. `form_templates.schema` is jsonb whose only
 * constraint is `jsonb_typeof(schema) = 'array'`, and that was deliberate in
 * migration 0013 — "a form field is not a schema change". The `signature` field
 * type added in this pass is exactly the case that was designed for.
 *
 * Every write runs on the admin's own session against the admin-only policies
 * from 0013; the checks here produce a readable sentence rather than a silent
 * zero-row write.
 */
export type OnboardingState = { error: string | null; message: string | null };

const DENIED = "Only an admin can change the barn's forms.";

async function requireAdmin() {
  const state = await getViewer();
  if (state.status !== "viewer") return null;
  return state.viewer.role === "admin" ? state.viewer : null;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function readable(message: string): string {
  if (message.includes("form_templates_schema_is_array")) {
    return "The field list could not be read. Refresh and try again.";
  }
  if (message.includes("form_submissions_one_per_scope")) {
    return "Some of those already had this form — the duplicates were skipped.";
  }
  return message;
}

function revalidate() {
  revalidatePath("/manage/forms");
  revalidatePath("/more/forms");
}

/**
 * The materialiser runs on the admin's own session, so the function's internal
 * role check is the real gate — this wrapper only turns the raise into a
 * readable message.
 */
export async function ensureFamilyOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  if (!(await requireAdmin())) {
    return { error: "Only an admin can set up onboarding.", message: null };
  }

  const familyId = text(formData, "family_id");
  if (!familyId) return { error: "Missing family.", message: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_family_onboarding", { family: familyId });

  if (error) return { error: readable(error.message), message: null };

  revalidate();
  const created = typeof data === "number" ? data : 0;
  return {
    error: null,
    message:
      created === 0
        ? "Already set up — nothing to add."
        : `Added ${created} form${created === 1 ? "" : "s"} to their checklist.`,
  };
}

/* ========================================================================== */
/* Template authoring                                                          */
/* ========================================================================== */

export type TemplateState = { error: string | null; message: string | null };

/**
 * The field list arrives as one JSON string from the client editor.
 *
 * Parsed and RE-VALIDATED here rather than trusted. `fieldsOf()` silently drops
 * anything malformed at render time, which means a bad field would save
 * happily and then simply not appear on the form — the worst kind of bug,
 * because nothing reports it. Better to refuse the save and say which rule
 * broke.
 */
function parseSchema(raw: string): { fields: FormField[] } | { error: string } {
  if (!raw) return { fields: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "The field list could not be read. Refresh and try again." };
  }
  if (!Array.isArray(parsed)) return { error: "The field list could not be read." };

  const fields: FormField[] = [];
  const seen = new Set<string>();

  for (const candidate of parsed) {
    if (!isFormField(candidate)) return { error: "Every field needs a label and a type." };

    const key = candidate.key.trim();
    if (!key) return { error: "Every field needs a name." };

    // The key is how an answer is STORED, so two fields sharing one would have
    // the second silently overwrite the first's answer.
    if (seen.has(key)) {
      return { error: `Two fields are both called "${key}". Names must differ.` };
    }
    seen.add(key);

    fields.push({
      key,
      label: candidate.label.trim() || key,
      type: candidate.type,
      required: Boolean(candidate.required),
    });
  }

  return { fields };
}

export async function saveTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  if (!(await requireAdmin())) return { error: DENIED, message: null };

  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name) return { error: "Give the form a name.", message: null };

  const appliesTo = text(formData, "applies_to");
  if (appliesTo !== "family" && appliesTo !== "rider") {
    return { error: "Say whether this is per family or per rider.", message: null };
  }

  const parsed = parseSchema(text(formData, "schema"));
  if ("error" in parsed) return { error: parsed.error, message: null };

  const row = {
    name,
    description: text(formData, "description"),
    applies_to: appliesTo,
    required: formData.get("required") === "on",
    active: formData.get("active") === "on",
    schema: parsed.fields,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("form_templates").update(row).eq("id", id)
    : await supabase.from("form_templates").insert(row);

  if (error) return { error: readable(error.message), message: null };

  revalidate();
  return { error: null, message: id ? "Saved." : "Form created." };
}

/* ========================================================================== */
/* Issuing                                                                     */
/* ========================================================================== */

/**
 * Issue a template to chosen families.
 *
 * TWO THINGS WORTH KNOWING, both about what this does NOT rely on:
 *
 *  1. `status` is sent explicitly rather than left to the guard trigger. The
 *     trigger forces pending/unsigned for a PARENT insert and RETURNS EARLY for
 *     an admin one — so an admin-issued row is only pending because this says
 *     so and because the column defaults that way. Sending it is the honest
 *     version of that assumption. (The `form_submissions_complete_is_signed`
 *     CHECK is the real backstop: no row can be 'complete' without a signature,
 *     whoever writes it.)
 *
 *  2. Duplicates are prevented by `form_submissions_one_per_scope`, not by a
 *     read-then-write here. Every chosen family is fired at the table and the
 *     unique constraint absorbs the ones that already exist — which is also
 *     what makes pressing the button twice harmless.
 *
 * A rider-scoped template fans out to that family's ACTIVE riders, the same
 * rule ensure_family_onboarding() uses, so bulk and targeted issuing cannot
 * disagree about who owes what.
 */
export async function issueTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  if (!(await requireAdmin())) return { error: DENIED, message: null };

  const templateId = text(formData, "template_id");
  if (!templateId) return { error: "Pick a form to issue.", message: null };

  const supabase = await createClient();

  const { data: template } = await supabase
    .from("form_templates")
    .select("id, applies_to, active")
    .eq("id", templateId)
    .maybeSingle();

  if (!template) return { error: "That form no longer exists.", message: null };
  if (!template.active) {
    return { error: "That form is switched off. Turn it on before issuing it.", message: null };
  }

  // "Everyone" is a deliberate tick rather than an empty selection meaning all:
  // issuing to the whole barn by forgetting to choose anybody is the wrong
  // direction for a mistake to fall.
  const everyone = formData.get("everyone") === "on";
  const chosen = formData.getAll("family_id").map(String).filter(Boolean);

  let familyIds = chosen;
  if (everyone) {
    const { data: families } = await supabase.from("families").select("id");
    familyIds = (families ?? []).map((f) => f.id as string);
  }
  if (familyIds.length === 0) {
    return { error: "Pick at least one family, or tick everyone.", message: null };
  }

  const rows: {
    template_id: string;
    family_id: string;
    rider_id: string | null;
    status: string;
  }[] = [];

  if (template.applies_to === "family") {
    for (const familyId of familyIds) {
      rows.push({ template_id: templateId, family_id: familyId, rider_id: null, status: "pending" });
    }
  } else {
    const { data: riders } = await supabase
      .from("riders")
      .select("id, family_id")
      .in("family_id", familyIds)
      .eq("active", true);

    for (const rider of riders ?? []) {
      rows.push({
        template_id: templateId,
        family_id: rider.family_id as string,
        rider_id: rider.id as string,
        status: "pending",
      });
    }
    if (rows.length === 0) {
      return { error: "Those families have no active riders to issue it to.", message: null };
    }
  }

  // Counted before and after so the message can say what actually changed. The
  // insert still relies on the constraint, not on this read.
  const countIssued = async () => {
    const { count } = await supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("template_id", templateId);
    return count ?? 0;
  };

  const before = await countIssued();

  const { error } = await supabase
    .from("form_submissions")
    .upsert(rows, { onConflict: "template_id,family_id,rider_id", ignoreDuplicates: true });

  if (error) return { error: readable(error.message), message: null };

  const created = (await countIssued()) - before;

  revalidate();
  return {
    error: null,
    message:
      created === 0
        ? "Everyone chosen already had it — nothing to add."
        : `Issued to ${created} ${created === 1 ? "person" : "people"}.`,
  };
}
