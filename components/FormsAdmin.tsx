"use client";

import { useActionState } from "react";
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

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
      >
        {pending ? "Setting up…" : "Set up their paperwork"}
      </button>

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
    </form>
  );
}
