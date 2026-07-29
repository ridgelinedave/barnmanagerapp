import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv, supabaseConfigured } from "@/lib/env";
import { devRoleFromRequestCookie } from "@/lib/dev-role";

/**
 * Routes reachable without a session.
 *
 * `/api/ical` is here because a calendar client cannot sign in — it just
 * fetches a URL. The unguessable per-user token in the path is what
 * authenticates the request, and the route handler re-implements the
 * visibility rules itself, since RLS cannot help a request with no session.
 */
const PUBLIC_PATHS = ["/sign-in", "/auth", "/api/ical"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase auth cookies on every request and gates the app shell.
 *
 * Two escape hatches, both deliberate:
 *  - If Supabase is not configured yet (Phase 0 placeholder env), the shell is
 *    reachable so the role shells can be reviewed.
 *  - In a non-production build, a `dev_role` cookie set by the temporary dev
 *    role switcher also lets the shell render. `devRoleFromRequestCookie`
 *    returns null in production, so this cannot leak into a real deployment.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  if (!supabaseConfigured()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: getUser() must be called here — it revalidates the token with
  // Supabase and refreshes the cookies. Do not replace it with getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hasDevRole = devRoleFromRequestCookie(request.cookies.get("dev_role")?.value) !== null;

  if (!user && !isPublicPath(pathname) && !hasDevRole) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
