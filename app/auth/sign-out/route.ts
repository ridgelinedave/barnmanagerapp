import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { DEV_ROLE_COOKIE } from "@/lib/dev-role";

/** POST-only so a stray link or prefetch can never sign someone out. */
export async function POST(request: NextRequest) {
  if (supabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
  response.cookies.delete(DEV_ROLE_COOKIE);
  return response;
}
