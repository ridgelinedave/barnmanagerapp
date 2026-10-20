"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS_BY_ROLE } from "@/lib/nav";
import type { Role } from "@/lib/types";

/**
 * The bottom tab bar. White, with a hairline above it.
 *
 * It was charcoal to match the old dark header. Both are white now — the app
 * is one continuous light surface, and the accent is the only colour on it.
 *
 * THE ACTIVE TAB (2026-10-19): a 2px oxblood rule along the TOP edge of the
 * tab (accent, 11.18:1 on white) plus an oxblood label (accent-text, 15.85:1)
 * and a heavier icon stroke. The tinted pill behind the icon is gone — a
 * rounded wash of colour under a glyph was the generated look.
 *
 * INACTIVE: icons lighter (muted at 75%, 3.57:1 on white — above the 3:1 a
 * meaningful glyph needs), labels stay `muted` (6.34:1). A label you cannot
 * read is a nav you navigate by position, so the LABEL is never the light one.
 *
 * Max 5 tabs; every target is 48px tall (44px floor) and a full fifth of the
 * width. Icons 20px, labels the condensed face at 12px.
 *
 * MOBILE SHELL ONLY. From the `lg` breakpoint the desktop sidebar takes over
 * (components/Sidebar.tsx) and this bar is not rendered visibly at all.
 */
export function TabBar({ role }: { role: Role }) {
  const pathname = usePathname();
  const tabs = TABS_BY_ROLE[role];

  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden"
    >
      <ul className="mx-auto flex max-w-screen-sm">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="relative flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5"
              >
                {active && <span aria-hidden="true" className="absolute inset-x-3 -top-px h-0.5 bg-accent" />}
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={active ? 2 : 1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`size-5 ${active ? "text-accent-text" : "text-muted/75"}`}
                  >
                    <path d={tab.icon} />
                  </svg>
                <span
                  className={`truncate font-condensed text-[0.75rem] leading-none ${
                    active ? "font-semibold text-accent-text" : "font-medium text-muted"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
