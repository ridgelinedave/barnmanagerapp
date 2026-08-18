"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input, Select, Textarea } from "@/components/ui/Field";
import { Sunk } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import {
  createSupplyItem,
  setSupplyStatus,
  type SupplyState,
} from "@/app/(app)/barn/supplies/actions";
import { markWaterChecked, type WaterState } from "@/app/(app)/barn/water/actions";
import {
  createMaintenanceRequest,
  setMaintenanceStatus,
  type MaintenanceState,
} from "@/app/(app)/barn/maintenance/actions";
import { saveBlanketPlan, type PlanState } from "@/app/(app)/barn/blanketing/actions";
import { saveTurnoutPlan, type TurnoutState } from "@/app/(app)/barn/turnout/actions";
import {
  MAINTENANCE_PRIORITIES,
  TURNOUT_PATTERNS,
  TURNOUT_PATTERN_LABELS,
  type BlanketPlan,
  type BlanketRule,
  type Family,
  type TurnoutPlan,
} from "@/lib/types";

const EMPTY = { error: null, message: null };

/* -------------------------------------------------------------------------- */
/* Supplies                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Add an item. "Staff can add fast" was the ask, so the form opens on the two
 * fields that matter — what, and whose — and everything else is optional and
 * below.
 *
 * The family select only appears for a boarder item, because a barn item with
 * a family attached is a state the CHECK constraint refuses; hiding the field
 * is cheaper than explaining the error.
 */
export function SupplyAddForm({ families }: { families: Family[] }) {
  const [state, formAction, pending] = useActionState<SupplyState, FormData>(
    createSupplyItem,
    EMPTY,
  );
  const [scope, setScope] = useState<"barn" | "boarder">("barn");
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="What is running out" htmlFor={`${id}-name`}>
        <Input id={`${id}-name`} name="name" required placeholder="Shavings" />
      </Field>

      <Field label="Whose supply" htmlFor={`${id}-scope`}>
        <Select
          id={`${id}-scope`}
          name="scope"
          value={scope}
          onChange={(event) => setScope(event.target.value as "barn" | "boarder")}
        >
          <option value="barn">Crouse supply</option>
          <option value="boarder">Boarder supply</option>
        </Select>
      </Field>

      {scope === "boarder" && (
        <>
          <Field
            label="Which family"
            htmlFor={`${id}-family`}
            hint="They are notified as soon as you add this."
          >
            <Select id={`${id}-family`} name="family_id" required>
              <option value="">Choose a family</option>
              {families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Field label="How many" htmlFor={`${id}-qty`} optional>
            <Input id={`${id}-qty`} name="quantity" inputMode="decimal" placeholder="2" />
          </Field>
        </div>
        <div className="min-w-0 flex-1">
          <Field label="Unit" htmlFor={`${id}-unit`} optional>
            <Input id={`${id}-unit`} name="unit" placeholder="bags" />
          </Field>
        </div>
      </div>

      <Field
        label="Tell me when it drops to"
        htmlFor={`${id}-threshold`}
        optional
        hint="Leave blank if you would rather just mark it needed."
      >
        <Input id={`${id}-threshold`} name="reorder_threshold" inputMode="decimal" />
      </Field>

      <Field label="Category" htmlFor={`${id}-category`} optional>
        <Input id={`${id}-category`} name="category" placeholder="Bedding" />
      </Field>

      <Field label="Notes" htmlFor={`${id}-notes`} optional>
        <Textarea id={`${id}-notes`} name="notes" rows={2} />
      </Field>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Adding…" : "Add to the list"}
      </Button>
    </form>
  );
}

/** Move an item along. One button per next step, so nothing needs a menu. */
export function SupplyStatusButton({
  id,
  next,
  label,
}: {
  id: string;
  next: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<SupplyState, FormData>(
    setSupplyStatus,
    EMPTY,
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 shrink-0 rounded-control border border-line px-3 text-caption font-semibold text-accent-text disabled:opacity-50"
      >
        {pending ? "…" : label}
      </button>
      {state.error && <span className="sr-only">{state.error}</span>}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Water                                                                       */
/* -------------------------------------------------------------------------- */

export function CheckedNowButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<WaterState, FormData>(
    markWaterChecked,
    EMPTY,
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" arrow={false} disabled={pending}>
        {pending ? "Saving…" : "Checked now"}
      </Button>
      {state.error && <span className="sr-only">{state.error}</span>}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Maintenance                                                                 */
/* -------------------------------------------------------------------------- */

export function MaintenanceAddForm() {
  const [state, formAction, pending] = useActionState<MaintenanceState, FormData>(
    createMaintenanceRequest,
    EMPTY,
  );
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="What is broken" htmlFor={`${id}-title`}>
        <Input id={`${id}-title`} name="title" required placeholder="Arena gate latch" />
      </Field>

      <Field label="Anything else worth knowing" htmlFor={`${id}-desc`} optional>
        <Textarea id={`${id}-desc`} name="description" rows={3} />
      </Field>

      <Field label="How urgent" htmlFor={`${id}-priority`}>
        <Select id={`${id}-priority`} name="priority" defaultValue="normal">
          {MAINTENANCE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p === "low" ? "When you get to it" : p === "high" ? "Urgent" : "Normal"}
            </option>
          ))}
        </Select>
      </Field>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Logging…" : "Log it"}
      </Button>
    </form>
  );
}

export function MaintenanceStatusButton({
  id,
  next,
  label,
}: {
  id: string;
  next: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<MaintenanceState, FormData>(
    setMaintenanceStatus,
    EMPTY,
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 shrink-0 rounded-control border border-line px-3 text-caption font-semibold text-accent-text disabled:opacity-50"
      >
        {pending ? "…" : label}
      </button>
      {/* role=alert rather than sr-only: "you do not have permission" is the
          one outcome here a person must actually be told about. */}
      {state.error && (
        <p role="alert" className="w-full text-caption text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Blanketing                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The rule list is held in React state and posted as ONE JSON string, the same
 * choice FormTemplateEditor made — indexed input names have to be renamed on
 * every reorder, and that is where an off-by-one loses a rule.
 */
export function BlanketPlanForm({
  horseId,
  horseName,
  plan,
}: {
  horseId: string;
  horseName: string;
  plan: BlanketPlan | null;
}) {
  const [state, formAction, pending] = useActionState<PlanState, FormData>(
    saveBlanketPlan,
    EMPTY,
  );
  const [rules, setRules] = useState<BlanketRule[]>(plan?.blanket_rules ?? []);
  const id = useId();

  const patch = (index: number, next: Partial<BlanketRule>) =>
    setRules((current) => current.map((r, i) => (i === index ? { ...r, ...next } : r)));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="horse_id" value={horseId} />
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />

      <p className="text-caption text-muted">
        What {horseName} wears, by temperature. The barn reads the forecast; nothing here does
        it automatically yet.
      </p>

      <div className="flex flex-col gap-2">
        {rules.map((rule, index) => (
          <Sunk key={index} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`${id}-min-${index}`}
                  className="text-label font-medium text-ink"
                >
                  Above (F)
                </label>
                <Input
                  id={`${id}-min-${index}`}
                  inputMode="numeric"
                  value={rule.min_f ?? ""}
                  onChange={(e) =>
                    patch(index, { min_f: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className="mt-1.5"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`${id}-max-${index}`}
                  className="text-label font-medium text-ink"
                >
                  Below (F)
                </label>
                <Input
                  id={`${id}-max-${index}`}
                  inputMode="numeric"
                  value={rule.max_f ?? ""}
                  onChange={(e) =>
                    patch(index, { max_f: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <label htmlFor={`${id}-layer-${index}`} className="text-label font-medium text-ink">
                What goes on
              </label>
              <Input
                id={`${id}-layer-${index}`}
                value={rule.layer}
                onChange={(e) => patch(index, { layer: e.target.value })}
                placeholder="Medium blanket"
                className="mt-1.5"
              />
            </div>

            <button
              type="button"
              onClick={() => setRules((c) => c.filter((_, i) => i !== index))}
              className="flex min-h-11 items-center gap-1.5 self-start rounded-control border border-danger/35 px-3 text-caption font-semibold text-danger"
            >
              <Icon name="plus" className="size-4 rotate-45" strokeWidth={2} />
              Remove
            </button>
          </Sunk>
        ))}

        <Button
          type="button"
          variant="secondary"
          block
          arrow={false}
          icon="plus"
          onClick={() => setRules((c) => [...c, { min_f: null, max_f: null, layer: "" }])}
        >
          Add a temperature rule
        </Button>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-medium text-ink">Fly gear</legend>
        {(
          [
            ["fly_mask", "Fly mask", plan?.fly_mask],
            ["fly_sheet", "Fly sheet", plan?.fly_sheet],
            ["fly_spray", "Fly spray", plan?.fly_spray],
          ] as const
        ).map(([name, label, checked]) => (
          <label
            key={name}
            className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3"
          >
            <input
              type="checkbox"
              name={name}
              defaultChecked={Boolean(checked)}
              className="size-5 shrink-0 accent-[var(--accent)]"
            />
            <span className="text-body text-ink">{label}</span>
          </label>
        ))}
      </fieldset>

      <Field label="Notes" htmlFor={`${id}-notes`} optional>
        <Textarea id={`${id}-notes`} name="notes" rows={2} defaultValue={plan?.notes ?? ""} />
      </Field>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Save plan"}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Turnout                                                                     */
/* -------------------------------------------------------------------------- */

export function TurnoutPlanForm({
  horseId,
  plan,
}: {
  horseId: string;
  plan: TurnoutPlan | null;
}) {
  const [state, formAction, pending] = useActionState<TurnoutState, FormData>(
    saveTurnoutPlan,
    EMPTY,
  );
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="horse_id" value={horseId} />

      <Field label="Paddock or field" htmlFor={`${id}-paddock`}>
        <Input id={`${id}-paddock`} name="paddock" defaultValue={plan?.paddock ?? ""} />
      </Field>

      <Field label="Group" htmlFor={`${id}-group`} optional hint="Who they go out with.">
        <Input id={`${id}-group`} name="turnout_group" defaultValue={plan?.turnout_group ?? ""} />
      </Field>

      <Field label="When" htmlFor={`${id}-pattern`}>
        <Select id={`${id}-pattern`} name="pattern" defaultValue={plan?.pattern ?? "daily"}>
          {TURNOUT_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {TURNOUT_PATTERN_LABELS[p]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Notes" htmlFor={`${id}-notes`} optional>
        <Textarea id={`${id}-notes`} name="notes" rows={2} defaultValue={plan?.notes ?? ""} />
      </Field>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Save turnout"}
      </Button>
    </form>
  );
}
