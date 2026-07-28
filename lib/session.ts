import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { DEV_ROLE_COOKIE, DEV_ROLE_NONE, devRoleFromRequestCookie } from "@/lib/dev-role";
import type { Profile, Role } from "@/lib/types";

export type Viewer = {
  /** Role used to render the shell. */
  role: Role;
  /** The signed-in user's profile row, when there is one. */
  profile: Profile | null;
  email: string | null;
  /** True when `role` came from the dev switcher rather than a real profile. */
  isDevRole: boolean;
};

export type ViewerState =
  | { status: "viewer"; viewer: Viewer }
  /** Signed out, and no dev role selected. */
  | { status: "anonymous" }
  /** Signed in, but no `profiles` row exists — the barn owner must create one. */
  | { status: "no-profile"; email: string | null };

/**
 * Resolves who is looking at the app and which tab bar they get.
 *
 * Order matters: a real signed-in profile always wins. The dev role cookie is
 * only consulted when there is no profile to read, and it is ignored entirely
 * in production (see `lib/dev-role.ts`).
 */
export const getViewer = cache(async function getViewer(): Promise<ViewerState> {
  const cookieStore = await cookies();
  const devRole = devRoleFromRequestCookie(cookieStore.get(DEV_ROLE_COOKIE)?.value);

  if (supabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle<Profile>();

      if (profile) {
        return {
          status: "viewer",
          viewer: {
            role: profile.role,
            profile,
            email: user.email ?? null,
            isDevRole: false,
          },
        };
      }

      return { status: "no-profile", email: user.email ?? null };
    }
  }

  if (devRole === DEV_ROLE_NONE) {
    return { status: "no-profile", email: null };
  }

  if (devRole) {
    return {
      status: "viewer",
      viewer: { role: devRole, profile: null, email: null, isDevRole: true },
    };
  }

  return { status: "anonymous" };
});
