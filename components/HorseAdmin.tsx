"use client";

import { useActionState } from "react";
import {
  assignRider,
  createHorse,
  saveFeedPlan,
  updateHorse,
  type HorseAdminState,
} from "@/app/(app)/manage/horses/actions";
import { MEALS, MEAL_LABELS, type FeedPlan, type Horse } from "@/lib/types";

const EMPTY: HorseAdminState = { error: null, message: null };

const FIELD = "min-h-12 rounded-xl border border-brand-ink/20 bg-white px-3 text-base";
const SUBMIT =
  "min-h-12 rounded-xl bg-brand-gold px-4 text-base font-semibold text-brand-ink disabled:opacity-60";

function Feedback({ state }: { state: HorseAdminState }) {
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

type Family = { id: string; name: string };

/**
 * Create or edit a horse.
 *
 * Ownership is the field that matters most and it is the one people get wrong,
 * so it is not a bare dropdown: "The barn" is spelled out as an option rather
 * than being the empty default, and the help text says what the choice
 * actually does. Setting an owner grants that family full read on this horse.
 */
export function HorseForm({
  horse,
  families,
}: {
  horse?: Horse;
  families: Family[];
}) {
  const [state, formAction, pending] = useActionState(
    horse ? updateHorse : createHorse,
    EMPTY,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {horse && <input type="hidden" name="id" value={horse.id} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-name" className="text-sm font-medium">
          Registered name
        </label>
        <input
          id="horse-name"
          name="name"
          required
          defaultValue={horse?.name ?? ""}
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-barn-name" className="text-sm font-medium">
          Barn name <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <input
          id="horse-barn-name"
          name="barn_name"
          defaultValue={horse?.barn_name ?? ""}
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-owner" className="text-sm font-medium">
          Owner
        </label>
        <select
          id="horse-owner"
          name="owner_family_id"
          defaultValue={horse?.owner_family_id ?? ""}
          className={FIELD}
        >
          <option value="">The barn</option>
          {families.map((family) => (
            <option key={family.id} value={family.id}>
              {family.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-brand-ink/55">
          The owning family can read this horse&apos;s full record and feed chart. Everyone else
          sees only the name and photo, and only if their rider rides it.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-breed" className="text-sm font-medium">
          Breed <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <input id="horse-breed" name="breed" defaultValue={horse?.breed ?? ""} className={FIELD} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-dob" className="text-sm font-medium">
          Date of birth <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <input
          id="horse-dob"
          name="dob"
          type="date"
          defaultValue={horse?.dob ?? ""}
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-notes" className="text-sm font-medium">
          Notes <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <textarea
          id="horse-notes"
          name="notes"
          rows={3}
          defaultValue={horse?.notes ?? ""}
          className="rounded-xl border border-brand-ink/20 bg-white p-3 text-base"
        />
      </div>

      {horse && (
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-brand-ink/20 bg-white px-3">
          <input
            type="checkbox"
            name="active"
            defaultChecked={horse.active}
            className="size-5 accent-brand-gold-deep"
          />
          <span className="text-base">In work at the barn</span>
        </label>
      )}

      <Feedback state={state} />

      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending ? "Saving…" : horse ? "Save changes" : "Add horse"}
      </button>
    </form>
  );
}

type AssignableRider = { id: string; name: string };

export function AssignRiderForm({
  horseId,
  riders,
}: {
  horseId: string;
  riders: AssignableRider[];
}) {
  const [state, formAction, pending] = useActionState(assignRider, EMPTY);

  if (riders.length === 0) {
    return (
      <p className="text-sm text-brand-ink/70">
        Every rider is already assigned to this horse.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="horse_id" value={horseId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="assign-rider" className="text-sm font-medium">
          Add a rider
        </label>
        <select id="assign-rider" name="rider_id" required className={FIELD}>
          {riders.map((rider) => (
            <option key={rider.id} value={rider.id}>
              {rider.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-brand-ink/55">
          Their family will see this horse&apos;s name and photo — never the breed, notes or feed
          chart.
        </p>
      </div>

      <Feedback state={state} />

      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending ? "Assigning…" : "Assign rider"}
      </button>
    </form>
  );
}

/**
 * Set one meal's feed plan.
 *
 * Saving replaces whatever is currently active for that meal — the old plan is
 * retired, not deleted, so a feed change stays legible afterwards. Pre-filled
 * from the current plan so the common edit is "change one word and save".
 */
export function FeedPlanForm({
  horseId,
  current,
}: {
  horseId: string;
  current: FeedPlan[];
}) {
  const [state, formAction, pending] = useActionState(saveFeedPlan, EMPTY);
  const [first] = current;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="horse_id" value={horseId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-meal" className="text-sm font-medium">
          Meal
        </label>
        <select id="plan-meal" name="meal" defaultValue={first?.meal ?? "am"} className={FIELD}>
          {MEALS.map((meal) => (
            <option key={meal} value={meal}>
              {MEAL_LABELS[meal]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-description" className="text-sm font-medium">
          Feed
        </label>
        <input
          id="plan-description"
          name="description"
          required
          placeholder="2 scoops senior, 1 flake alfalfa"
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-supplements" className="text-sm font-medium">
          Supplements <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <input id="plan-supplements" name="supplements" className={FIELD} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-instructions" className="text-sm font-medium">
          Special instructions <span className="font-normal text-brand-ink/50">(optional)</span>
        </label>
        <textarea
          id="plan-instructions"
          name="special_instructions"
          rows={2}
          placeholder="Soak 10 minutes. Feed alone."
          className="rounded-xl border border-brand-ink/20 bg-white p-3 text-base"
        />
        <p className="text-xs text-brand-ink/55">
          This is the line that gets highlighted on the feed board.
        </p>
      </div>

      <Feedback state={state} />

      <button type="submit" disabled={pending} className={SUBMIT}>
        {pending ? "Saving…" : "Save feed chart"}
      </button>
    </form>
  );
}
