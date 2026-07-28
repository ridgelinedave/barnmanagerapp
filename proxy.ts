import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next 16 renamed the `middleware` file convention to `proxy`. Same behaviour,
 * same `config.matcher` — see https://nextjs.org/docs/messages/middleware-to-proxy
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the PWA files and static assets.
     * The service worker and manifest must stay reachable without a session.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|brand/|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
