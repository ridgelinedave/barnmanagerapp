import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { inviteStatus, type Invite } from "@/lib/invites";

/**
 * Reading an invite by its token, with NO SESSION.
 *
 * ⚠ THIS RUNS WITH THE SERVICE ROLE, so RLS is not protecting it. It has to
 * be that way — the person using an invite is by definition signed out, and
 * `anon` holds no policy on `invites` at all (deliberately: a readable token is
 * an account someone else can create).
 *
 * That means the checks below ARE the boundary, exactly like the iCal feed.
 * The rule is: a token is only ever exchanged for a PENDING invite. Every
 * other state — accepted, revoked, expired, malformed, nonexistent — returns
 * null, and every caller turns null into the same single sentence.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ClaimableInvite = Invite & { familyName: string | null };

export async function loadPendingInvite(token: string): Promise<ClaimableInvite | null> {
  // A malformed token never reaches the database. Not for safety — the query
  // is parameterised — but so a scan of junk values costs nothing.
  if (!UUID.test(token)) return null;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;

  const invite = data as Invite;

  // Status is derived here rather than filtered in the query on purpose: the
  // same function decides it everywhere, so the route, the page and the panel
  // can never disagree about what "expired" means.
  if (inviteStatus(invite) !== "pending") return null;

  let familyName: string | null = null;
  if (invite.family_id) {
    const { data: family } = await supabase
      .from("families")
      .select("name")
      .eq("id", invite.family_id)
      .maybeSingle();
    familyName = (family?.name as string | undefined) ?? null;
  }

  return { ...invite, familyName };
}
