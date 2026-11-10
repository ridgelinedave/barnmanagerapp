"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadPendingInvite } from "@/lib/invites-server";
import { INVITE_INVALID_MESSAGE } from "@/lib/invites";
import { featureEnabled } from "@/config/barn";

/**
 * Claiming an invite — the one place in this app that creates a login.
 *
 * ⚠ THIS RUNS UNAUTHENTICATED AND WITH THE SERVICE ROLE. RLS is not protecting
 * anything here; the checks below ARE the security boundary. Same shape as the
 * iCal feed, and the same warning applies: if you add a field, add its rule.
 *
 * THE FOUR RULES, in the order they are enforced:
 *
 *  1. THE INVITE IS THE ONLY SOURCE OF IDENTITY. role, family_id and the three
 *     manage_* flags are read from the invite ROW and from nowhere else. This
 *     action never reads them from `formData`, so an invitee posting
 *     `role=admin` is not rejected — they are simply not consulted. The only
 *     things the claimant supplies are an email and a password.
 *
 *  2. ONE TOKEN, ONE ACCOUNT. The invite is CLAIMED with a conditional update
 *     that only matches a still-pending row. Two simultaneous submits race on
 *     that single statement; exactly one wins and the other is told the link is
 *     no longer valid. The claim is released if account creation then fails, so
 *     a mistyped password does not burn the invite.
 *
 *  3. AN EXISTING EMAIL IS REFUSED, NEVER LINKED. Attaching an invite to an
 *     account that already exists would let anyone holding a link escalate the
 *     role of an account they do not own.
 *
 *  4. ONE MESSAGE FOR EVERY BAD TOKEN. Expired, revoked, used and nonexistent
 *     are indistinguishable in the response. Telling someone "that invite was
 *     already used" confirms both that the token was real and that an account
 *     exists to go after.
 */
export type ClaimState = { error: string | null };

const FAIL = (error: string): ClaimState => ({ error });

/** Supabase's own floor is 6. Eight, because this is a barn's whole roster. */
const MIN_PASSWORD = 8;

export async function claimInvite(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  if (!featureEnabled("invites")) return FAIL(INVITE_INVALID_MESSAGE);

  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  // --- 1. The invite, and only the invite -----------------------------------
  const invite = await loadPendingInvite(token);
  if (!invite) return FAIL(INVITE_INVALID_MESSAGE);

  // The barn may already know the email; if so it is fixed and the form shows
  // it read-only. Otherwise the claimant supplies one.
  const email = (invite.email ?? String(formData.get("email") ?? "")).trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return FAIL("Enter the email address you want to sign in with.");
  }
  if (password.length < MIN_PASSWORD) {
    return FAIL(`Pick a password of at least ${MIN_PASSWORD} characters.`);
  }
  if (password !== confirm) {
    return FAIL("The two passwords don't match.");
  }

  const admin = createAdminClient();

  // --- 2. Claim it, atomically ----------------------------------------------
  // The conditional update IS the lock. Re-stating pending here rather than
  // trusting the read above closes the gap between the two: a revoke landing in
  // between makes this match zero rows.
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("invites")
    .update({ accepted_at: now })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select()
    .maybeSingle();

  if (claimError || !claimed) return FAIL(INVITE_INVALID_MESSAGE);

  /** Hand the invite back, so a failed attempt does not consume it. */
  const release = async () => {
    await admin.from("invites").update({ accepted_at: null }).eq("id", invite.id);
  };

  // --- 3. Create the login ---------------------------------------------------
  // `email_confirm: true` because the invite link IS the verification: an admin
  // handed it to a person they know. Sending a second confirmation email would
  // need the email service that is still deferred, and would prove less.
  //
  // A duplicate email is detected by createUser itself rather than by scanning
  // the user list first — the scan would be a paginated read of every user in
  // the project on every claim, and it would still be a race. This check is
  // authoritative and atomic.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: invite.full_name },
  });

  if (createError || !created?.user) {
    await release();

    const message = createError?.message ?? "";
    const duplicate =
      (createError as { code?: string } | null)?.code === "email_exists" ||
      /already (been )?registered|already exists/i.test(message);

    return FAIL(
      duplicate
        ? "That email already has an account here — contact the barn."
        : "That didn't work. Check the email and password and try again.",
    );
  }

  // --- 4. Create the profile, FROM THE INVITE --------------------------------
  // Every value below comes from `invite`. None comes from `formData`.
  const { error: profileError } = await admin.from("profiles").insert({
    user_id: created.user.id,
    role: invite.role,
    full_name: invite.full_name,
    phone: invite.phone,
    family_id: invite.role === "parent" ? invite.family_id : null,
    manage_shows: invite.manage_shows,
    manage_schedule: invite.manage_schedule,
    manage_horses: invite.manage_horses,
  });

  if (profileError) {
    // Roll the login back too. An auth user with no profile is a person who can
    // sign in and reach nothing but /account-pending, for ever, with no way to
    // retry — worse than a clean failure.
    await admin.auth.admin.deleteUser(created.user.id);
    await release();
    return FAIL("Your account could not be set up. Ask the barn to send a fresh invite.");
  }

  // --- 4b. The invite's tags, FROM THE INVITE (migration 0031) ---------------
  // Rule 1 again: read from invite_tags for THIS invite id, never from
  // `formData`. They are what the admin chose when she made the invite — the
  // Academy access she promised. If they cannot be copied, undo the account
  // (deleting the user cascades its profile) and release the invite, so the
  // person retries into the access they were promised rather than landing
  // without it.
  const { data: inviteTags, error: tagReadError } = await admin
    .from("invite_tags")
    .select("tag_id")
    .eq("invite_id", invite.id);
  const tagIds = (inviteTags ?? []).map((t) => t.tag_id as string);
  // A missing table (0031 not applied yet) means no invite has tags — never a
  // reason to refuse every claim. Any other read error is.
  const tableMissing = tagReadError?.code === "PGRST205" || tagReadError?.code === "42P01";
  let tagError = tableMissing ? null : tagReadError;
  if (!tagError && tagIds.length) {
    const { data: profile } = await admin.from("profiles").select("id").eq("user_id", created.user.id).single();
    const { error } = await admin
      .from("profile_tags")
      .insert(tagIds.map((tag_id) => ({ tag_id, profile_id: profile?.id, added_by: invite.created_by ?? null })));
    tagError = error;
  }
  if (tagError) {
    await admin.auth.admin.deleteUser(created.user.id);
    await release();
    return FAIL("Your account could not be set up. Ask the barn to send a fresh invite.");
  }

  // --- 5. Sign them in -------------------------------------------------------
  // Through the COOKIE-BOUND client, not the admin one: this is the call that
  // writes the session cookies. A failure here is not fatal — the account
  // exists and the invite is used — so they are sent to sign in normally
  // rather than being told something went wrong.
  const session = await createClient();
  const { error: signInError } = await session.auth.signInWithPassword({ email, password });

  // redirect() throws by design, so it must sit outside every try/catch above.
  redirect(signInError ? "/sign-in" : "/home");
}
