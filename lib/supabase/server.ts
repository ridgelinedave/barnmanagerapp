import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Server Supabase client for Server Components, Route Handlers and Server
 * Actions. Uses the ANON key and the caller's session cookies, so every query
 * still runs under Row Level Security as the signed-in user.
 *
 * For the rare operation that must bypass RLS, use `lib/supabase/admin.ts`
 * (service role, server-only) — never this client.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which cannot set cookies. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
