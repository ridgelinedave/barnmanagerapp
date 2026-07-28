"use client";

import { useActionState, useState } from "react";
import {
  sendOffers,
  assignBackfill,
  sendLessonReminders,
  type ScheduleState,
} from "@/app/(app)/schedule/actions";
import type { BackfillOffer, EligibleRider } from "@/lib/types";

const EMPTY: ScheduleState = { error: null, message: null };

function Feedback({ state }: { state: ScheduleState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
        {state.message}
      </p>
    );
  }
  return null;
}

const OFFER_LABEL: Record<BackfillOffer["status"], string> = {
  sent: "Waiting",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Closed",
};

/**
 * Fill a released seat: offer it to several riders and let the first to accept
 * take it, or place someone directly.
 *
 * Collapsed by default — most lessons are full, and an always-open form on
 * every card would bury the day's actual schedule.
 */
export function FillSlotForm({
  instanceId,
  openSeats,
  eligible,
  offers,
  riderNames,
}: {
  instanceId: string;
  openSeats: number;
  eligible: EligibleRider[];
  offers: BackfillOffer[];
  riderNames: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [offerState, offerAction, offerPending] = useActionState(sendOffers, EMPTY);
  const [assignState, assignAction, assignPending] = useActionState(assignBackfill, EMPTY);

  const outstanding = offers.filter((o) => o.status === "sent");

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="min-h-11 w-full rounded-xl border border-brand-ink/20 bg-white text-sm font-semibold"
      >
        {open
          ? "Close"
          : `Fill this slot — ${openSeats} seat${openSeats === 1 ? "" : "s"} open${
              outstanding.length > 0 ? `, ${outstanding.length} offered` : ""
            }`}
      </button>

      {offers.length > 0 && (
        <ul className="flex flex-col gap-1">
          {offers.map((offer) => (
            <li key={offer.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">
                {riderNames.get(offer.rider_id) ?? "Rider"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  offer.status === "accepted"
                    ? "bg-green-100 text-green-900"
                    : offer.status === "sent"
                      ? "bg-brand-gold/30 text-brand-ink"
                      : "bg-brand-ink/10 text-brand-ink/70"
                }`}
              >
                {OFFER_LABEL[offer.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-ink/15 p-3">
          {eligible.length === 0 ? (
            <p className="text-sm text-brand-ink/70">
              No eligible riders — everyone at this level is already in the lesson.
            </p>
          ) : (
            <>
              <form action={offerAction} className="flex flex-col gap-2">
                <input type="hidden" name="instance_id" value={instanceId} />
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-sm font-medium">Offer the spot to</legend>
                  {eligible.map((rider) => (
                    <label
                      key={rider.id}
                      className="flex min-h-11 items-center gap-3 rounded-xl border border-brand-ink/15 px-3"
                    >
                      <input
                        type="checkbox"
                        name="rider_ids"
                        value={rider.id}
                        className="size-5 accent-[var(--brand-gold)]"
                      />
                      <span className="text-sm">{rider.name}</span>
                    </label>
                  ))}
                </fieldset>
                <button
                  type="submit"
                  disabled={offerPending}
                  className="min-h-11 rounded-xl bg-brand-gold px-4 text-sm font-semibold text-brand-ink disabled:opacity-60"
                >
                  {offerPending ? "Sending…" : "Send offers — first to accept wins"}
                </button>
                <Feedback state={offerState} />
              </form>

              <form action={assignAction} className="flex flex-col gap-2 border-t border-brand-ink/10 pt-3">
                <input type="hidden" name="instance_id" value={instanceId} />
                <label htmlFor={`assign-${instanceId}`} className="text-sm font-medium">
                  Or place someone directly
                </label>
                <div className="flex gap-2">
                  <select
                    id={`assign-${instanceId}`}
                    name="rider_id"
                    required
                    defaultValue=""
                    className="min-h-11 flex-1 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm"
                  >
                    <option value="" disabled>
                      Pick a rider…
                    </option>
                    {eligible.map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={assignPending}
                    className="min-h-11 rounded-xl border border-brand-ink/20 bg-white px-3 text-sm font-semibold disabled:opacity-60"
                  >
                    {assignPending ? "…" : "Assign"}
                  </button>
                </div>
                <Feedback state={assignState} />
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Queue tomorrow's reminders. Idempotent in the database. */
export function SendRemindersButton({ date }: { date: string }) {
  const [state, formAction, pending] = useActionState(sendLessonReminders, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="date" value={date} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl border border-brand-ink/20 bg-white px-4 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reminders for this day"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
