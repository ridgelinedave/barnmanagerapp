import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { featureEnabled, type BarnFeatureFlag } from "@/config/barn";

/**
 * Does the signed-in login have Academy access? (migration 0032)
 *
 * The DATABASE decides — public.academy_access(), the same function every
 * Academy row's RLS uses — so the menu and the data can never disagree. This
 * only asks it, once per request, to decide whether the Academy ENTRY shows:
 * a login without access does not see the Academy at all (and, if it goes to
 * the address anyway, RLS returns nothing).
 *
 * While the `academyAccess` flag is off (0032 not yet applied) the answer is
 * always yes — the Academy behaves exactly as it did before.
 */
export const hasAcademyAccess = cache(async (): Promise<boolean> => {
  if (!featureEnabled("academyAccess")) return true;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("academy_access");
  return !error && data === true;
});

/**
 * Feature flags as THIS login's navigation sees them: the barn's flags, with
 * the Academy switched off for a login without access. Hand this to
 * sidebarFor / lessonSegments instead of featureEnabled.
 */
export async function navFlags(): Promise<(flag: BarnFeatureFlag) => boolean> {
  const academy = await hasAcademyAccess();
  return (flag) => (flag === "learning" ? featureEnabled("learning") && academy : featureEnabled(flag));
}
