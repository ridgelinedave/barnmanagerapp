"use client";

import { useActionState } from "react";
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
    <article
      className={`rounded-2xl border p-4 ${
        cancelled ? "border-brand-ink/10 bg-brand-ink/5" : "border-brand-ink/15 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-base font-semibold">{riderName}</span>
        {cancelled && (
          <span className="ml-auto rounded-full bg-brand-ink/10 px-2 py-0.5 text-[11px] font-semibold text-brand-ink/70">
            {byBarn ? "Cancelled by the barn" : "Cancelled"}
          </span>
        )}
      </div>

      <p className={`mt-1 text-sm ${cancelled ? "text-brand-ink/50 line-through" : "text-brand-ink/75"}`}>
        {formatBarnDayLabel(instance.date)} · {formatTime(instance.start_time)} ·{" "}
        {instance.duration_min} min {instance.type === "private" ? "private" : "group"}
      </p>

      {instructorName && !cancelled && (
        <p className="mt-0.5 text-sm text-brand-ink/60">with {instructorName}</p>
      )}

      {state.message && (
        <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-900">
          {state.message}
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      {!cancelled && !state.message && (
        <form action={formAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="booking_id" value={booking.id} />
          <input type="hidden" name="date" value={instance.date} />
          <input type="hidden" name="start_time" value={instance.start_time} />

          {insideCutoff && (
            <p className="text-xs text-brand-ink/60">
              This lesson is less than {cutoffHours} hours away. You can still cancel, but the
              spot is too late to offer to anyone else.
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-xl border border-brand-ink/25 bg-white px-4 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? "Cancelling…" : "Cancel this lesson"}
          </button>
        </form>
      )}
    </article>
  );
}
