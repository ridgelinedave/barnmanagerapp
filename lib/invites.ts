import type { PermissionFlag, Role } from "@/lib/types";

/**
 * Invite rules that are the PRODUCT's, not the barn's.
 *
 * Deliberately not in config/barn.ts. That file is for facts that change when
 * you clone the app for a different barn — the name, the colours, the
 * timezone, the lesson durations. How long an invite link stays valid is not
 * one of those; it is a decision about this software, and a second barn should
 * inherit it rather than be asked about it.
 *
 * No "server-only" here: the status helpers and the copy below are needed by
 * the client components that render the pending list.
 */

/**
 * Fourteen days.
 *
 * Long enough that an invite handed over on a Saturday still works after a
 * fortnight of a busy barn ignoring it; short enough that a link forwarded into
 * a group chat and forgotten does not stay a live account-creation credential
 * for a year. Regenerating resets it, so an expired invite costs one tap.
 */
export const INVITE_LIFETIME_DAYS = 14;

export function inviteExpiryFrom(now: Date = new Date()): string {
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + INVITE_LIFETIME_DAYS);
  return expires.toISOString();
}

export type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

export type Invite = {
  id: string;
  created_at: string;
  token: string;
  role: Role;
  family_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  manage_shows: boolean;
  manage_schedule: boolean;
  manage_horses: boolean;
  created_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

/**
 * Status is DERIVED, never stored.
 *
 * A stored status would be wrong the moment an invite expired without anyone
 * touching the row — and "expired" is the one status that arrives on its own,
 * with no write to trigger an update. Order matters: an accepted invite stays
 * accepted even after its expiry passes, because it was used.
 */
export function inviteStatus(
  invite: Pick<Invite, "accepted_at" | "revoked_at" | "expires_at">,
  now: Date = new Date(),
): InviteStatus {
  if (invite.accepted_at) return "accepted";
  if (invite.revoked_at) return "revoked";
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return "expired";
  return "pending";
}

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  pending: "Waiting to be used",
  accepted: "Signed up",
  expired: "Expired",
  revoked: "Revoked",
};

/**
 * The ONE thing a claimant is ever told about a bad token.
 *
 * Expired, revoked, already used and never-existed all get this exact string.
 * Distinguishing them would confirm that a guessed token was real — and telling
 * someone "that invite was already used" tells them an account exists to
 * attack. There is nothing here for a person with a genuine invite to lose:
 * their answer is the same in every case.
 */
export const INVITE_INVALID_MESSAGE =
  "This invite link is no longer valid — ask the barn for a new one.";

/** The link an admin copies. Relative, so it works on any host. */
export function invitePath(token: string): string {
  return `/invite/${token}`;
}

/**
 * The message an admin can paste into a text.
 *
 * Written to be forwarded as-is by someone who is holding a horse in the other
 * hand: what it is, who it is from, what to do, and when it stops working.
 */
export function inviteShareText(params: {
  fullName: string;
  barnName: string;
  url: string;
  expiresAt: string;
}): string {
  const expires = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(params.expiresAt));

  return (
    `Hi ${params.fullName} — here's your link to set up your ${params.barnName} account:\n\n` +
    `${params.url}\n\n` +
    `You'll pick your own password. The link works until ${expires}.`
  );
}

/** The flags that actually mean something for this role. */
export function effectiveFlags(
  role: Role,
  flags: Record<PermissionFlag, boolean>,
): Record<PermissionFlag, boolean> {
  // Admin holds everything implicitly and parents hold nothing — storing
  // anything else would be a value the app then has to remember to ignore.
  if (role !== "staff") {
    return { manage_shows: false, manage_schedule: false, manage_horses: false };
  }
  return flags;
}
