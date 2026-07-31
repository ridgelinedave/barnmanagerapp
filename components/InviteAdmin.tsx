"use client";

import { useActionState, useId, useState } from "react";
import {
  createInvite,
  regenerateInvite,
  revokeInvite,
  type InviteState,
} from "@/app/(app)/manage/team/invite-actions";
import { Button } from "@/components/ui/Button";
import { Field, FormFeedback, Input, Select } from "@/components/ui/Field";
import { Callout, Chip, ChipRow, Sunk } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import {
  INVITE_LIFETIME_DAYS,
  INVITE_STATUS_LABELS,
  inviteShareText,
  invitePath,
  inviteStatus,
  type Invite,
} from "@/lib/invites";
import {
  PERMISSION_FLAGS,
  PERMISSION_FLAG_LABELS,
  ROLES,
  type Family,
  type Role,
} from "@/lib/types";

const EMPTY: InviteState = { error: null, message: null };

const ROLE_LABELS: Record<Role, string> = { admin: "Admin", staff: "Staff", parent: "Parent" };

/**
 * Inviting someone.
 *
 * Same role/family/flags rules as the rest of the Team panel, and the same
 * reason for them: an admin holds every permission implicitly and a parent
 * holds none, so the flag checkboxes only exist for staff. The form does not
 * grey them out for the other roles — it does not render them, because a
 * disabled checkbox still reads as "a thing you could have".
 */
export function InviteForm({ families }: { families: Family[] }) {
  const [state, formAction, pending] = useActionState(createInvite, EMPTY);
  const [role, setRole] = useState<Role>("parent");
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Their name" htmlFor={`${id}-name`} hint="What they'll see on the invite.">
        <Input id={`${id}-name`} name="full_name" required autoComplete="off" />
      </Field>

      <Field label="Role" htmlFor={`${id}-role`}>
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
          hint="Which household this login belongs to. Without it they'll see an empty app."
        >
          <Select id={`${id}-family`} name="family_id" defaultValue="">
            <option value="">Not set yet</option>
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {role === "staff" && (
        <div className="flex flex-col gap-2">
          <p className="text-label font-medium text-ink">What they can manage</p>
          {PERMISSION_FLAGS.map((flag) => (
            <label
              key={flag}
              className="flex min-h-12 items-center gap-3 rounded-control border border-line bg-surface px-3"
            >
              <input
                type="checkbox"
                name={flag}
                className="size-5 shrink-0 accent-[var(--brand-gold-deep)]"
              />
              <span className="text-body text-ink">{PERMISSION_FLAG_LABELS[flag]}</span>
            </label>
          ))}
          <p className="text-caption text-muted">
            Leave all three unticked for someone who only needs to see the day and clock in.
          </p>
        </div>
      )}

      {role === "admin" && (
        <Callout tone="gold" icon="alert">
          An admin can see and change everything, including inviting other admins and removing
          your own access. Only send this to someone who runs the barn.
        </Callout>
      )}

      <Field
        label="Their email"
        htmlFor={`${id}-email`}
        optional
        hint="If you leave it blank they'll choose one when they set up their login."
      >
        <Input id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="off" />
      </Field>

      <Field label="Their phone" htmlFor={`${id}-phone`} optional>
        <Input id={`${id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="off" />
      </Field>

      <FormFeedback error={state.error} message={state.message} />

      <Button type="submit" variant="primary" block disabled={pending}>
        {pending ? "Creating…" : "Create invite link"}
      </Button>

      <p className="text-caption text-muted">
        No email is sent. You&apos;ll get a link to share however you like, good for{" "}
        {INVITE_LIFETIME_DAYS} days.
      </p>
    </form>
  );
}

/**
 * One invite in the pending list.
 *
 * The link is a bearer credential — whoever holds it can create an account with
 * the role written on it — so it gets the same treatment as the calendar URL:
 * shown in full so it can be checked, with the consequence said out loud, and
 * revocable in one tap.
 */
export function InviteRow({
  invite,
  familyName,
  barnName,
}: {
  invite: Invite;
  familyName: string | null;
  barnName: string;
}) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const status = inviteStatus(invite);

  // Built in the browser so the link carries whatever host the barn actually
  // uses, rather than one baked in at build time.
  const url =
    typeof window === "undefined"
      ? invitePath(invite.token)
      : `${window.location.origin}${invitePath(invite.token)}`;

  async function copy(what: "link" | "message") {
    const text =
      what === "link"
        ? url
        : inviteShareText({
            fullName: invite.full_name,
            barnName,
            url,
            expiresAt: invite.expires_at,
          });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      // A silently-failing copy button is worse than none: fall back to
      // selecting the text so it can be copied by hand.
      window.prompt("Copy this:", text);
    }
  }

  const tone =
    status === "pending" ? "gold" : status === "accepted" ? "forest" : "neutral";

  return (
    <Sunk className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <p className="min-w-0 flex-1 font-display text-heading leading-snug text-ink">
          {invite.full_name}
        </p>
        <Chip
          value={INVITE_STATUS_LABELS[status]}
          tone={tone}
          icon={status === "accepted" ? "check" : status === "pending" ? "clock" : "alert"}
        />
      </div>

      <ChipRow>
        <Chip label="Role" value={ROLE_LABELS[invite.role]} />
        {familyName && <Chip label="Family" value={familyName} />}
        {PERMISSION_FLAGS.filter((flag) => invite[flag]).map((flag) => (
          <Chip key={flag} value={PERMISSION_FLAG_LABELS[flag]} icon="check" tone="forest" />
        ))}
      </ChipRow>

      <p className="text-caption text-muted">
        {invite.email ? `${invite.email} · ` : ""}
        {status === "accepted"
          ? "They've set up their login."
          : status === "pending"
            ? `Expires ${new Date(invite.expires_at).toLocaleDateString()}`
            : `Expired ${new Date(invite.expires_at).toLocaleDateString()}`}
      </p>

      {status === "pending" && (
        <>
          {/* break-all, not truncate: a token you cannot read is a token you
              cannot check against the one you pasted into a text. */}
          <div className="rounded-control border border-line bg-surface p-2.5">
            <p className="break-all text-caption text-ink">{url}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button type="button" variant="primary" block onClick={() => copy("link")}>
              {copied === "link" ? "Copied" : "Copy link"}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => copy("message")}>
              {copied === "message" ? "Copied" : "Copy a message to send"}
            </Button>
          </div>

          <p className="text-caption text-muted">
            Anyone with this link can create a {ROLE_LABELS[invite.role].toLowerCase()} account.
            Send it to one person, and revoke it if it goes astray.
          </p>
        </>
      )}

      {status !== "accepted" && (
        <div className="flex gap-2">
          <form action={regenerateInvite} className="flex-1">
            <input type="hidden" name="id" value={invite.id} />
            <Button type="submit" variant="secondary" block>
              <Icon name="plus" className="size-4" strokeWidth={2} />
              New link
            </Button>
          </form>
          {status === "pending" && (
            <form action={revokeInvite} className="flex-1">
              <input type="hidden" name="id" value={invite.id} />
              <Button type="submit" variant="danger" block>
                Revoke
              </Button>
            </form>
          )}
        </div>
      )}
    </Sunk>
  );
}
