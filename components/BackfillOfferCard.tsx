"use client";

import { useActionState } from "react";
import { Callout, Card, Chip, ChipRow } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { FormFeedback } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
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

  /*
   * An outstanding offer is the one thing on Home that is racing someone else,
   * so it gets the loudest treatment in the system: a gold border. Once it is
   * resolved it drops back to an ordinary card — the urgency is gone and it
   * should stop shouting.
   */
  return (
    <Card as="article" className={`p-4 ${resolved ? "" : "border-2 border-accent"}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex size-10 shrink-0 items-center justify-center rounded-control ${
            resolved ? "bg-sunk text-muted" : "bg-accent text-accent-on"
          }`}
        >
          <Icon name={resolved ? "check" : "alert"} className="size-5" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-display text-eyebrow uppercase text-accent-text">
            {resolved ? "Backfill spot" : "A spot opened up"}
          </p>
          <h3 className="mt-0.5 font-display text-heading text-ink">{riderName}</h3>

          {instance && (
            <>
              <p className="mt-0.5 text-caption text-muted">
                {formatBarnDayLabel(instance.date)} · {formatTime(instance.start_time)}
                {instructorName ? ` · with ${instructorName}` : ""}
              </p>
              <div className="mt-1.5">
                <ChipRow>
                  <Chip value={instance.type === "private" ? "Private" : "Group"} />
                  <Chip value={`${instance.duration_min} min`} icon="clock" />
                </ChipRow>
              </div>
            </>
          )}
        </div>
      </div>

      {resolved ? (
        <div className="mt-3">
          <Callout tone={status === "accepted" ? "forest" : "gold"} icon={status === "accepted" ? "check" : "clock"}>
            <span className="block font-semibold">{state.message ?? outcome?.title}</span>
            {!state.message && outcome && <span className="block">{outcome.body}</span>}
          </Callout>
        </div>
      ) : (
        <>
          {state.error && (
            <div className="mt-3">
              <FormFeedback error={state.error} />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <form action={formAction} className="flex-1">
              <input type="hidden" name="offer_id" value={offerId} />
              <input type="hidden" name="accept" value="true" />
              <Button type="submit" variant="primary" block disabled={pending}>
                {pending ? "…" : "Accept"}
              </Button>
            </form>
            <form action={formAction} className="flex-1">
              <input type="hidden" name="offer_id" value={offerId} />
              <input type="hidden" name="accept" value="false" />
              <Button type="submit" variant="secondary" block disabled={pending}>
                {pending ? "…" : "Decline"}
              </Button>
            </form>
          </div>
        </>
      )}
    </Card>
  );
}
