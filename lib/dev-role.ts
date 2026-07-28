import { isRole, type Role } from "@/lib/types";

/**
 * TEMPORARY (Phase 0 only) — dev role switcher.
 *
 * Lets the role shells be reviewed before auth is wired to a live Supabase
 * project. It is a *display* override only: it never affects a database query,
 * because every query runs under RLS as the real signed-in user (or as nobody).
 * Faking this cookie grants no data access.
 *
 * It is hard-disabled in production builds. DELETE THIS FILE and its component
 * once real auth is in use — see README "Part 2: connect Supabase".
 */
export const DEV_ROLE_COOKIE = "dev_role";

/**
 * "none" previews the signed-in-but-no-profile state, so that screen can be
 * checked without creating a broken user in the database.
 */
export const DEV_ROLE_NONE = "none";

export type DevRoleSelection = Role | typeof DEV_ROLE_NONE;

export function devRoleSwitcherEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isDevRoleSelection(value: unknown): value is DevRoleSelection {
  return value === DEV_ROLE_NONE || isRole(value);
}

export function devRoleFromRequestCookie(value: string | undefined): DevRoleSelection | null {
  if (!devRoleSwitcherEnabled()) return null;
  if (!value) return null;
  return isDevRoleSelection(value) ? value : null;
}
