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
  themeColor: barn.brand.gold,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Brand tokens flow from /config/barn.ts into CSS, not the other way round. */
const brandVars = {
  "--brand-gold": barn.brand.gold,
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
      <body className="font-sans min-h-full flex flex-col">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
