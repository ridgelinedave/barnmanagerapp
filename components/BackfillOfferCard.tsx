"use client";

import { useActionState } from "react";
import { respondToOffer, type OfferState } from "@/app/(app)/lessons/actions";
import { formatBarnDayLabel, formatTime } from "@/lib/dates";
import type { LessonInstance } from "@/lib/types";

/**
 * "A spot opened — Accept or Decline."
 *
 * Two buttons, one decision, nothing else on the card (SPEC §7: one decision
 * per screen). The outcome text comes back from the database, because whether
 * the parent actually got the seat is only known after the race is resolved.
 */
export function BackfillOfferCard({
  offerId,
  instance,
  riderName,
  instructorName,
}: {
  offerId: string;
  instance: LessonInstance;
  riderName: string;
  instructorName?: string;
}) {
  const [state, formAction, pending] = useActionState<OfferState, FormData>(respondToOffer, {
    error: null,
    message: null,
  });

  return (
    <article className="rounded-2xl border-2 border-brand-gold bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-gold-deep">
        A spot opened up
      </p>

      <h3 className="mt-1 text-base font-semibold">{riderName}</h3>
      <p className="mt-0.5 text-sm text-brand-ink/75">
        {formatBarnDayLabel(instance.date)} · {formatTime(instance.start_time)} ·{" "}
        {instance.duration_min} min {instance.type === "private" ? "private" : "group"}
      </p>
      {instructorName && <p className="text-sm text-brand-ink/60">with {instructorName}</p>}

      {state.message ? (
        <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900">
          {state.message}
        </p>
      ) : (
        <>
          {state.error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              {state.error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <form action={formAction} className="flex-1">
              <input type="hidden" name="offer_id" value={offerId} />
              <input type="hidden" name="accept" value="true" />
              <button
                type="submit"
                disabled={pending}
                className="min-h-12 w-full rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60"
              >
                {pending ? "…" : "Accept"}
              </button>
            </form>
            <form action={formAction} className="flex-1">
              <input type="hidden" name="offer_id" value={offerId} />
              <input type="hidden" name="accept" value="false" />
              <button
                type="submit"
                disabled={pending}
                className="min-h-12 w-full rounded-xl border border-brand-ink/25 bg-white px-4 text-base font-semibold disabled:opacity-60"
              >
                {pending ? "…" : "Decline"}
              </button>
            </form>
          </div>
        </>
      )}
    </article>
  );
}
