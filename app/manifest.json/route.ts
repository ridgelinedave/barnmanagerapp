import { NextResponse } from "next/server";
import { barn } from "@/config/barn";

/**
 * The PWA manifest, served at /manifest.json.
 *
 * Generated from /config/barn.ts rather than kept as a static file, so a clone
 * only has to edit the config — name, colours and icons follow automatically.
 *
 * (Next's built-in `app/manifest.ts` convention would serve this at
 * /manifest.webmanifest; the Phase 0 brief calls for /manifest.json, so it is a
 * route handler instead.)
 */
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    {
      id: `/?barn=${barn.id}`,
      name: barn.name,
      short_name: barn.shortName,
      description: `${barn.name} — lessons, schedules and barn news for families and staff.`,
      start_url: "/home",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: barn.brand.cream,
      theme_color: barn.brand.gold,
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
