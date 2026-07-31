"use client";

import { useActionState, useRef, useState } from "react";
import { FormFeedback } from "@/components/ui/Field";
import { recordPunch, type PunchState } from "@/app/(app)/clock/actions";

/**
 * The big in/out button.
 *
 * GPS is requested at the moment of punching and attached if it arrives, but it
 * is never allowed to block: a short timeout, and a denial or a timeout simply
 * submits without coordinates. Someone standing in a metal barn with no signal
 * still has to be able to clock in — the punch is recorded and flagged for the
 * barn, which is a problem the admin can fix, unlike a shift that never got
 * recorded at all.
 */
const GEO_TIMEOUT_MS = 6000;

function readPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (value: { lat: number; lng: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Belt and braces: some browsers never call either callback if the
    // permission prompt is dismissed rather than answered.
    setTimeout(() => done(null), GEO_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => done(null),
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 30_000 },
    );
  });
}

export function ClockButton({ clockedIn }: { clockedIn: boolean }) {
  const [state, formAction, pending] = useActionState<PunchState, FormData>(recordPunch, {
    error: null,
    message: null,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [locating, setLocating] = useState(false);

  const direction = clockedIn ? "out" : "in";

  async function onClick() {
    setLocating(true);
    const position = await readPosition();
    setLocating(false);

    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem("lat") as HTMLInputElement).value =
      position ? String(position.lat) : "";
    (form.elements.namedItem("lng") as HTMLInputElement).value =
      position ? String(position.lng) : "";
    form.requestSubmit();
  }

  const busy = pending || locating;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="lat" defaultValue="" />
      <input type="hidden" name="lng" defaultValue="" />

      {/*
       * The biggest target in the app, deliberately: this is pressed in the
       * dark, in gloves, usually while carrying something. Gold when you are
       * off the clock (the inviting state), a bordered surface with a forest
       * dot when you are on it — so a glance from across the aisle answers
       * "am I clocked in" without reading a word.
       */}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={`flex min-h-32 w-full flex-col items-center justify-center gap-1.5 rounded-sheet transition-transform duration-150 ease-out active:scale-[0.99] disabled:opacity-60 ${
          clockedIn ? "border-2 border-line bg-surface" : "bg-gold"
        }`}
      >
        <span className="flex items-center gap-2 font-display text-[1.75rem] font-bold leading-none text-ink">
          {clockedIn && (
            <span aria-hidden="true" className="size-2.5 rounded-full bg-forest" />
          )}
          {busy ? "…" : clockedIn ? "Clock out" : "Clock in"}
        </span>
        <span className="text-label text-muted">
          {locating ? "Getting your location…" : clockedIn ? "You're on the clock" : "Tap to start"}
        </span>
      </button>

      <FormFeedback error={state.error} message={state.message} />
    </form>
  );
}
