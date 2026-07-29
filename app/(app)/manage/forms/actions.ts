"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";

/**
 * Admin-side onboarding.
 *
 * The materialiser runs on the admin's own session, so the function's internal
 * role check is the real gate — this wrapper only turns the raise into a
 * readable message.
 */
export type OnboardingState = { error: string | null; message: string | null };

export async function ensureFamilyOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const state = await getViewer();
  if (state.status !== "viewer" || state.viewer.role !== "admin") {
    return { error: "Only an admin can set up onboarding.", message: null };
  }

  const familyId = String(formData.get("family_id") ?? "");
  if (!familyId) return { error: "Missing family.", message: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ensure_family_onboarding", { family: familyId });

  if (error) return { error: error.message, message: null };

  revalidatePath("/manage/forms");
  const created = typeof data === "number" ? data : 0;
  return {
    error: null,
    message:
      created === 0
        ? "Already set up — nothing to add."
        : `Added ${created} form${created === 1 ? "" : "s"} to their checklist.`,
  };
}
