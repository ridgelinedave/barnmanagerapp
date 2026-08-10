"use client";

import { useActionState } from "react";
import { Callout, Card, Chip, ChipRow } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { FormFeedback } from "@/components/ui/Field";
import { cancelBooking, type CancelState } from "@/app/(app)/lessons/actions";
import { formatTime, formatBarnDayLabel } from "@/lib/dates";
import type { LessonInstance, LessonRider } from "@/lib/types";

/**
 * One upcoming lesson for one rider, with the family's cancel action.
 *
 * `insideCutoff` is decided on the server from barn.backfillCutoffMinutes and
 * passed in, so the warning the parent reads and the policy the barn applies
 * come from the same value.
 */
export function ParentLessonCard({
  instance,
  booking,
  riderName,
  instructorName,
  insideCutoff,
  cutoffHours,
}: {
  instance: LessonInstance;
  booking: LessonRider;
  riderName: string;
  instructorName?: string;
  insideCutoff: boolean;
  cutoffHours: number;
}) {
  const [state, formAction, pending] = useActionState<CancelState, FormData>(cancelBooking, {
    error: null,
    message: null,
  });

  const cancelled = booking.status === "cancelled" || instance.status === "cancelled";
  const byBarn = instance.status === "cancelled";

  return (
    <Card as="article" className={`p-4 ${cancelled ? "bg-sunk" : ""}`}>
      {/*
       * The date block leads, because a parent scanning this list is looking
       * for "when", and the rider's name is the answer to "whose".
       */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-control leading-none ${
            cancelled ? "bg-line/60" : "bg-accent-tint"
          }`}
        >
          <span className="font-display text-eyebrow uppercase text-accent-text">
            {formatBarnDayLabel(instance.date).split(",")[0]}
          </span>
          <span className="font-display text-heading font-bold text-ink">
            {instance.date.slice(-2)}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={`font-display text-heading leading-snug ${
              cancelled ? "text-muted line-through" : "text-ink"
            }`}
          >
            {formatTime(instance.start_time)} · {riderName}
          </p>
          <p className="mt-0.5 text-caption text-muted">
            {formatBarnDayLabel(instance.date)}
            {instructorName && !cancelled ? ` · with ${instructorName}` : ""}
          </p>
          <div className="mt-1.5">
            <ChipRow>
              <Chip value={instance.type === "private" ? "Private" : "Group"} />
              <Chip value={`${instance.duration_min} min`} icon="clock" />
              {cancelled && (
                <Chip
                  value={byBarn ? "Cancelled by the barn" : "Cancelled"}
                  icon="alert"
                  tone="danger"
                />
              )}
            </ChipRow>
          </div>
        </div>
      </div>

      {(state.message || state.error) && (
        <div className="mt-3">
          <FormFeedback error={state.error} message={state.message} />
        </div>
      )}

      {!cancelled && !state.message && (
        <form action={formAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="booking_id" value={booking.id} />
          <input type="hidden" name="date" value={instance.date} />
          <input type="hidden" name="start_time" value={instance.start_time} />

          {insideCutoff && (
            <Callout tone="gold" icon="clock">
              Less than {cutoffHours} hours away. You can still cancel, but the spot is too late
              to offer to anyone else.
            </Callout>
          )}

          <Button type="submit" variant="secondary" block disabled={pending}>
            {pending ? "Cancelling…" : "Cancel this lesson"}
          </Button>
        </form>
      )}
    </Card>
  );
}
