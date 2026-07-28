"use client";

import { useActionState } from "react";
import { respondToOffer, type OfferState } from "@/app/(app)/lessons/actions";
import { formatBarnDayLabel, formatTime } from "@/lib/dates";
import type { BackfillOfferStatus, LessonInstance } from "@/lib/types";

/**
 * "A spot opened — Accept or Decline", and afterwards, what happened.
 *
 * The resolved outcome is rendered IN PLACE rather than the card disappearing.
 * Two things make that work together:
 *
 *  - the server keeps recently-answered offers in the list for a few minutes,
 *    so a re-render or a refresh still shows the result; and
 *  - the outcome text is derived from the offer's own status, falling back to
 *    the action's message for the instant right after the tap.
 *
 * The result is therefore real state, not a toast that vanishes on the next
 * render. A parent who accepts and immediately pulls to refresh still sees
 * "You got the spot".
 */
const OUTCOME: Record<Exclude<BackfillOfferStatus, "sent">, { title: string; body: string }> = {
  accepted: {
    title: "You got the spot",
    body: "It's confirmed and added to your lessons.",
  },
  declined: {
    title: "You declined this spot",
    body: "No problem — we'll let you know when the next one opens.",
  },
  expired: {
    title: "That spot has gone",
    body: "Another rider accepted first. We'll offer you the next one.",
  },
};

export function BackfillOfferCard({
  offerId,
  status,
  instance,
  riderName,
  instructorName,
}: {
  offerId: string;
  status: BackfillOfferStatus;
  /**
   * Null once an offer is declined or expired: the family's sight of the
   * lesson lasts only while the offer is outstanding, so the card renders the
   * outcome without the details it can no longer read.
   */
  instance: LessonInstance | null;
  riderName: string;
  instructorName?: string;
}) {
  const [state, formAction, pending] = useActionState<OfferState, FormData>(respondToOffer, {
    error: null,
    message: null,
  });

  const resolved = status !== "sent";
  const outcome = resolved ? OUTCOME[status] : null;

  return (
    <article
      className={`rounded-2xl border-2 p-4 ${
        resolved ? "border-brand-ink/15 bg-white" : "border-brand-gold bg-white"
      }`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          resolved ? "text-brand-ink/50" : "text-brand-gold-deep"
        }`}
      >
        {resolved ? "Backfill spot" : "A spot opened up"}
      </p>

      <h3 className="mt-1 text-base font-semibold">{riderName}</h3>

      {instance ? (
        <>
          <p className="mt-0.5 text-sm text-brand-ink/75">
            {formatBarnDayLabel(instance.date)} · {formatTime(instance.start_time)} ·{" "}
            {instance.duration_min} min {instance.type === "private" ? "private" : "group"}
          </p>
          {instructorName && <p className="text-sm text-brand-ink/60">with {instructorName}</p>}
        </>
      ) : null}

      {resolved ? (
        <div
          role="status"
          className={`mt-3 rounded-xl p-3 text-sm ${
            status === "accepted" ? "bg-green-50 text-green-900" : "bg-brand-ink/5 text-brand-ink/80"
          }`}
        >
          <span className="block font-semibold">{state.message ?? outcome?.title}</span>
          {!state.message && outcome && <span className="block">{outcome.body}</span>}
        </div>
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
