import "server-only";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import type { FormSubmission, FormTemplate } from "@/lib/types";

/**
 * Onboarding form reads.
 *
 * Nothing here filters by family: the RLS policies already scope a parent to
 * their own household and give the admin everything, so a parent asking for
 * "all submissions" receives exactly theirs. Staff receive nothing at all,
 * which is why there is no staff-facing screen.
 */
export async function listActiveTemplates(): Promise<FormTemplate[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_templates")
    .select("*")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) return [];
  return (data ?? []) as FormTemplate[];
}

export async function listAllTemplates(): Promise<FormTemplate[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_templates")
    .select("*")
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error) return [];
  return (data ?? []) as FormTemplate[];
}

export async function listSubmissions(): Promise<FormSubmission[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_submissions")
    .select("*")
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as FormSubmission[];
}

export async function getSubmission(id: string): Promise<FormSubmission | null> {
  if (!supabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return null;
  return (data as FormSubmission) ?? null;
}

export async function getTemplate(id: string): Promise<FormTemplate | null> {
  if (!supabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return null;
  return (data as FormTemplate) ?? null;
}

/**
 * Is this family fully onboarded?
 *
 * THE SOFT GATE IS NOT WIRED UP. SPEC §5 describes blocking parents from the
 * rest of the app until required forms are complete; this returns the fact so
 * a screen can prompt, but nothing hides content behind it. That is a decision
 * for David — a gate that locks a paying family out of their lesson schedule
 * because a waiver is unsigned is a support call, not a feature, and it should
 * be his call to switch on. The seam is here when he wants it.
 */
export function onboardingOutstanding(submissions: FormSubmission[]): FormSubmission[] {
  return submissions.filter((s) => s.status === "pending");
}

export type FamilyProgress = {
  familyId: string;
  familyName: string;
  complete: number;
  pending: number;
};

/** Admin completeness dashboard: who still owes the barn a form. */
export async function familyProgress(): Promise<FamilyProgress[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const [{ data: submissions }, { data: families }] = await Promise.all([
    supabase.from("form_submissions").select("family_id, status"),
    supabase.from("families").select("id, name"),
  ]);

  const byFamily = new Map<string, { complete: number; pending: number }>();
  for (const row of submissions ?? []) {
    const key = row.family_id as string;
    const entry = byFamily.get(key) ?? { complete: 0, pending: 0 };
    if (row.status === "complete") entry.complete += 1;
    else entry.pending += 1;
    byFamily.set(key, entry);
  }

  return (families ?? [])
    .map((family) => {
      const counts = byFamily.get(family.id as string) ?? { complete: 0, pending: 0 };
      return {
        familyId: family.id as string,
        familyName: family.name as string,
        ...counts,
      };
    })
    // Families who owe something first — that is the whole point of the screen.
    .sort((a, b) => b.pending - a.pending || a.familyName.localeCompare(b.familyName));
}

/** Per-template completion, for the "6 of 9 families signed" line. */
export type TemplateProgress = {
  template: FormTemplate;
  issued: number;
  complete: number;
};

/**
 * How far along each template is.
 *
 * Counts ISSUED submissions, not families — a rider-scoped template can have
 * several rows per family, and saying "6 of 9 families" when it is really nine
 * riders would be wrong in the one direction that matters (it would look more
 * done than it is). The label the screen renders says what is being counted.
 */
export async function templateProgress(): Promise<TemplateProgress[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const [templates, { data: submissions }] = await Promise.all([
    listAllTemplates(),
    supabase.from("form_submissions").select("template_id, status"),
  ]);

  const counts = new Map<string, { issued: number; complete: number }>();
  for (const row of submissions ?? []) {
    const key = row.template_id as string;
    const entry = counts.get(key) ?? { issued: 0, complete: 0 };
    entry.issued += 1;
    if (row.status === "complete") entry.complete += 1;
    counts.set(key, entry);
  }

  return templates.map((template) => ({
    template,
    ...(counts.get(template.id) ?? { issued: 0, complete: 0 }),
  }));
}

/** One outstanding form, with enough context to act on it. */
export type SubmissionRow = {
  submission: FormSubmission;
  templateName: string;
  familyName: string;
  riderName: string | null;
};

/**
 * Every submission with its template, family and rider names resolved.
 *
 * Three reads and a join in memory rather than a nested PostgREST select: the
 * embedded form applies the parent table's policy to the child rows in a way
 * that is easy to misread, and an outstanding form showing a blank family name
 * is worse than none at all. The barn has tens of families, not thousands.
 */
export async function submissionRows(): Promise<SubmissionRow[]> {
  if (!supabaseConfigured()) return [];

  const supabase = await createClient();
  const [{ data: submissions }, templates, { data: families }, { data: riders }] =
    await Promise.all([
      supabase.from("form_submissions").select("*").order("created_at", { ascending: false }),
      listAllTemplates(),
      supabase.from("families").select("id, name"),
      supabase.from("riders").select("id, name"),
    ]);

  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  const familyName = new Map((families ?? []).map((f) => [f.id as string, f.name as string]));
  const riderName = new Map((riders ?? []).map((r) => [r.id as string, r.name as string]));

  return ((submissions ?? []) as FormSubmission[]).map((submission) => ({
    submission,
    templateName: templateName.get(submission.template_id) ?? "Form",
    familyName: familyName.get(submission.family_id) ?? "Unknown family",
    riderName: submission.rider_id ? (riderName.get(submission.rider_id) ?? null) : null,
  }));
}
