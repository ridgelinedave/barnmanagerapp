import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * SERVICE ROLE client — bypasses Row Level Security entirely.
 *
 * SECURITY RULES (enforced by `scripts/check-service-key-leak.mjs` in CI):
 *  - This module is `server-only`. Importing it from a client component is a
 *    build error, by design.
 *  - It may only be used from Route Handlers, Server Actions and scheduled
 *    server jobs — never to serve data straight to a browser without first
 *    applying the same access rules the RLS policies would have applied.
 *  - The key never appears in `NEXT_PUBLIC_*` and is never returned to a client.
 *
 * Phase 0 has no server-side privileged operations. This exists so later phases
 * (QBO sync, cron materialization, backfill expiry) have one audited entry point
 * instead of ad-hoc clients.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient() requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
        "See .env.example.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
