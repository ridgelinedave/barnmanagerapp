"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { effectiveFlags, inviteExpiryFrom } from "@/lib/invites";
import { featureEnabled } from "@/config/barn";
import { isRole, PERMISSION_FLAGS, type Role } from "@/lib/types";

/**
 * Creating, revoking and regenerating invites.
 *
 * Kept in its own file rather than folded into actions.ts because this is the
 * only part of the Team panel that can manufacture a login. It runs on the
 * caller's own session against the admin-only policies from migration 0017 —
 * the `role === 'admin'` checks here produce a readable sentence rather than a
 * silent zero-row write.
 *
 * NOTE none of this uses the service role. Minting an invite is an ordinary
 * admin write. The service role appears exactly once in this slice, in the
 * claim route, where there is no session to run as.
 */
export type InviteState = { error: string | null; message: string | null };

const OK = (message: string): InviteState => ({ error: null, message });
const FAIL = (error: string): InviteState => ({ error, message: null });

const DENIED = "Only an admin can invite someone.";
const OFF = "Invites are not switched on yet.";

async function requireAdmin() {
  if (!featureEnabled("invites")) return null;
  const state = await getViewer();
  if (state.status !== "viewer") return null;
  return state.viewer.role === "admin" ? state.viewer : null;
}

function revalidate() {
  revalidatePath("/manage/team");
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function readable(message: string): string {
  if (message.includes("invites_family_only_for_parents")) {
    return "Only a parent invite can carry a family. Clear the family for a staff or admin invite.";
  }
  if (message.includes("invites_flags_only_for_staff")) {
    return "Parents do not hold permission flags.";
  }
  if (message.includes("invites_full_name_not_blank")) {
    return "Give the person a name — it is what they will see on the invite.";
  }
  if (message.includes("does not exist") || message.includes("schema cache")) {
    return "The invites table is not there yet — migration 0017 has not been applied.";
  }
  return message;
}

/**
 * Mint an invite.
 *
 * The token is NOT set here and must not be: `invites_token_guard` overwrites
 * whatever arrives with a server-generated uuid, which is the whole point. The
 * same is true of created_by. What this action decides is the role, the family
 * and the flags — the things the invitee will be, which they never get to
 * choose.
 */
export async function createInvite(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  if (!featureEnabled("invites")) return FAIL(OFF);
  if (!(await requireAdmin())) return FAIL(DENIED);

  const role = text(formData, "role");
  const fullName = text(formData, "full_name");

  if (!isRole(role)) return FAIL("Pick a role.");
  if (!fullName) return FAIL("Give the person a name — it is what they will see on the invite.");

  // Flags are normalised, not trusted: admin holds everything implicitly and a
  // parent holds nothing, so anything ticked for those roles is dropped rather
  // than stored as a value the app then has to remember to ignore.
  const submitted = Object.fromEntries(
    PERMISSION_FLAGS.map((flag) => [flag, formData.get(flag) === "on"]),
  ) as Record<(typeof PERMISSION_FLAGS)[number], boolean>;

  const supabase = await createClient();
  const { error } = await supabase.from("invites").insert({
    role: role as Role,
    // Staff and admin never belong to a family; the CHECK would refuse it.
    family_id: role === "parent" ? optional(formData, "family_id") : null,
    full_name: fullName,
    email: optional(formData, "email"),
    phone: optional(formData, "phone"),
    ...effectiveFlags(role, submitted),
    expires_at: inviteExpiryFrom(),
  });

  if (error) return FAIL(readable(error.message));

  revalidate();
  return OK("Invite created. Copy the link and send it to them.");
}

/**
 * Revoke — the answer to "that link went to the wrong person".
 *
 * A soft mark rather than a delete, so the record of who was invited and by
 * whom survives. The claim route treats revoked exactly like expired and like
 * never-existed: one message, no detail.
 */
export async function revokeInvite(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = text(formData, "id");
  if (!id) return;

  const supabase = await createClient();
  // `accepted_at is null` keeps this from "revoking" an invite someone already
  // used, which would imply their account was undone. It was not.
  await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("accepted_at", null);

  revalidate();
}

/**
 * Regenerate — a new token and a fresh 14 days, for an expired invite or a
 * link that went somewhere it should not have.
 *
 * The new token is minted by the trigger, not here. Passing a value at all
 * would be pointless — the guard overwrites it — so this sends the sentinel
 * all-zero uuid purely to make the value CHANGE, which is what the trigger
 * reads as "give me a new one". The zeroes never reach the table.
 */
export async function regenerateInvite(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const id = text(formData, "id");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("invites")
    .update({
      token: "00000000-0000-0000-0000-000000000000",
      expires_at: inviteExpiryFrom(),
      revoked_at: null,
    })
    .eq("id", id)
    .is("accepted_at", null);

  revalidate();
}
