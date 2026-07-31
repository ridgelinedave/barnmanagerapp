"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FormFeedback } from "@/components/ui/Field";
import {
  ensureFamilyOnboarding,
  type OnboardingState,
} from "@/app/(app)/manage/forms/actions";

const EMPTY: OnboardingState = { error: null, message: null };

/**
 * Give a family their onboarding checklist.
 *
 * Idempotent at the database level, so pressing it twice is safe — and it
 * reports the count it created, because a button that silently did nothing is
 * indistinguishable from a broken one.
 */
export function EnsureOnboardingButton({ familyId }: { familyId: string }) {
  const [state, formAction, pending] = useActionState(ensureFamilyOnboarding, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="family_id" value={familyId} />

      <Button type="submit" variant="primary" block disabled={pending} icon="document">
        {pending ? "Setting up…" : "Set up their paperwork"}
      </Button>

      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}
