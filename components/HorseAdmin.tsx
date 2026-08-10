"use client";

import { useActionState } from "react";
import {
  assignRider,
  createHorse,
  saveFeedPlan,
  updateHorse,
  type HorseAdminState,
} from "@/app/(app)/manage/horses/actions";
import { Button } from "@/components/ui/Button";
import { FormFeedback } from "@/components/ui/Field";
import {
  HORSE_SEXES,
  HORSE_SEX_LABELS,
  MEALS,
  MEAL_LABELS,
  type FeedPlan,
  type Horse,
} from "@/lib/types";

const EMPTY: HorseAdminState = { error: null, message: null };

const FIELD = "min-h-12 w-full rounded-control border border-line bg-surface px-3 text-body text-ink";

function Feedback({ state }: { state: HorseAdminState }) {
  return <FormFeedback error={state.error} message={state.message} />;
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
        <label htmlFor="horse-name" className="text-label font-medium text-ink">
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
        <label htmlFor="horse-barn-name" className="text-label font-medium text-ink">
          Barn name <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="horse-barn-name"
          name="barn_name"
          defaultValue={horse?.barn_name ?? ""}
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-owner" className="text-label font-medium text-ink">
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
        <p className="text-caption text-muted">
          The owning family can read this horse&apos;s full record and feed chart. Everyone else
          sees only the name and photo, and only if their rider rides it.
        </p>
      </div>

      {/*
       * Colour, sex and height — the three facts that identify a horse in an
       * aisle, and the line the feed board reads. Colour and height sit on one
       * row because they are short and they are read together ("bay, 16.2").
       */}
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="horse-colour" className="text-label font-medium text-ink">
            Colour <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="horse-colour"
            name="colour"
            placeholder="Bay"
            defaultValue={horse?.colour ?? ""}
            className={FIELD}
          />
        </div>

        <div className="flex w-28 shrink-0 flex-col gap-1.5">
          <label htmlFor="horse-height" className="text-label font-medium text-ink">
            Height
          </label>
          <input
            id="horse-height"
            name="height_hands"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            max="29.3"
            placeholder="16.2"
            defaultValue={horse?.height_hands ?? ""}
            className={FIELD}
          />
        </div>
      </div>
      {/* Said once, here, because "16.2 hands" surprises people who expect
          decimals to be fractions. The database enforces it either way. */}
      <p className="-mt-1.5 text-caption text-muted">
        Height in hands — the decimal is inches, so 16.2 is sixteen hands two inches.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-sex" className="text-label font-medium text-ink">
          Sex <span className="font-normal text-muted">(optional)</span>
        </label>
        <select id="horse-sex" name="sex" defaultValue={horse?.sex ?? ""} className={FIELD}>
          <option value="">Not set</option>
          {HORSE_SEXES.map((sex) => (
            <option key={sex} value={sex}>
              {HORSE_SEX_LABELS[sex]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-breed" className="text-label font-medium text-ink">
          Breed <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="horse-breed"
          name="breed"
          placeholder="Thoroughbred"
          defaultValue={horse?.breed ?? ""}
          className={FIELD}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="horse-dob" className="text-label font-medium text-ink">
          Date of birth <span className="font-normal text-muted">(optional)</span>
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
        <label htmlFor="horse-notes" className="text-label font-medium text-ink">
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="horse-notes"
          name="notes"
          rows={3}
          defaultValue={horse?.notes ?? ""}
          className="w-full rounded-control border border-line bg-surface p-3 text-body text-ink"
        />
      </div>

      {horse && (
        <label className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3">
          <input
            type="checkbox"
            name="active"
            defaultChecked={horse.active}
            className="size-5 accent-[var(--accent)]"
          />
          <span className="text-base">In work at the barn</span>
        </label>
      )}

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : horse ? "Save changes" : "Add horse"}
      </Button>
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
      <p className="text-caption text-muted">
        Every rider is already assigned to this horse.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="horse_id" value={horseId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="assign-rider" className="text-label font-medium text-ink">
          Add a rider
        </label>
        <select id="assign-rider" name="rider_id" required className={FIELD}>
          {riders.map((rider) => (
            <option key={rider.id} value={rider.id}>
              {rider.name}
            </option>
          ))}
        </select>
        <p className="text-caption text-muted">
          Their family will see this horse&apos;s name and photo — never the breed, notes or feed
          chart.
        </p>
      </div>

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Assigning…" : "Assign rider"}
      </Button>
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
        <label htmlFor="plan-meal" className="text-label font-medium text-ink">
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
        <label htmlFor="plan-description" className="text-label font-medium text-ink">
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
        <label htmlFor="plan-supplements" className="text-label font-medium text-ink">
          Supplements <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="plan-supplements" name="supplements" className={FIELD} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-instructions" className="text-label font-medium text-ink">
          Special instructions <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="plan-instructions"
          name="special_instructions"
          rows={2}
          placeholder="Soak 10 minutes. Feed alone."
          className="w-full rounded-control border border-line bg-surface p-3 text-body text-ink"
        />
        <p className="text-caption text-muted">
          This is the line that gets highlighted on the feed board.
        </p>
      </div>

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Save feed chart"}
      </Button>
    </form>
  );
}
