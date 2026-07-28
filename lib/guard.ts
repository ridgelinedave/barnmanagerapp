import "server-only";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { roleCanAccess } from "@/lib/nav";
import type { Role } from "@/lib/types";

/**
 * Resolves the viewer's role, or redirects away from the shell entirely.
 *
 * Mirrors `app/(app)/layout.tsx` on purpose. A layout and its page render
 * concurrently in the App Router, so a page cannot assume the layout already
 * bounced a role-less user — it has to decide for itself. Without this, a user
 * with no `profiles` row would briefly render a tab-less, empty shell.
 */
async function resolveRole(): Promise<Role> {
  const state = await getViewer();
  if (state.status === "anonymous") redirect("/sign-in");
  if (state.status === "no-profile") redirect("/account-pending");
  return state.viewer.role;
}

/**
 * Keeps a role out of another role's tabs (a parent hitting /manage lands on
 * /home). This is navigation hygiene, not the security boundary — RLS is.
 */
export async function requireTab(pathname: string): Promise<Role> {
  const role = await resolveRole();
  if (!roleCanAccess(role, pathname)) redirect("/home");
  return role;
}

/** Viewer role for tabs shared by several roles (Home, More, Schedule, Shows). */
export async function currentRole(): Promise<Role> {
  return resolveRole();
}
