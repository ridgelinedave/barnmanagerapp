"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FormFeedback } from "@/components/ui/Field";
import { Sunk } from "@/components/ui/primitives";
import { ensureFamilyOnboarding, type OnboardingState } from "@/app/(app)/manage/forms/actions";
import type { Family } from "@/lib/types";

const EMPTY: OnboardingState = { error: null, message: null };

/**
 * Give a family their onboarding checklist.
 *
 * Runs `ensure_family_onboarding()`, which materialises every ACTIVE, REQUIRED
 * template for the family and its riders in one statement. That is the bulk
 * path; issuing a single form to chosen families is the targeted one, and the
 * two agree because both fan a rider-scoped template out to active riders only.
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

      <Button type="submit" variant="secondary" block disabled={pending} arrow={false}>
        {pending ? "Setting up…" : "Set up required forms"}
      </Button>

      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}

/**
 * The bulk case: hand a family every required form at once.
 *
 * A family per row rather than a multi-select, because each one reports back
 * separately — "added 3" for one family and "already set up" for the next is
 * more useful than a single number covering both.
 */
export function OnboardingPicker({ families }: { families: Family[] }) {
  if (families.length === 0) {
    return <p className="text-caption text-muted">No families yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted">
        Adds every required form to that family, and to each of their riders. Anything they
        already have is left alone.
      </p>

      {families.map((family) => (
        <Sunk key={family.id} className="flex flex-col gap-2">
          <p className="font-display text-heading leading-snug text-ink">{family.name}</p>
          <EnsureOnboardingButton familyId={family.id} />
        </Sunk>
      ))}
    </div>
  );
}
