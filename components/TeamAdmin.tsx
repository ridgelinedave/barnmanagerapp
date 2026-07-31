"use client";

import { useActionState, useId, useState } from "react";
import {
  createFamily,
  createLevel,
  createRider,
  moveLevel,
  togglePermission,
  updateFamily,
  updateLevel,
  updatePersonDetails,
  updatePersonRole,
  updateRider,
  type TeamState,
} from "@/app/(app)/manage/team/actions";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input, Select, Textarea } from "@/components/ui/Field";
import { Callout, Chip, ChipRow, Sunk } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import {
  PERMISSION_FLAGS,
  PERMISSION_FLAG_LABELS,
  ROLES,
  type Family,
  type Level,
  type PermissionFlag,
  type Rider,
  type Role,
} from "@/lib/types";
import type { TeamMember } from "@/lib/team";

const EMPTY: TeamState = { error: null, message: null };

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  staff: "Staff",
  parent: "Parent",
};

/** What each role actually gets, said in one line so a role change is an informed one. */
const ROLE_EXPLAINS: Record<Role, string> = {
  admin: "Runs the barn. Sees and can change everything, including who is on this screen.",
  staff: "Works the barn. Sees every family and horse; can only change what is ticked below.",
  parent: "A family's login. Sees their own riders, lessons and paperwork, and nothing else.",
};

function Feedback({ state }: { state: TeamState }) {
  return <FormFeedback error={state.error} message={state.message} />;
}

/* ========================================================================== */
/* Section A — People                                                          */
/* ========================================================================== */

/**
 * One permission flag as a self-submitting toggle.
 *
 * A plain form per flag rather than one big save: these decide who can rewrite
 * the schedule, and a control that takes effect on its own is easier to reason
 * about — and to undo — than a form where three unrelated changes ride along
 * with the one you meant.
 */
function PermissionToggle({
  personId,
  flag,
  on,
}: {
  personId: string;
  flag: PermissionFlag;
  on: boolean;
}) {
  return (
    <form action={togglePermission}>
      <input type="hidden" name="id" value={personId} />
      <input type="hidden" name="flag" value={flag} />
      <input type="hidden" name="value" value={on ? "off" : "on"} />
      <button
        type="submit"
        aria-pressed={on}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-chip border px-3 text-caption font-semibold ${
          on
            ? "border-forest/25 bg-forest-soft text-forest"
            : "border-line bg-surface text-muted"
        }`}
      >
        <Icon name={on ? "check" : "plus"} className="size-3.5 shrink-0" strokeWidth={2} />
        {PERMISSION_FLAG_LABELS[flag]}
      </button>
    </form>
  );
}

function PersonDetailsForm({ person }: { person: TeamMember }) {
  const [state, formAction, pending] = useActionState(updatePersonDetails, EMPTY);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={person.id} />

      <Field label="Name" htmlFor={`${id}-name`}>
        <Input
          id={`${id}-name`}
          name="full_name"
          defaultValue={person.full_name ?? ""}
          autoComplete="name"
        />
      </Field>

      <Field label="Phone" htmlFor={`${id}-phone`} optional>
        <Input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={person.phone ?? ""}
        />
      </Field>

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}

/**
 * Change a role, and the family link that has to move with it.
 *
 * The database requires family_id to be null unless the role is 'parent', so
 * the family picker appears and disappears with the role rather than sitting
 * there greyed out — and the action clears the link in the same update, which
 * is the only order the constraint will accept.
 */
function PersonRoleForm({
  person,
  families,
  isOnlyAdmin,
}: {
  person: TeamMember;
  families: Family[];
  isOnlyAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState(updatePersonRole, EMPTY);
  const [role, setRole] = useState<Role>(person.role);
  const id = useId();

  const leavingLastAdmin = isOnlyAdmin && person.role === "admin" && role !== "admin";
  const losingFamily = person.role === "parent" && role !== "parent" && person.family_id !== null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={person.id} />
      <input type="hidden" name="current_role" value={person.role} />

      <Field label="Role" htmlFor={`${id}-role`} hint={ROLE_EXPLAINS[role]}>
        <Select
          id={`${id}-role`}
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
        >
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      {role === "parent" && (
        <Field
          label="Family"
          htmlFor={`${id}-family`}
          optional
          hint="A parent sees their family's riders, lessons and paperwork. Leave unset until you know which family."
        >
          <Select id={`${id}-family`} name="family_id" defaultValue={person.family_id ?? ""}>
            <option value="">Not set yet</option>
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {losingFamily && (
        <Callout tone="gold" icon="alert">
          Staff and admins do not belong to a family, so this will also unlink{" "}
          {person.full_name ?? "them"} from {person.familyName ?? "their family"}. Their
          family&apos;s riders and paperwork stay exactly as they are.
        </Callout>
      )}

      {leavingLastAdmin && (
        <Callout tone="danger" icon="alert">
          This is the barn&apos;s only admin. Make someone else an admin first — otherwise
          there is nobody left who can.
        </Callout>
      )}

      <Feedback state={state} />

      <Button
        type="submit"
        variant="primary"
        block
        disabled={pending || leavingLastAdmin || role === person.role}
      >
        {pending ? "Saving…" : role === person.role ? "Role unchanged" : `Make ${ROLE_LABELS[role].toLowerCase()}`}
      </Button>
    </form>
  );
}

export function PersonSheetBody({
  person,
  families,
  isOnlyAdmin,
}: {
  person: TeamMember;
  families: Family[];
  isOnlyAdmin: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <PersonDetailsForm person={person} />

      <Sunk className="flex flex-col gap-3">
        <h3 className="font-display text-heading text-ink">Role</h3>
        <PersonRoleForm person={person} families={families} isOnlyAdmin={isOnlyAdmin} />
      </Sunk>
    </div>
  );
}

/** The flag row on a person card. Admin gets a statement of fact, not empty boxes. */
export function PermissionRow({ person }: { person: TeamMember }) {
  if (person.role === "admin") {
    return (
      <ChipRow>
        <Chip value="All permissions included with admin" icon="check" tone="forest" />
      </ChipRow>
    );
  }

  if (person.role === "parent") return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PERMISSION_FLAGS.map((flag) => (
        <PermissionToggle key={flag} personId={person.id} flag={flag} on={person[flag]} />
      ))}
    </div>
  );
}

/* ========================================================================== */
/* Section B — Families and riders                                             */
/* ========================================================================== */

export function FamilyForm({ family }: { family?: Family }) {
  const [state, formAction, pending] = useActionState(
    family ? updateFamily : createFamily,
    EMPTY,
  );
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {family && <input type="hidden" name="id" value={family.id} />}

      <Field
        label="Family name"
        htmlFor={`${id}-name`}
        hint="However the barn says it out loud — usually the surname."
      >
        <Input id={`${id}-name`} name="name" required defaultValue={family?.name ?? ""} />
      </Field>

      <Field label="Notes" htmlFor={`${id}-notes`} optional>
        <Textarea id={`${id}-notes`} name="notes" defaultValue={family?.notes ?? ""} />
      </Field>

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : family ? "Save family" : "Add family"}
      </Button>
    </form>
  );
}

/**
 * Add or edit a rider.
 *
 * There is no age field, deliberately: age is worked out from the date of
 * birth every time it is shown, so it can never go stale. Typing "12" into a
 * box makes that rider twelve forever.
 */
export function RiderForm({
  familyId,
  rider,
  levels,
}: {
  familyId: string;
  rider?: Rider;
  levels: Level[];
}) {
  const [state, formAction, pending] = useActionState(rider ? updateRider : createRider, EMPTY);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="family_id" value={familyId} />
      {rider && <input type="hidden" name="id" value={rider.id} />}

      <Field label="Rider name" htmlFor={`${id}-name`}>
        <Input id={`${id}-name`} name="name" required defaultValue={rider?.name ?? ""} />
      </Field>

      <Field
        label="Date of birth"
        htmlFor={`${id}-dob`}
        optional
        hint="Sets the age group. Nothing shows an age group without it."
      >
        <Input id={`${id}-dob`} name="dob" type="date" defaultValue={rider?.dob ?? ""} />
      </Field>

      <Field
        label="Level"
        htmlFor={`${id}-level`}
        optional
        hint="Decides which lessons this rider can be offered when a seat opens up."
      >
        <Select id={`${id}-level`} name="level_id" defaultValue={rider?.level_id ?? ""}>
          <option value="">Not set yet</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Photo URL" htmlFor={`${id}-photo`} optional>
        <Input
          id={`${id}-photo`}
          name="photo_url"
          type="url"
          inputMode="url"
          defaultValue={rider?.photo_url ?? ""}
        />
      </Field>

      <Field label="Notes" htmlFor={`${id}-notes`} optional>
        <Textarea id={`${id}-notes`} name="notes" defaultValue={rider?.notes ?? ""} />
      </Field>

      {rider && (
        <label className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3">
          <input
            type="checkbox"
            name="active"
            defaultChecked={rider.active}
            className="size-5 shrink-0 accent-[var(--brand-gold-deep)]"
          />
          <span className="text-body text-ink">Riding at the barn</span>
        </label>
      )}

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : rider ? "Save rider" : "Add rider"}
      </Button>
    </form>
  );
}

/* ========================================================================== */
/* Section C — Levels                                                          */
/* ========================================================================== */

export function LevelForm({ level }: { level?: Level }) {
  const [state, formAction, pending] = useActionState(level ? updateLevel : createLevel, EMPTY);
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {level && <input type="hidden" name="id" value={level.id} />}
      <input type="hidden" name="sort" value={level?.sort ?? 0} />

      <Field
        label="Level name"
        htmlFor={`${id}-name`}
        hint="What Belle calls it on the whiteboard — Intro, Training, First."
      >
        <Input id={`${id}-name`} name="name" required defaultValue={level?.name ?? ""} />
      </Field>

      <Feedback state={state} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Saving…" : level ? "Save level" : "Add level"}
      </Button>
    </form>
  );
}

/** Up/down nudges. Hidden from screen readers at the ends rather than left dead. */
export function LevelOrder({
  level,
  isFirst,
  isLast,
}: {
  level: Level;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {(["up", "down"] as const).map((direction) => {
        const disabled = direction === "up" ? isFirst : isLast;
        return (
          <form key={direction} action={moveLevel}>
            <input type="hidden" name="id" value={level.id} />
            <input type="hidden" name="direction" value={direction} />
            <button
              type="submit"
              disabled={disabled}
              aria-label={`Move ${level.name} ${direction}`}
              className="flex size-11 items-center justify-center rounded-control border border-line bg-surface text-ink disabled:opacity-35"
            >
              <Icon
                name="chevron"
                className={`size-4 ${direction === "up" ? "-rotate-90" : "rotate-90"}`}
                strokeWidth={2}
              />
            </button>
          </form>
        );
      })}
    </div>
  );
}
