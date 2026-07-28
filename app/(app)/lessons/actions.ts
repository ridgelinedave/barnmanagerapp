"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { isInsideBackfillCutoff } from "@/lib/dates";
import { barn } from "@/config/barn";

/**
 * The one write a parent has on lesson data: cancelling their own rider's spot.
 *
 * Everything that protects this lives in the database — the row policy limits
 * them to their own family's bookings, and the column trigger limits them to
 * the 'cancelled' transition (so a released slot cannot be quietly re-booked,
 * and a booking cannot be moved to another rider or lesson). This action only
 * decides what to TELL them, based on the barn's cutoff.
 *
 * The admin notification is written by a database trigger, not here, so the
 * barn is told no matter which path released the slot.
 */
export type CancelState = { error: string | null; message: string | null };

export async function cancelBooking(
  _prev: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const bookingId = String(formData.get("booking_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  if (!bookingId) return { error: "Missing booking.", message: null };

  const state = await getViewer();
  if (state.status !== "viewer") return { error: "You're not signed in.", message: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_riders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId);

  if (error) return { error: error.message, message: null };

  revalidatePath("/lessons");
  revalidatePath("/schedule");

  // Cutoff policy lives here because backfillCutoffMinutes is a per-barn config
  // value. Inside the cutoff the slot is too late to refill; outside it, the
  // slot is released and slice 3b will offer it to eligible riders.
  //
  // TODO (slice 3b): when outside the cutoff, open the slot and create
  // backfill_offers for eligible riders. This branch is the seam.
  const late = date && startTime ? isInsideBackfillCutoff(date, startTime) : true;

  return {
    error: null,
    message: late
      ? `Cancelled. It's inside the ${barn.backfillCutoffMinutes / 60}-hour window, so we've let ${barn.owner.split(" ")[0]} know directly.`
      : "Cancelled, and the spot has been released for another rider.",
  };
}

/**
 * Accept or decline an offered seat.
 *
 * All of the hard parts — who may answer, whether a seat is still free, and
 * what happens to everybody else's outstanding offers — are decided inside
 * respond_to_backfill_offer(), which serialises on the lesson row. Two parents
 * tapping Accept at the same instant is the case that function exists for, so
 * this action deliberately does no checking of its own; it would only be a
 * second, weaker opinion.
 */
export type OfferState = { error: string | null; message: string | null };

export async function respondToOffer(
  _prev: OfferState,
  formData: FormData,
): Promise<OfferState> {
  const offerId = String(formData.get("offer_id") ?? "");
  const accept = formData.get("accept") === "true";
  if (!offerId) return { error: "Missing offer.", message: null };

  const state = await getViewer();
  if (state.status !== "viewer") return { error: "You're not signed in.", message: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_backfill_offer", {
    offer: offerId,
    accept,
  });

  if (error) return { error: error.message, message: null };

  revalidatePath("/lessons");
  revalidatePath("/home");
  revalidatePath("/schedule");

  switch (data) {
    case "accepted":
      return { error: null, message: "You've got the spot — see you there." };
    case "declined":
      return { error: null, message: "Thanks for letting us know." };
    case "full":
      return { error: null, message: "Another rider accepted first. We'll offer you the next one." };
    case "unavailable":
      return { error: null, message: "The barn cancelled that lesson, so the spot is gone." };
    default:
      // 'accepted'/'declined'/'expired' returned for an already-answered offer.
      return { error: null, message: "That offer has already been answered." };
  }
}
