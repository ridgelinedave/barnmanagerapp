/**
 * Environment access, split by trust boundary.
 *
 * SECURITY: `SUPABASE_SERVICE_ROLE_KEY` is intentionally NOT exported from any
 * module that a client component can import. It is read only inside
 * `lib/supabase/admin.ts`, which is marked server-only. Adding a read of it here
 * would make it reachable from a client bundle. Do not.
 */

/** Public (anon/publishable) values — safe to ship to the browser. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /**
   * Dev-only role switcher. Never honoured in a production build (see
   * `lib/dev-role.ts`), regardless of what this is set to.
   */
  devRoleSwitcher: process.env.NEXT_PUBLIC_DEV_ROLE_SWITCHER === "true",
};

/**
 * True when the public Supabase values look like real credentials rather than
 * the placeholders in `.env.local`. Lets the app render a helpful "not connected
 * yet" state instead of throwing during Phase 0.
 */
export function supabaseConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey } = publicEnv;
  if (!supabaseUrl || !supabaseAnonKey) return false;
  if (supabaseUrl.includes("placeholder")) return false;
  if (supabaseAnonKey.includes("placeholder")) return false;
  return true;
}
