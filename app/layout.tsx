import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import type { CSSProperties } from "react";
import "./globals.css";
import { barn } from "@/config/barn";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

/**
 * The typefaces.
 *
 * Barlow Condensed for anything that announces (screen titles, card titles,
 * board labels) and Barlow for anything that is read. Both are SIL Open Font
 * License and both are SELF-HOSTED by next/font — the files are served from
 * this origin, so there is no Google request, no third-party cookie, and the
 * installed PWA still renders correctly with no network at all.
 *
 * `display: "swap"` with the fallback metrics next/font computes means text is
 * never invisible while the face loads and the swap does not shift the layout.
 *
 * Geist was here before. It is a fine typeface and it is also the typeface
 * every Next.js app ships with by default, which is most of why this app read
 * as generated rather than made.
 */
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: barn.name,
  description: `${barn.name} — barn management for families and staff.`,
  applicationName: barn.name,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: barn.shortName,
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  // Matches the manifest and the splash images, so an installed app opens on
  // the crest's dark field rather than flashing cream first.
  themeColor: barn.pwa.launchBackground,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * iOS launch images.
 *
 * Safari matches these by exact device metrics — there is no scaling
 * fallback, which is why the list is explicit rather than a single image. The
 * sizes come from scripts/generate-brand-assets.mjs, which writes the same
 * list to public/splash/index.json.
 */
const APPLE_SPLASH = [
  { w: 1170, h: 2532, cssW: 390, cssH: 844, ratio: 3 },
  { w: 1179, h: 2556, cssW: 393, cssH: 852, ratio: 3 },
  { w: 1284, h: 2778, cssW: 428, cssH: 926, ratio: 3 },
  { w: 1290, h: 2796, cssW: 430, cssH: 932, ratio: 3 },
  { w: 1125, h: 2436, cssW: 375, cssH: 812, ratio: 3 },
  { w: 828, h: 1792, cssW: 414, cssH: 896, ratio: 2 },
  { w: 750, h: 1334, cssW: 375, cssH: 667, ratio: 2 },
];

/**
 * Brand tokens flow from /config/barn.ts into CSS, not the other way round.
 *
 * This is the whole re-skin surface: a second barn edits its config and every
 * card, chip, header and empty state follows. Nothing downstream may hard-code
 * a colour — globals.css maps these into Tailwind theme tokens and components
 * only ever name the token.
 */
const brandVars = {
  "--brand-gold": barn.brand.gold,
  "--brand-gold-deep": barn.brand.goldDeep,
  "--brand-cream": barn.brand.cream,
  "--brand-ink": barn.brand.ink,
  "--brand-charcoal": barn.brand.charcoal,
  "--brand-forest": barn.brand.forest,
  "--brand-danger": barn.brand.danger,
  "--brand-muted": barn.brand.muted,
  "--brand-line": barn.brand.line,
  "--brand-gold-soft": barn.brand.goldSoft,
  "--brand-forest-soft": barn.brand.forestSoft,
  "--brand-danger-soft": barn.brand.dangerSoft,
  "--brand-sunk": barn.brand.sunk,
} as CSSProperties;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      style={brandVars}
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <head>
        {APPLE_SPLASH.map((s) => (
          <link
            key={`${s.w}x${s.h}`}
            rel="apple-touch-startup-image"
            href={`/splash/splash-${s.w}x${s.h}.png`}
            media={`(device-width: ${s.cssW}px) and (device-height: ${s.cssH}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body className="font-sans text-body min-h-full flex flex-col">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
