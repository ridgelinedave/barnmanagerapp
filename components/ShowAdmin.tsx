"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/Button";
import { CheckRow, Field, FormFeedback, Input, Select, Textarea } from "@/components/ui/Field";
import {
  saveShow,
  saveEntry,
  saveResult,
  deleteEntry,
  deleteResult,
  uploadShowBanner,
  removeShowBanner,
  type ShowState,
} from "@/app/(app)/lessons/shows/actions";
import type { Show, ShowEntry, ShowResult } from "@/lib/types";

/**
 * The barn's controls over a show.
 *
 * Every form here is a BODY, not a screen: each one is dropped into the
 * existing <dialog> Sheet, which is where this app puts a short action so the
 * page you came from stays visible behind it. Nothing in this file opens
 * anything — the pages own the triggers, so the sheet titles read in the
 * context they were opened from.
 *
 * None of these decide who may write. The action re-checks the permission
 * server-side and the RLS policy refuses regardless; a form that renders for
 * the wrong person is a cosmetic bug, not a hole.
 */
const EMPTY: ShowState = { error: null, message: null };

type Option = { id: string; name: string };

/* -------------------------------------------------------------------------- */
/* The show                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Create or edit a show.
 *
 * VISIBILITY IS A TWO-OPTION SELECT SPELLING OUT THE CONSEQUENCE, exactly as
 * the barn-event form does — and for the same reason: this control decides
 * whether a competition lands on forty families' screens, and a checkbox
 * labelled "internal" is far too easy to leave in the wrong state.
 *
 * The end date is optional and defaults to the start. Most schooling shows are
 * one day, and making someone type the same date twice is how a three-day
 * event ends up recorded as one.
 */
export function ShowForm({ show, today }: { show?: Show; today: string }) {
  const [state, formAction, pending] = useActionState(saveShow, EMPTY);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {show && <input type="hidden" name="id" value={show.id} />}

      <Field label="Show name" htmlFor={`${id}-name`}>
        <Input
          id={`${id}-name`}
          name="name"
          required
          maxLength={120}
          defaultValue={show?.name ?? ""}
        />
      </Field>

      <Field
        label="Where"
        htmlFor={`${id}-location`}
        optional
        hint="The venue as people say it — Tryon International, not the full address."
      >
        <Input id={`${id}-location`} name="location" defaultValue={show?.location ?? ""} />
      </Field>

      <Field label="Starts" htmlFor={`${id}-start`}>
        <Input
          id={`${id}-start`}
          name="start_date"
          type="date"
          required
          defaultValue={show?.start_date ?? today}
        />
      </Field>

      <Field
        label="Ends"
        htmlFor={`${id}-end`}
        optional
        hint="Leave blank for a one-day show."
      >
        <Input
          id={`${id}-end`}
          name="end_date"
          type="date"
          defaultValue={show?.end_date ?? ""}
        />
      </Field>

      <Field label="Details" htmlFor={`${id}-description`} optional>
        <Textarea
          id={`${id}-description`}
          name="description"
          rows={3}
          defaultValue={show?.description ?? ""}
        />
      </Field>

      <Field
        label="Who sees it"
        htmlFor={`${id}-visibility`}
        hint="Staff-only shows never appear on a family's screen."
      >
        <Select
          id={`${id}-visibility`}
          name="visibility"
          defaultValue={show?.visibility ?? "all"}
        >
          <option value="all">Everyone — families and staff</option>
          <option value="staff">Staff only — internal</option>
        </Select>
      </Field>

      <CheckRow label="Pin to the top" name="pinned" defaultChecked={show?.pinned ?? false} />

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : show ? "Save show" : "Add show"}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* The roster                                                                  */
/* -------------------------------------------------------------------------- */

/** "2026-08-22T12:40:00Z" → the barn-local date and time parts a form wants. */
function localParts(iso: string | null, timeZone: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };

  const at = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, ...opts }).format(new Date(iso));

  return {
    date: at({ year: "numeric", month: "2-digit", day: "2-digit" }),
    // en-GB with hour12:false gives 24h "08:40", which is what <input type=time> wants.
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  };
}

/**
 * Enter a rider, or edit an entry.
 *
 * THE HORSE IS OPTIONAL AND THE UNIQUENESS RULES FOLLOW FROM THAT. The schema
 * allows one entry per rider per horse, plus one per rider with no horse at
 * all — so a rider can be entered on two horses but not twice on the same one,
 * and not twice with the mount still undecided. Both are surfaced by the action
 * as a sentence naming the fix rather than as a constraint name.
 *
 * The ride time is split across a date and a time field rather than a single
 * datetime-local: a multi-day show needs the DAY chosen deliberately, and
 * datetime-local is the control people most often fill in half of.
 */
export function EntryForm({
  showId,
  entry,
  riders,
  horses,
  timeZone,
  defaultDate,
}: {
  showId: string;
  entry?: ShowEntry;
  riders: Option[];
  horses: Option[];
  timeZone: string;
  /** The show's start date, so a ride time only needs the time typing. */
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(saveEntry, EMPTY);
  const id = useId();
  const ride = localParts(entry?.ride_time ?? null, timeZone);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="show_id" value={showId} />
        {entry && <input type="hidden" name="id" value={entry.id} />}

        <Field label="Rider" htmlFor={`${id}-rider`}>
          <Select id={`${id}-rider`} name="rider_id" required defaultValue={entry?.rider_id ?? ""}>
            <option value="" disabled>
              Pick a rider…
            </option>
            {riders.map((rider) => (
              <option key={rider.id} value={rider.id}>
                {rider.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Horse"
          htmlFor={`${id}-horse`}
          optional
          hint="Leave blank if the mount is not settled yet."
        >
          <Select id={`${id}-horse`} name="horse_id" defaultValue={entry?.horse_id ?? ""}>
            <option value="">Not decided</option>
            {horses.map((horse) => (
              <option key={horse.id} value={horse.id}>
                {horse.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Classes"
          htmlFor={`${id}-classes`}
          optional
          hint="As they appear in the prize list — Training Level Test 2 & 3."
        >
          <Input id={`${id}-classes`} name="classes" defaultValue={entry?.classes ?? ""} />
        </Field>

        <Field
          label="Ride day"
          htmlFor={`${id}-ride-date`}
          optional
          hint="Leave the day and time blank until ride times are posted."
        >
          <Input
            id={`${id}-ride-date`}
            name="ride_date"
            type="date"
            min={defaultDate}
            defaultValue={ride.date}
          />
        </Field>

        <Field label="Ride time" htmlFor={`${id}-ride-time`} optional>
          <Input id={`${id}-ride-time`} name="ride_time" type="time" defaultValue={ride.time} />
        </Field>

        <FormFeedback error={state.error} message={state.message} />

        <Button type="submit" variant="primary" block disabled={pending}>
          {pending ? "Saving…" : entry ? "Save entry" : "Enter this rider"}
        </Button>
      </form>

      {/* Its own form: a nested one is invalid HTML, and the browser resolves
          it by dropping the inner element — so this button would silently
          submit the edit instead of the removal. */}
      {entry && (
        <RemoveButton
          action={deleteEntry}
          showId={showId}
          id={entry.id}
          label="Remove from this show"
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Record or correct a result.
 *
 * PLACING MAY BE BLANK, and the hint says why in the words the sport uses. An
 * eliminated ride is a real outcome; forcing a number would either invent a
 * placing or leave the ride off the board entirely, and both are worse than an
 * honest dash on the results list.
 */
export function ResultForm({
  showId,
  result,
  riders,
}: {
  showId: string;
  result?: ShowResult;
  riders: Option[];
}) {
  const [state, formAction, pending] = useActionState(saveResult, EMPTY);
  const id = useId();

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="show_id" value={showId} />
        {result && <input type="hidden" name="id" value={result.id} />}

        <Field label="Rider" htmlFor={`${id}-rider`}>
          <Select id={`${id}-rider`} name="rider_id" required defaultValue={result?.rider_id ?? ""}>
            <option value="" disabled>
              Pick a rider…
            </option>
            {riders.map((rider) => (
              <option key={rider.id} value={rider.id}>
                {rider.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Class"
          htmlFor={`${id}-class`}
          optional
          hint="One result per rider per class, so name it to record a second ride."
        >
          <Input id={`${id}-class`} name="class" defaultValue={result?.class ?? ""} />
        </Field>

        <Field
          label="Placing"
          htmlFor={`${id}-placing`}
          optional
          hint="Leave blank for eliminated, retired or withdrawn."
        >
          <Input
            id={`${id}-placing`}
            name="placing"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            defaultValue={result?.placing ?? ""}
          />
        </Field>

        <Field label="Score" htmlFor={`${id}-score`} optional hint="The percentage, e.g. 68.421.">
          <Input
            id={`${id}-score`}
            name="score"
            type="number"
            step="0.001"
            inputMode="decimal"
            defaultValue={result?.score ?? ""}
          />
        </Field>

        <FormFeedback error={state.error} message={state.message} />

        <Button type="submit" variant="primary" block disabled={pending}>
          {pending ? "Saving…" : result ? "Save result" : "Add result"}
        </Button>
      </form>

      {result && (
        <RemoveButton
          action={deleteResult}
          showId={showId}
          id={result.id}
          label="Remove this result"
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The banner                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Upload or clear the banner.
 *
 * The file input is a real 48px row rather than a bare `<input type=file>`,
 * whose default rendering is a tiny grey button that is hard to hit and
 * impossible to style consistently across iOS and Android.
 */
export function BannerForm({ showId, hasBanner }: { showId: string; hasBanner: boolean }) {
  const [state, formAction, pending] = useActionState(uploadShowBanner, EMPTY);
  const id = useId();

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="show_id" value={showId} />

        <Field
          label="Banner image"
          htmlFor={`${id}-file`}
          hint="Landscape reads best on the card. Up to 6 MB, JPEG, PNG, WebP or AVIF."
        >
          <input
            id={`${id}-file`}
            name="file"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="min-h-12 w-full rounded-control border border-line bg-surface p-2.5 text-body text-ink file:mr-3 file:min-h-8 file:rounded-control file:border-0 file:bg-accent file:px-3 file:font-display file:text-label file:font-bold file:uppercase file:tracking-[0.08em] file:text-accent-on"
          />
        </Field>

        <FormFeedback error={state.error} message={state.message} />

        <Button type="submit" variant="primary" block disabled={pending}>
          {pending ? "Uploading…" : hasBanner ? "Replace banner" : "Upload banner"}
        </Button>
      </form>

      {hasBanner && (
        <form action={removeShowBanner}>
          <input type="hidden" name="show_id" value={showId} />
          <Button type="submit" variant="danger" block>
            Remove the banner
          </Button>
        </form>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The destructive action at the foot of an edit sheet.
 *
 * A separate <form>, because it posts a different action from the one the
 * surrounding form is bound to — a nested form is invalid HTML and browsers
 * resolve it by dropping the inner one, so the button would silently submit
 * the edit instead of the delete.
 */
function RemoveButton({
  action,
  showId,
  id,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  showId: string;
  id: string;
  label: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="show_id" value={showId} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" block>
        {label}
      </Button>
    </form>
  );
}
