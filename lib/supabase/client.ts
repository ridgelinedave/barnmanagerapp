"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/**
 * Browser Supabase client.
 *
 * SECURITY: this holds the ANON / publishable key only. Row Level Security is
 * the entire client-side security model — anything the browser can read, it is
 * allowed to read. The service role key must never appear in this file or in
 * anything it imports.
 */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
