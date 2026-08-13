"use client";

import { useActionState, useState } from "react";
import { Chip, Sunk } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { FormFeedback } from "@/components/ui/Field";
import {
  sendOffers,
  assignBackfill,
  sendLessonReminders,
  type ScheduleState,
} from "@/app/(app)/schedule/actions";
import type { BackfillOffer, EligibleRider } from "@/lib/types";

const EMPTY: ScheduleState = { error: null, message: null };

function Feedback({ state }: { state: ScheduleState }) {
  return <FormFeedback error={state.error} message={state.message} />;
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
      <Button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        variant="secondary"
        block
        icon={open ? undefined : "alert"}
      >
        {open
          ? "Close"
          : `Fill this slot — ${openSeats} seat${openSeats === 1 ? "" : "s"} open${
              outstanding.length > 0 ? `, ${outstanding.length} offered` : ""
            }`}
      </Button>

      {offers.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {offers.map((offer) => (
            <li key={offer.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-caption text-ink">
                {riderNames.get(offer.rider_id) ?? "Rider"}
              </span>
              <Chip
                value={OFFER_LABEL[offer.status]}
                icon={
                  offer.status === "accepted"
                    ? "check"
                    : offer.status === "sent"
                      ? "clock"
                      : "alert"
                }
                tone={
                  offer.status === "accepted"
                    ? "forest"
                    : offer.status === "sent"
                      ? "gold"
                      : "neutral"
                }
              />
            </li>
          ))}
        </ul>
      )}

      {/* Sunk, not a nested card: this opens inside the lesson's own card. */}
      {open && (
        <Sunk className="flex flex-col gap-3">
          {eligible.length === 0 ? (
            <p className="text-caption text-muted">
              No eligible riders — everyone at this level is already in the lesson.
            </p>
          ) : (
            <>
              <form action={offerAction} className="flex flex-col gap-2">
                <input type="hidden" name="instance_id" value={instanceId} />
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1 text-label font-medium text-ink">
                    Offer the spot to
                  </legend>
                  {eligible.map((rider) => (
                    <label
                      key={rider.id}
                      className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3"
                    >
                      <input
                        type="checkbox"
                        name="rider_ids"
                        value={rider.id}
                        className="size-5 accent-[var(--accent)]"
                      />
                      <span className="text-body text-ink">{rider.name}</span>
                    </label>
                  ))}
                </fieldset>
                <Button type="submit" variant="primary" block disabled={offerPending}>
                  {offerPending ? "Sending…" : "Send offers — first to accept wins"}
                </Button>
                <Feedback state={offerState} />
              </form>

              <form action={assignAction} className="flex flex-col gap-2 border-t border-line pt-3">
                <input type="hidden" name="instance_id" value={instanceId} />
                <label htmlFor={`assign-${instanceId}`} className="text-label font-medium text-ink">
                  Or place someone directly
                </label>
                <div className="flex gap-2">
                  <select
                    id={`assign-${instanceId}`}
                    name="rider_id"
                    required
                    defaultValue=""
                    className="min-h-12 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-body text-ink"
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
                  <Button type="submit" variant="secondary" disabled={assignPending}>
                    {assignPending ? "…" : "Assign"}
                  </Button>
                </div>
                <Feedback state={assignState} />
              </form>
            </>
          )}
        </Sunk>
      )}
    </div>
  );
}

/**
 * Queue the day's lesson reminders. Idempotent in the database.
 *
 * Lives in the Schedule tab's admin overflow, so the label names the day it
 * will act on rather than relying on "this day" meaning whatever the screen
 * happened to be showing when the sheet was opened.
 */
export function SendRemindersButton({ date, dayLabel }: { date: string; dayLabel: string }) {
  const [state, formAction, pending] = useActionState(sendLessonReminders, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="date" value={date} />
      <Button type="submit" size="menu" block disabled={pending} icon="bell">
        {pending ? "Sending reminders…" : `Send lesson reminders for ${dayLabel}`}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
