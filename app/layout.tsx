import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { CSSProperties } from "react";
import "./globals.css";
import { barn } from "@/config/barn";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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

/** Brand tokens flow from /config/barn.ts into CSS, not the other way round. */
const brandVars = {
  "--brand-gold": barn.brand.gold,
  "--brand-gold-deep": barn.brand.goldDeep,
  "--brand-cream": barn.brand.cream,
  "--brand-ink": barn.brand.ink,
} as CSSProperties;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      style={brandVars}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
      <body className="font-sans min-h-full flex flex-col">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
