import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Token-hash callback, for Supabase email templates that use
 * `{{ .TokenHash }}` instead of `{{ .ConfirmationURL }}`.
 *
 * Both this and /auth/callback are wired so either template style works out of
 * the box in Part 2. See README → "Part 2: connect Supabase".
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_token`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=link_invalid`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

function safeNext(value: string | null): string {
  if (!value) return "/home";
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}
