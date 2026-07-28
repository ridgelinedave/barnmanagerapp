import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE callback. Supabase redirects here with `?code=...` after a magic link
 * (or any OAuth provider added later). Exchanges the code for a session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=link_invalid`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/** Only ever redirect to a same-origin path — never to an attacker-supplied URL. */
function safeNext(value: string | null): string {
  if (!value) return "/home";
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  return value;
}
